import { z } from "npm:zod@4";
import { can } from "../../../packages/shared/src/constants/permissions.ts";
import type { Role } from "../../../packages/shared/src/constants/roles.ts";
import { PLATFORM_IDS, PLATFORM_LABELS } from "../../../packages/shared/src/platforms/catalog.ts";
import { type DataPort, type SummaryRow } from "./data.ts";

/**
 * Etapa 40 — ferramentas do MCP (primeira versão: SÓ LEITURA).
 * Cada ferramenta usa uma consulta que já existe no Backstage Flow, com o login da própria pessoa.
 * Nada aqui escreve, apaga ou muda algo no CRM, nas contas de anúncio ou nas integrações.
 */

export const MCP_NAME = "backstage-flow";
export const MCP_VERSION = "1.5.0";
export const MAX_DAYS = 400;

export interface Caller {
  id: string;
  name: string;
  role: Role;
}

export interface ToolContext {
  user: Caller;
  data: DataPort;
  now: () => Date;
  tools: string[];
  /** Permissões da pessoa na Central de Operações (vêm do banco). */
  ops: readonly string[];
}

export class ToolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export interface ToolSpec {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  /** Quem vê a ferramenta: papel do CRM e permissões da Central (a regra de verdade continua no banco). */
  allowed: (role: Role, ops: readonly string[]) => boolean;
  /** Ferramenta que muda algo no CRM (o cliente de IA pede confirmação antes de usar). */
  write?: boolean;
  /** Mudança com efeito maior (desativar, arquivar, mover tarefas): reversível, mas pede atenção. */
  destructive?: boolean;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

export const uuid = z.string().uuid();
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");
const ids = (what: string) => z.array(uuid).min(1).max(50).optional().describe(`Até 50 IDs de ${what} (opcional).`);

export const spDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
export const spDateTime = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(d);
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const money = (micros: number | null | undefined) => (micros == null ? null : Math.round(Number(micros) / 10_000) / 100);
const num = (v: number | null | undefined) => (v == null ? null : Number(v));
const ratio = (a: number | null, b: number | null, mult = 1) => (a == null || !b ? null : Math.round((a / b) * mult * 100) / 100);

/** Período validado: datas reais, início ≤ fim, até 400 dias, sem futuro distante. */
export function period(from: unknown, to: unknown, now: Date): { from: string; to: string } {
  const today = spDate(now);
  const f = typeof from === "string" ? from : addDays(today, -29);
  const t = typeof to === "string" ? to : today;
  const valid = (s: string) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!valid(f) || !valid(t)) throw new ToolError("INVALID_INPUT", "Data inválida. Use o formato AAAA-MM-DD.");
  if (f > t) throw new ToolError("INVALID_INPUT", "A data de início precisa ser antes da data de fim.");
  if (t > addDays(today, 1)) throw new ToolError("INVALID_INPUT", "A data de fim não pode ser no futuro.");
  const days = (Date.parse(t) - Date.parse(f)) / 86_400_000 + 1;
  if (days > MAX_DAYS) throw new ToolError("INVALID_INPUT", `Período longo demais (máximo ${MAX_DAYS} dias).`);
  return { from: f, to: t };
}

/** Uma linha por moeda (BRL e USD nunca se somam). Indicadores calculados só com números reais. */
export function summaryOut(rows: SummaryRow[]) {
  return rows.map((r) => {
    const spend = money(r.spend_micros);
    const impressions = num(r.impressions);
    const clicks = num(r.clicks);
    const leads = num(r.leads);
    return {
      moeda: r.currency,
      investimento: spend,
      impressoes: impressions,
      cliques: clicks,
      cliques_no_link: num(r.link_clicks),
      leads,
      mensagens: num(r.messages),
      conversoes: num(r.conversions),
      valor_das_conversoes: money(r.conversion_value_micros),
      ctr_pct: ratio(clicks, impressions, 100),
      cpc: ratio(spend, clicks),
      cpm: ratio(spend, impressions, 1000),
      custo_por_lead: ratio(spend, leads),
      contas_com_dados: num(r.accounts),
      ...(r.campaigns != null ? { campanhas_com_dados: num(r.campaigns) } : {}),
      ...(r.last_synced_at ? { ultima_sincronizacao: r.last_synced_at } : {}),
    };
  });
}

