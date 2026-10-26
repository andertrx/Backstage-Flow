import { z } from "npm:zod@4";
import { can } from "../../../packages/shared/src/constants/permissions.ts";
import type { Role } from "../../../packages/shared/src/constants/roles.ts";
import { SITE } from "./ops_tools.ts";
import { date, type ToolContext, ToolError, type ToolSpec, uuid } from "./tools.ts";

/**
 * Etapa 40.3 — ferramentas do MCP no Monitoramento (tratar alertas, regras, gravidade mínima) e nos Clientes
 * da Central (onboarding: colocar no fluxo, mudar etapa, trocar AM, registrar atividade).
 * Mesmas ações do site, com o login da pessoa: o banco confere a permissão e grava o histórico (marcado "via MCP").
 * Nada é apagado.
 */

const alertId = z.number().int().positive().describe("ID do alerta (veja em backstage_list_alerts).");
const version = z.number().int().min(1).optional().describe("Versão lida em backstage_get_alert/backstage_get_client_ops.");
const monitor = (perm: "monitor.view" | "monitor.handle" | "monitor.rules" | "monitor.admin") => (r: Role) => can(r, perm);
/** Gerenciar clientes no fluxo: admin, ou quem vê clientes e atribui pessoas na Central (regra do banco). */
const manageClients = (r: Role, ops: readonly string[]) => r === "admin" || (ops.includes("ops.clients.view") && ops.includes("ops.tasks.assign"));
const clientLink = (id: string) => `${SITE}/operacoes/clientes?cliente=${id}`;

interface AlertDetail {
  alert: Record<string, unknown> & { id: number; version: number };
  can_handle: boolean;
  events: { kind: string; from_value: string | null; to_value: string | null; note: string | null; actor_name: string | null; created_at: string; data?: Record<string, unknown> | null }[];
}

async function loadAlert(ctx: ToolContext, id: number): Promise<AlertDetail> {
  const a = (await ctx.data.opsRpc("monitor_alert_detail", { p_id: id })) as AlertDetail | null;
  if (!a?.alert) throw new ToolError("NOT_FOUND", "Alerta não encontrado ou não liberado para você.");
  return a;
}

function alertOut(a: AlertDetail) {
  const k = a.alert;
  const pick = ["id", "severity", "status", "kind", "metric", "level", "platform_id", "client_name", "account_name", "campaign_name", "ad_name", "currency",
    "current_value", "previous_value", "variation_pct", "period_from", "period_to", "first_detected_at", "last_detected_at", "explanation",
    "resolved_at", "assignee_name", "task_number", "task_title", "version"];
  return {
    alerta: Object.fromEntries(pick.filter((p) => k[p] != null).map((p) => [p, k[p]])),
    voce_pode_tratar: a.can_handle,
    historico: (a.events ?? []).slice(-30).map((e) => ({
      tipo: e.kind, de: e.from_value, para: e.to_value, nota: e.note, quem: e.actor_name, quando: e.created_at,
      ...(e.data?.origem === "mcp" ? { via: "MCP" } : {}),
    })),
  };
}

interface ClientOps {
  client: { id: string; name: string; status: string };
  ops: { stage_id: string; stage_since: string; started_at: string; version: number; am_user_id: string | null; am_name: string | null; stage_pending?: unknown } | null;
  summary?: unknown;
  notes?: Record<string, unknown>[];
  timeline?: { action: string; actor: string | null; origin: string; created_at: string; task_number?: number | null; task_title?: string | null }[];
}

async function loadClient(ctx: ToolContext, id: string): Promise<ClientOps> {
  const c = (await ctx.data.opsRpc("ops_client_get", { p_client: id })) as ClientOps | null;
  if (!c?.client) throw new ToolError("NOT_FOUND", "Cliente não encontrado ou não liberado para você na Central.");
  return c;
}

function clientVersion(c: ClientOps, seen: unknown): number {
  if (!c.ops) throw new ToolError("INVALID_INPUT", "Este cliente ainda não está no fluxo operacional (use backstage_client_start).");
  if (typeof seen === "number" && seen !== c.ops.version) {
    throw new ToolError("CONFLICT", "Alguém alterou este cliente depois que você o leu. Abra de novo (backstage_get_client_ops) e repita.");
  }
  return c.ops.version;
}

function clientOut(c: ClientOps) {
  return {
    cliente: { id: c.client.id, nome: c.client.name, situacao: c.client.status },
    fluxo: c.ops
      ? { etapa_id: c.ops.stage_id, na_etapa_desde: c.ops.stage_since, no_fluxo_desde: c.ops.started_at, versao: c.ops.version,
          account_manager: c.ops.am_name, account_manager_id: c.ops.am_user_id, pendencias_da_etapa: c.ops.stage_pending ?? null }
      : "Fora do fluxo operacional",
    resumo: c.summary ?? null,
    atividades: (c.notes ?? []).slice(0, 15).map((n) => ({
      tipo: n.type_name, titulo: n.title, descricao: n.description, quando: n.happened_at, responsavel: n.responsible, proximo_passo: n.next_step, autor: n.author,
    })),
    historico: (c.timeline ?? []).slice(0, 30).map((t) => ({
      acao: t.action, quem: t.actor, origem: t.origin === "mcp" ? "via MCP" : t.origin, quando: t.created_at, tarefa: t.task_number ?? null,
    })),
    link: clientLink(c.client.id),
  };
}

export const MONITOR_TOOLS: ToolSpec[] = [
  {
    name: "backstage_get_alert",
    title: "Abrir um alerta",
    description: "Mostra um alerta do Monitoramento por inteiro (métrica, variação, período, responsável, tarefa ligada) e a linha do tempo dele, com a versão (use ao tratar).",
    input: { alerta_id: alertId },
    allowed: monitor("monitor.view"),
    async run(ctx, a) {
      return alertOut(await loadAlert(ctx, a.alerta_id as number));
    },
  },
  {
    name: "backstage_alert_assignees",
    title: "Quem pode ser responsável pelo alerta",
    description: "Lista as pessoas que podem ser responsáveis por um alerta (para backstage_alert_assign).",
    input: { alerta_id: alertId },
    allowed: monitor("monitor.handle"),
    async run(ctx, a) {
      const rows = ((await ctx.data.opsRpc("monitor_alert_assignees", { p_id: a.alerta_id })) ?? []) as Record<string, unknown>[];
      return { pessoas: rows.map((p) => ({ user_id: p.user_id ?? p.id, nome: p.full_name ?? p.name })) };
    },
  },
  {
    name: "backstage_alert_set_status",
    title: "Mudar a situação do alerta",
    description: "Marca o alerta como visualizado, em análise, aguardando ação ou ignorado. Para encerrar, use backstage_alert_resolve.",
    input: { alerta_id: alertId, situacao: z.enum(["visualizado", "em_analise", "aguardando_acao", "ignorado"]), versao: version },
    allowed: monitor("monitor.handle"),
    write: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("monitor_alert_set_status", { p_id: a.alerta_id, p_status: a.situacao, p_version: a.versao ?? null });
      return { situacao_alterada: true, ...alertOut(await loadAlert(ctx, a.alerta_id as number)) };
    },
  },
  {
    name: "backstage_alert_comment",
    title: "Comentar no alerta",
    description: "Adiciona um comentário na linha do tempo do alerta.",
    input: { alerta_id: alertId, texto: z.string().trim().min(1).max(2000) },
    allowed: monitor("monitor.handle"),
    write: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("monitor_alert_comment", { p_id: a.alerta_id, p_text: a.texto });
      return { comentado: true, alerta_id: a.alerta_id };
    },
  },
  {
    name: "backstage_alert_action",
    title: "Registrar providência no alerta",
    description: "Registra uma providência tomada (ex.: \"pausei o anúncio e troquei o criativo\") na linha do tempo do alerta. Só registra: não mexe no Meta nem no Google.",
    input: { alerta_id: alertId, providencia: z.string().trim().min(1).max(2000) },
    allowed: monitor("monitor.handle"),
    write: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("monitor_alert_action", { p_id: a.alerta_id, p_text: a.providencia });
      return { registrado: true, alerta_id: a.alerta_id };
    },
  },
  {
    name: "backstage_alert_assign",
    title: "Definir responsável pelo alerta",
    description: "Define quem cuida do alerta (null = ninguém). Veja as pessoas em backstage_alert_assignees.",
    input: { alerta_id: alertId, pessoa_id: uuid.nullable(), versao: version },
    allowed: monitor("monitor.handle"),
    write: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("monitor_alert_assign", { p_id: a.alerta_id, p_user: a.pessoa_id ?? null, p_version: a.versao ?? null });
      return { responsavel_definido: true, ...alertOut(await loadAlert(ctx, a.alerta_id as number)) };
    },
  },
  {
    name: "backstage_alert_resolve",
    title: "Resolver alerta",
    description: "Encerra o alerta como resolvido, com uma observação opcional (fica na linha do tempo).",
    input: { alerta_id: alertId, observacao: z.string().trim().max(2000).optional(), versao: version },
    allowed: monitor("monitor.handle"),
    write: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("monitor_alert_resolve", { p_id: a.alerta_id, p_note: a.observacao ?? null, p_version: a.versao ?? null });
      return { resolvido: true, alerta_id: a.alerta_id };
    },
  },
  {
    name: "backstage_alert_to_task",
    title: "Transformar alerta em tarefa",
    description: "Cria uma tarefa na Central a partir do alerta (título e descrição montados com os dados do alerta), no setor escolhido.",
    input: { alerta_id: alertId, setor_id: uuid, prazo: date.optional(), versao: version },
    allowed: monitor("monitor.handle"),
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("monitor_alert_to_task", { p_id: a.alerta_id, p_sector_id: a.setor_id, p_due_date: a.prazo ?? null, p_version: a.versao ?? null });
      return { tarefa_criada: true, tarefa_id: id, link: typeof id === "string" ? `${SITE}/operacoes/tarefas?tarefa=${id}` : null };
    },
  },
  {
    name: "backstage_list_alert_rules",
    title: "Regras de alerta",
    description: "Lista as regras do Monitoramento em vigor (onde valem, métrica, direção, limites de atenção e crítico, volume mínimo).",
    input: { incluir_historico: z.boolean().default(false).describe("true = inclui versões antigas/arquivadas.") },
    allowed: monitor("monitor.view"),
    async run(ctx, a) {
      const rows = ((await ctx.data.opsRpc("monitor_rules_list", { p_include_history: a.incluir_historico ?? false })) ?? []) as Record<string, unknown>[];
      return { total: rows.length, regras: rows };
    },
  },
  {
    name: "backstage_save_alert_rule",
    title: "Criar ou ajustar regra de alerta",
    description: "Cria uma regra (ou substitui uma, informando regra_substituida_id — a antiga fica no histórico). Métricas: cost_per_result, results, cpc, cpm, ctr, roas, spend, frequency. Direção: up (subir é ruim), down (cair é ruim), both. Limites em % (crítico ≥ atenção).",
    input: {
      regra_substituida_id: uuid.optional(),
      onde: z.enum(["global", "client", "account", "campaign", "ad"]).describe("global = todas; ou um cliente, conta, campanha ou anúncio."),
      onde_id: uuid.optional().describe("ID do cliente/conta/campanha/anúncio (vazio quando global)."),
      metrica: z.enum(["cost_per_result", "results", "cpc", "cpm", "ctr", "roas", "spend", "frequency"]),
      direcao: z.enum(["up", "down", "both"]),
      atencao_pct: z.number().gt(0).max(1000),
      critico_pct: z.number().gt(0).max(1000),
      volume_minimo: z.number().int().min(0).optional(),
      ativa: z.boolean().default(true),
      observacao: z.string().trim().max(300).optional(),
    },
    allowed: monitor("monitor.rules"),
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("monitor_rule_save", {
        p_replaces_id: a.regra_substituida_id ?? null, p_scope: a.onde, p_scope_id: a.onde_id ?? null, p_metric: a.metrica, p_direction: a.direcao,
        p_attention: a.atencao_pct, p_critical: a.critico_pct, p_min_volume: a.volume_minimo ?? null, p_active: a.ativa ?? true, p_note: a.observacao ?? null,
      });
      return { salva: true, regra_id: id };
    },
  },
  {
    name: "backstage_archive_alert_rule",
    title: "Arquivar regra de alerta",
    description: "Arquiva uma regra (deixa de gerar alertas; fica no histórico).",
    input: { regra_id: uuid },
    allowed: monitor("monitor.rules"),
    write: true,
    destructive: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("monitor_rule_archive", { p_id: a.regra_id });
      return { arquivada: true, regra_id: a.regra_id };
    },
  },
  {
    name: "backstage_set_min_severity",
    title: "Gravidade mínima dos alertas",
    description: "Define a partir de qual gravidade o Monitoramento gera alertas (critico, atencao ou informativo). Só administrador.",
    input: { gravidade: z.enum(["critico", "atencao", "informativo"]) },
    allowed: monitor("monitor.admin"),
    write: true,
    destructive: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("monitor_min_severity_save", { p_min_severity: a.gravidade });
      return { salvo: true, gravidade_minima: a.gravidade };
    },
  },
];