const NO_DATA = "Informação não disponível pela API";
const READ_NAMES = new Set(["backstage_status", "backstage_capabilities", "backstage_list_clients", "backstage_get_metrics", "backstage_list_alerts",
  "backstage_get_campaign", "backstage_mcp_health", "backstage_central_reference", "backstage_list_tasks", "backstage_get_task", "backstage_get_alert", "backstage_alert_assignees", "backstage_list_alert_rules",
  "backstage_list_onboarding", "backstage_get_client_ops", "backstage_commercial_reference", "backstage_list_leads", "backstage_get_lead",
  "backstage_meeting_reference", "backstage_list_meetings", "backstage_get_meeting", "backstage_list_envios", "backstage_get_envio"]);

const internal = (role: Role) => can(role, "internal.view");

export const TOOLS: ToolSpec[] = [
  {
    name: "backstage_status",
    title: "Estado do Backstage Flow",
    description: "Mostra se o Backstage Flow e o servidor MCP estão funcionando: banco de dados, última sincronização visível para você e horário da consulta. Não mostra segredos.",
    input: {},
    allowed: () => true,
    async run(ctx) {
      const started = Date.now();
      let banco: Record<string, unknown>;
      try {
        await ctx.data.ping();
        banco = { estado: "funcionando", tempo_ms: Date.now() - started };
      } catch {
        banco = { estado: "indisponível" };
      }
      let sync: unknown = NO_DATA;
      if (internal(ctx.user.role)) {
        const s = await ctx.data.lastSync().catch(() => null);
        if (s) sync = { quando: s.finished_at, situacao: s.status };
      }
      const now = ctx.now();
      return {
        sistema: "Backstage Flow",
        servidor_mcp: { nome: MCP_NAME, versao: MCP_VERSION, estado: "funcionando" },
        banco,
        ultima_sincronizacao: sync,
        consultado_em: now.toISOString(),
        consultado_em_brasilia: spDateTime(now),
        voce: { nome: ctx.user.name, papel: ctx.user.role },
      };
    },
  },
  {
    name: "backstage_capabilities",
    title: "O que você pode usar",
    description: "Lista os módulos do Backstage Flow liberados para o seu usuário e as ferramentas MCP disponíveis para você. Só mostra o que já existe e funciona.",
    input: {},
    allowed: () => true,
    async run(ctx) {
      const r = ctx.user.role;
      const ops = await ctx.data.opsPermissions().catch(() => [] as string[]);
      const modules = [
        ["Dashboard e métricas (Meta Ads e Google Ads)", can(r, "internal.view")],
        ["Clientes", can(r, "clients.view")],
        ["Campanhas", can(r, "internal.view")],
        ["Monitoramento e alertas", can(r, "monitor.view")],
        ["Relatórios", can(r, "reports.generate")],
        ["Tracking", can(r, "tracking.view")],
        ["Inteligência de Resultados", can(r, "results.view")],
        ["Central de Operações", ops.includes("ops.access")],
        ["Envios semanais (grupos de WhatsApp)", ops.includes("ops.envios")],
        ["Administração de usuários", can(r, "users.manage")],
      ] as const;
      return {
        papel: r,
        modulos_liberados_no_crm: modules.filter(([, ok]) => ok).map(([m]) => m),
        ferramentas_mcp: ctx.tools,
        modo: ctx.tools.some((t) => !READ_NAMES.has(t)) ? "leitura e, com as suas permissões, escrita na Central de Operações (tarefas, clientes, Comercial, reuniões, envios semanais) e no Monitoramento" : "somente leitura",
      };
    },
  },
  {
    name: "backstage_list_clients",
    title: "Clientes liberados para você",
    description: "Lista os clientes que você pode ver no Backstage Flow (nome, situação, fuso e contas de anúncio vinculadas). Sem dados pessoais (CNPJ, telefone, e-mail). Paginado.",
    input: {
      busca: z.string().trim().min(1).max(80).optional().describe("Parte do nome do cliente."),
      situacao: z.enum(["ativo", "encerrado"]).optional().describe("Filtrar pela situação do cliente."),
      limite: z.number().int().min(1).max(100).default(50).describe("Quantos por página (1 a 100)."),
      pagina: z.number().int().min(1).max(1000).default(1).describe("Página (começa em 1)."),
    },
    allowed: internal,
    async run(ctx, a) {
      const limit = (a.limite as number) ?? 50;
      const page = (a.pagina as number) ?? 1;
      const { rows, total } = await ctx.data.listClients({
        search: (a.busca as string) ?? null, status: (a.situacao as string) ?? null, limit, offset: (page - 1) * limit,
      });
      const accounts = await ctx.data.accounts(rows.map((c) => c.id));
      return {
        total,
        pagina: page,
        por_pagina: limit,
        tem_mais: page * limit < total,
        clientes: rows.map((c) => ({
          id: c.id,
          nome: c.name,
          situacao: c.status,
          fuso: c.timezone,
          demonstracao: c.is_demo,
          contas_de_anuncio: accounts.filter((x) => x.client_id === c.id).map((x) => ({
            id: x.id, nome: x.name, plataforma: PLATFORM_LABELS[x.platform_id] ?? x.platform_id, moeda: x.currency, situacao: x.status,
          })),
        })),
      };
    },
  },
  {
    name: "backstage_get_metrics",
    title: "Métricas de anúncios",
    description:
      "Resumo de métricas reais (investimento, impressões, cliques, leads, mensagens, conversões) dos clientes que você pode ver, por período. Filtros opcionais: clientes, plataformas, contas e campanhas. Uma linha por moeda (BRL e USD nunca são somados). Padrão: últimos 30 dias (horário de Brasília). Máximo 400 dias.",
    input: {
      data_inicio: date.optional().describe("Início (AAAA-MM-DD). Padrão: 30 dias atrás."),
      data_fim: date.optional().describe("Fim (AAAA-MM-DD). Padrão: hoje."),
      cliente_ids: ids("clientes"),
      plataformas: z.array(z.enum(PLATFORM_IDS as [string, ...string[]])).min(1).max(5).optional().describe("Ex.: [\"meta\"] ou [\"google\"]."),
      conta_ids: ids("contas de anúncio"),
      campanha_ids: ids("campanhas"),
    },
    allowed: internal,
    async run(ctx, a) {
      const p = period(a.data_inicio, a.data_fim, ctx.now());
      const rows = await ctx.data.summary({
        from: p.from, to: p.to,
        clientIds: (a.cliente_ids as string[]) ?? null, platforms: (a.plataformas as string[]) ?? null,
        accountIds: (a.conta_ids as string[]) ?? null, campaignIds: (a.campanha_ids as string[]) ?? null,
      });
      const out = summaryOut(rows.filter((r) => Number(r.spend_micros ?? 0) > 0 || Number(r.impressions ?? 0) > 0));
      return {
        periodo: { inicio: p.from, fim: p.to },
        por_moeda: out,
        observacao: out.length
          ? "Valores na moeda de cada conta; moedas diferentes ficam separadas."
          : "Nenhum dado para esses filtros (ou os itens pedidos não estão liberados para você).",
      };
    },
  },
  {
    name: "backstage_list_alerts",
    title: "Alertas do Monitoramento",
    description: "Lista os alertas do Monitoramento de Desempenho dos clientes que você pode ver (gravidade, situação, cliente, conta, campanha, métrica e variação). Padrão: só os em aberto.",
    input: {
      abertos: z.boolean().default(true).describe("true = só em aberto; false = inclui resolvidos e ignorados."),
      limite: z.number().int().min(1).max(50).default(20).describe("Quantos alertas (1 a 50)."),
    },
    allowed: (r) => can(r, "monitor.view"),
    async run(ctx, a) {
      const rows = await ctx.data.alerts((a.abertos as boolean) ?? true, (a.limite as number) ?? 20);
      const pick = ["id", "severity", "status", "kind", "metric", "level", "platform_id", "client_name", "account_name", "campaign_name", "ad_name",
        "currency", "current_value", "previous_value", "variation_pct", "period_from", "period_to", "first_detected_at", "last_detected_at",
        "explanation", "resolved_at", "assignee_name"];
      return {
        total: rows.length,
        alertas: rows.map((r) => Object.fromEntries(pick.filter((k) => r[k] != null).map((k) => [k, r[k]]))),
      };
    },
  },
  {
    name: "backstage_get_campaign",
    title: "Detalhes de uma campanha",
    description: "Mostra uma campanha (nome, status, objetivo, orçamento, datas, cliente e conta) e os números do período, se você tiver acesso à conta dela. Só leitura: não edita a campanha.",
    input: {
      campanha_id: uuid.describe("ID da campanha no Backstage Flow (veja em backstage_get_metrics ou no CRM)."),
      data_inicio: date.optional().describe("Início (AAAA-MM-DD). Padrão: 30 dias atrás."),
      data_fim: date.optional().describe("Fim (AAAA-MM-DD). Padrão: hoje."),
    },
    allowed: internal,
    async run(ctx, a) {
      const p = period(a.data_inicio, a.data_fim, ctx.now());
      const c = await ctx.data.campaign(a.campanha_id as string);
      if (!c) throw new ToolError("NOT_FOUND", "Campanha não encontrada ou não liberada para você.");
      const [client, account, rows] = await Promise.all([
        ctx.data.client(c.client_id),
        ctx.data.account(c.ad_account_id),
        ctx.data.summary({ from: p.from, to: p.to, clientIds: null, platforms: null, accountIds: null, campaignIds: [c.id] }),
      ]);
      return {
        campanha: {
          id: c.id,
          id_na_plataforma: c.external_id,
          nome: c.name,
          plataforma: PLATFORM_LABELS[c.platform_id] ?? c.platform_id,
          status: c.status,
          status_na_plataforma: c.effective_status ?? NO_DATA,
          objetivo: c.objective ?? NO_DATA,
          orcamento: c.budget_micros != null ? { valor: money(c.budget_micros), moeda: account?.currency ?? null, periodo: c.budget_period } : NO_DATA,
          estrategia_de_lance: c.bid_strategy ?? NO_DATA,
          inicio: c.start_date,
          fim: c.end_date,
          visto_na_plataforma_em: c.last_seen_at,
        },
        cliente: client ? { id: client.id, nome: client.name } : null,
        conta: account ? { id: account.id, nome: account.name, moeda: account.currency } : null,
        periodo: { inicio: p.from, fim: p.to },
        numeros_por_moeda: summaryOut(rows),
      };
    },
  },
  {
    name: "backstage_mcp_health",
    title: "Saúde do servidor MCP",
    description: "Chamadas, erros, limites atingidos e tempo médio do servidor MCP nas últimas horas. Você vê só as suas chamadas; o administrador vê as de todos.",
    input: {
      horas: z.number().int().min(1).max(168).default(24).describe("Janela em horas (1 a 168)."),
    },
    allowed: () => true,
    async run(ctx, a) {
      const h = await ctx.data.mcpHealth((a.horas as number) ?? 24);
      return { servidor_mcp: { nome: MCP_NAME, versao: MCP_VERSION, ferramentas: ctx.tools.length }, ...h };
    },
  },
];

export const READ_TOOLS = TOOLS;