export const CLIENT_TOOLS: ToolSpec[] = [
  {
    name: "backstage_list_onboarding",
    title: "Clientes no fluxo operacional",
    description: "Lista os clientes no fluxo operacional da Central (etapa do onboarding, há quanto tempo, Account Manager, pendências) e, para quem pode, os clientes que ainda não estão no fluxo.",
    input: {
      busca: z.string().trim().min(1).max(80).optional(),
      minhas: z.boolean().optional().describe("Só os clientes em que você é o Account Manager."),
      am_id: uuid.optional(),
    },
    allowed: (_r, o) => o.includes("ops.access"),
    async run(ctx, a) {
      const b = (await ctx.data.opsRpc("ops_client_board", { f: { q: a.busca ?? null, mine: a.minhas ?? false, am_user_id: a.am_id ?? null } })) as
        { clients?: Record<string, unknown>[]; available?: { id: string; name: string }[] } | null;
      return {
        clientes: (b?.clients ?? []).map((c) => ({
          cliente_id: c.client_id, nome: c.name, etapa_id: c.stage_id, na_etapa_desde: c.stage_since, versao: c.version,
          account_manager: c.am_name, pendencias_da_etapa: c.stage_pending, voce_pode_mover: c.can_move,
        })),
        fora_do_fluxo: (b?.available ?? []).map((c) => ({ cliente_id: c.id, nome: c.name })),
      };
    },
  },
  {
    name: "backstage_get_client_ops",
    title: "Ficha do cliente na Central",
    description: "Mostra a ficha operacional do cliente: etapa do onboarding, Account Manager, versão, atividades registradas e histórico (com o que foi feito via MCP).",
    input: { cliente_id: uuid },
    allowed: (_r, o) => o.includes("ops.access"),
    async run(ctx, a) {
      return clientOut(await loadClient(ctx, a.cliente_id as string));
    },
  },
  {
    name: "backstage_client_start",
    title: "Colocar cliente no fluxo operacional",
    description: "Coloca um cliente no fluxo operacional (onboarding), na etapa escolhida (padrão: a primeira) e com o Account Manager opcional.",
    input: { cliente_id: uuid, etapa_id: z.string().trim().min(1).max(60).optional(), am_id: uuid.optional() },
    allowed: manageClients,
    write: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("ops_client_start", { p_client: a.cliente_id, p_stage: a.etapa_id ?? null, p_am: a.am_id ?? null });
      return { no_fluxo: true, ...clientOut(await loadClient(ctx, a.cliente_id as string)) };
    },
  },
  {
    name: "backstage_client_move_stage",
    title: "Mudar a etapa do onboarding",
    description: "Move o cliente para outra etapa do onboarding (respeita as tarefas obrigatórias da etapa). Veja as etapas em backstage_central_reference.",
    input: { cliente_id: uuid, etapa_id: z.string().trim().min(1).max(60), versao: version },
    allowed: (r, o) => r === "admin" || (o.includes("ops.clients.view") && o.includes("ops.cards.move")) || o.includes("ops.am"),
    write: true,
    async run(ctx, a) {
      const c = await loadClient(ctx, a.cliente_id as string);
      await ctx.data.opsRpc("ops_client_stage_move", { p_client: c.client.id, p_version: clientVersion(c, a.versao), p_stage: a.etapa_id });
      return { etapa_alterada: true, ...clientOut(await loadClient(ctx, c.client.id)) };
    },
  },
  {
    name: "backstage_client_set_am",
    title: "Trocar o Account Manager",
    description: "Define o Account Manager do cliente no fluxo operacional (null = nenhum).",
    input: { cliente_id: uuid, am_id: uuid.nullable(), versao: version },
    allowed: manageClients,
    write: true,
    async run(ctx, a) {
      const c = await loadClient(ctx, a.cliente_id as string);
      await ctx.data.opsRpc("ops_client_set_am", { p_client: c.client.id, p_version: clientVersion(c, a.versao), p_am: a.am_id ?? null });
      return { am_definido: true, ...clientOut(await loadClient(ctx, c.client.id)) };
    },
  },
  {
    name: "backstage_client_add_note",
    title: "Registrar atividade no cliente",
    description: "Registra uma atividade na ficha do cliente (reunião, ligação, entrega… conforme os tipos de atividade da Central), com data/hora, responsável e próximo passo opcionais.",
    input: {
      cliente_id: uuid,
      tipo_id: z.string().trim().min(1).max(60).describe("ID do tipo de atividade (backstage_central_reference)."),
      titulo: z.string().trim().min(2).max(200),
      descricao: z.string().trim().max(5000).optional(),
      quando: z.string().datetime({ offset: true }).optional().describe("Data e hora (ISO, ex.: 2026-10-26T14:00:00-03:00). Padrão: agora."),
      responsavel_id: uuid.optional(),
      setor_id: uuid.optional(),
      proximo_passo: z.string().trim().max(500).optional(),
    },
    allowed: (_r, o) => o.includes("ops.history.edit"),
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("ops_client_note_add", {
        p: {
          client_id: a.cliente_id, type_id: a.tipo_id, title: a.titulo, description: a.descricao ?? null,
          happened_at: (a.quando as string | undefined) ?? ctx.now().toISOString(), responsible_id: a.responsavel_id ?? null,
          sector_id: a.setor_id ?? null, next_step: a.proximo_passo ?? null,
        },
      });
      return { registrada: true, atividade_id: id, link: clientLink(a.cliente_id as string) };
    },
  },
];
