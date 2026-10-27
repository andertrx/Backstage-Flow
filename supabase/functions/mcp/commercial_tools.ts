import { z } from "npm:zod@4";
import type { Role } from "../../../packages/shared/src/constants/roles.ts";
import { SITE } from "./ops_tools.ts";
import { date, type ToolContext, ToolError, type ToolSpec, uuid } from "./tools.ts";

/**
 * Etapa 40.4 — ferramentas do MCP no Comercial (leads) e nas Reuniões da Central.
 * Mesmas ações do site, com o login da pessoa: o banco confere a permissão e grava o histórico (marcado "via MCP").
 * Contatos dos leads (nome do contato, telefone, e-mail, CNPJ): a IA pode GRAVAR quando ditados, mas eles NUNCA voltam
 * nas respostas (só "cadastrado: sim/não"). Nada é apagado: lead arquivado volta; reunião cancelada fica no histórico.
 * Converter lead em cliente fica só no site (mexe no cadastro de clientes).
 */

const has = (perm: string) => (_r: Role, ops: readonly string[]) => ops.includes(perm);
const leadLink = (id: string) => `${SITE}/operacoes/comercial?lead=${id}`;
const meetingLink = (id: string) => `${SITE}/operacoes/reunioes?reuniao=${id}`;
const version = z.number().int().min(1).optional().describe("Versão lida em backstage_get_lead/backstage_get_meeting.");
const PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
const opt = (s: z.ZodString) => s.nullable().optional();

/** Campos de contato: só escrita. A resposta diz apenas se estão cadastrados. */
export const LEAD_PRIVATE_FIELDS = ["contact_name", "phone", "email", "cnpj"] as const;
const contactFlags = (l: Record<string, unknown>) => ({
  contato_cadastrado: { nome: Boolean(l.contact_name), telefone: Boolean(l.phone), email: Boolean(l.email), cnpj: Boolean(l.cnpj) },
});

interface LeadDetail {
  lead: Record<string, unknown> & { id: string; version: number; archived_at: string | null };
  events: { action: string; kind: string | null; body: string | null; happened_at: string | null; actor: string | null; origin: string; before: unknown; after: unknown; created_at: string }[];
  can?: Record<string, boolean>;
}

async function loadLead(ctx: ToolContext, id: string): Promise<LeadDetail> {
  const l = (await ctx.data.opsRpc("ops_lead_get", { p_id: id })) as LeadDetail | null;
  if (!l?.lead) throw new ToolError("NOT_FOUND", "Lead não encontrado ou você não tem acesso ao Comercial.");
  return l;
}

function leadVersion(l: LeadDetail, seen: unknown): number {
  if (typeof seen === "number" && seen !== l.lead.version) {
    throw new ToolError("CONFLICT", "Alguém alterou este lead depois que você o leu. Abra de novo (backstage_get_lead) e repita.");
  }
  return l.lead.version;
}

const LEAD_FIELDS = ["id", "number", "company_name", "segment", "city", "state", "origin", "service_interest", "notes", "owner_id", "owner_name",
  "priority", "potential_value", "currency", "entered_at", "last_interaction_at", "next_action", "next_action_date", "stage_id", "stage_name",
  "category", "stage_since", "loss_reason", "loss_note", "lost_at", "client_id", "client_name", "converted_at", "archived_at", "overdue", "version"];

/** Lead sem os contatos (nunca devolvidos à IA). */
function leadOut(l: Record<string, unknown> & { id: string }) {
  const out: Record<string, unknown> = {};
  for (const k of LEAD_FIELDS) if (l[k] != null && !(LEAD_PRIVATE_FIELDS as readonly string[]).includes(k)) out[k] = l[k];
  return { ...out, ...contactFlags(l), link: leadLink(l.id) };
}

function leadDetailOut(d: LeadDetail) {
  return {
    lead: leadOut(d.lead),
    historico: (d.events ?? []).slice(0, 30).map((e) => ({
      acao: e.action, tipo: e.kind, texto: e.body, quando: e.happened_at ?? e.created_at, quem: e.actor,
      origem: e.origin === "mcp" ? "via MCP" : e.origin, antes: e.before, depois: e.after,
    })),
  };
}

const leadInput = {
  empresa: z.string().trim().min(2).max(200).optional().describe("Nome da empresa (obrigatório ao criar)."),
  contato_nome: opt(z.string().trim().max(120)).describe("Só gravação: nunca é mostrado de volta."),
  telefone: opt(z.string().trim().max(30)).describe("Só gravação (DDD + número): nunca é mostrado de volta."),
  email: opt(z.string().trim().max(200)).describe("Só gravação: nunca é mostrado de volta."),
  cnpj: opt(z.string().trim().max(20)).describe("Só gravação: nunca é mostrado de volta."),
  segmento: opt(z.string().trim().max(120)),
  cidade: opt(z.string().trim().max(120)),
  estado: opt(z.string().trim().max(2)).describe("Sigla, ex.: SP."),
  origem: opt(z.string().trim().max(120)).describe("De onde veio o lead (indicação, Instagram…)."),
  servico_de_interesse: opt(z.string().trim().max(200)),
  responsavel_id: uuid.nullable().optional().describe("Responsável comercial (user_id em backstage_central_reference)."),
  observacoes: opt(z.string().trim().max(5000)),
  valor_potencial: z.number().min(0).max(1e12).nullable().optional(),
  moeda: z.enum(["BRL", "USD", "EUR"]).optional(),
  prioridade: z.enum(PRIORITIES).optional(),
  data_de_entrada: date.optional(),
  proxima_acao: opt(z.string().trim().max(500)),
  data_proxima_acao: date.nullable().optional(),
};

/** Nome do campo da ferramenta → nome do campo no banco. */
const LEAD_MAP: [keyof typeof leadInput, string][] = [
  ["empresa", "company_name"], ["contato_nome", "contact_name"], ["telefone", "phone"], ["email", "email"], ["cnpj", "cnpj"],
  ["segmento", "segment"], ["cidade", "city"], ["estado", "state"], ["origem", "origin"], ["servico_de_interesse", "service_interest"],
  ["responsavel_id", "owner_id"], ["observacoes", "notes"], ["valor_potencial", "potential_value"], ["moeda", "currency"],
  ["prioridade", "priority"], ["data_de_entrada", "entered_at"], ["proxima_acao", "next_action"], ["data_proxima_acao", "next_action_date"],
];
const str = (v: unknown) => (v == null ? "" : String(v));

/** O site grava o lead inteiro: na edição, parte do que já existe (inclusive os contatos, sem mostrá-los) e troca só o enviado. */
function leadPayload(a: Record<string, unknown>, current: Record<string, unknown> | null): Record<string, string> {
  const p: Record<string, string> = {};
  for (const [tool, db] of LEAD_MAP) p[db] = a[tool] !== undefined ? str(a[tool]) : str(current?.[db]);
  if (!p.currency) p.currency = "BRL";
  if (!p.priority) p.priority = "media";
  return p;
}

export const COMMERCIAL_TOOLS: ToolSpec[] = [
  {
    name: "backstage_commercial_reference",
    title: "Comercial: etapas e motivos de perda",
    description: "Lista as etapas do funil comercial (com o grupo: aberto, ganho, perdido) e os motivos de perda. Use para descobrir os IDs antes de criar ou mover leads.",
    input: {},
    allowed: has("ops.commercial"),
    async run(ctx) {
      const r = await ctx.data.commercialReference();
      return {
        etapas: r.leadStages.map((s) => ({ id: s.id, nome: s.name, grupo: s.category, ativa: s.active, exige_etapa_anterior: s.require_previous, exige_proxima_acao: s.require_next_action })),
        motivos_de_perda: r.lossReasons.map((m) => ({ id: m.id, nome: m.name, ativo: m.active })),
      };
    },
  },
  {
    name: "backstage_list_leads",
    title: "Listar leads",
    description: "Lista os leads do Comercial (empresa, etapa, responsável, próxima ação, valor potencial, prioridade). Contatos (telefone, e-mail etc.) não são mostrados.",
    input: {
      busca: z.string().trim().min(1).max(80).optional(),
      responsavel_id: uuid.optional(),
      origem: z.string().trim().max(120).optional(),
      prioridade: z.enum(PRIORITIES).optional(),
      atrasados: z.boolean().optional().describe("Só os com próxima ação vencida."),
      arquivados: z.boolean().optional(),
      etapa_id: z.string().trim().max(60).optional(),
      limite: z.number().int().min(1).max(100).optional(),
    },
    allowed: has("ops.commercial"),
    async run(ctx, a) {
      const b = (await ctx.data.opsRpc("ops_lead_board", {
        f: { q: a.busca ?? null, owner_id: a.responsavel_id ?? null, origin: a.origem ?? null, priority: a.prioridade ?? null,
          overdue: a.atrasados ?? false, archived: a.arquivados ?? false },
      })) as { leads?: (Record<string, unknown> & { id: string })[] } | null;
      const all = (b?.leads ?? []).filter((l) => !a.etapa_id || l.stage_id === a.etapa_id);
      const lim = (a.limite as number | undefined) ?? 50;
      return { total: all.length, leads: all.slice(0, lim).map(leadOut), ...(all.length > lim ? { aviso: `Mostrando ${lim} de ${all.length}. Use filtros.` } : {}) };
    },
  },
  {
    name: "backstage_get_lead",
    title: "Abrir um lead",
    description: "Mostra um lead (dados, etapa, próxima ação, versão) e o histórico de interações. Contatos não são mostrados, só se estão cadastrados.",
    input: { lead_id: uuid },
    allowed: has("ops.commercial"),
    async run(ctx, a) {
      return leadDetailOut(await loadLead(ctx, a.lead_id as string));
    },
  },
  {
    name: "backstage_save_lead",
    title: "Criar ou editar lead",
    description: "Sem lead_id: cria um lead (empresa obrigatória; entra na etapa escolhida em aberto ou na primeira). Com lead_id: muda só os campos enviados (null limpa). Contatos ditados são gravados, mas nunca mostrados de volta. Avisa possíveis duplicados.",
    input: { lead_id: uuid.optional(), versao: version, etapa_id: z.string().trim().max(60).optional().describe("Só ao criar."), ...leadInput },
    allowed: has("ops.commercial"),
    write: true,
    async run(ctx, a) {
      const id = a.lead_id as string | undefined;
      let current: LeadDetail | null = null;
      if (id) {
        if (!LEAD_MAP.some(([k]) => a[k] !== undefined)) throw new ToolError("INVALID_INPUT", "Diga o que mudar no lead.");
        current = await loadLead(ctx, id);
        leadVersion(current, a.versao);
      } else if (!a.empresa) throw new ToolError("INVALID_INPUT", "Informe o nome da empresa.");
      const p = leadPayload(a, current?.lead ?? null);
      if (!id && a.etapa_id) p.stage_id = a.etapa_id as string;
      const dup = !id
        ? ((await ctx.data.opsRpc("ops_lead_duplicates", { p: { company_name: p.company_name, email: p.email, phone: p.phone, cnpj: p.cnpj } })) as
          { leads?: { number: number; company_name: string; stage_name: string; reason: string }[]; clients?: { name: string; reason: string }[] } | null)
        : null;
      const saved = (await ctx.data.opsRpc("ops_lead_save", { p_id: id ?? null, p_version: current ? current.lead.version : null, p })) as string;
      const out = leadDetailOut(await loadLead(ctx, saved));
      const avisos = [
        ...(dup?.leads ?? []).map((d) => `Lead parecido: #${d.number} ${d.company_name} (${d.stage_name}) — ${d.reason}`),
        ...(dup?.clients ?? []).map((c) => `Cliente parecido: ${c.name} — ${c.reason}`),
      ];
      return { [id ? "lead_editado" : "lead_criado"]: true, ...out, ...(avisos.length ? { possiveis_duplicados: avisos } : {}) };
    },
  },
  {
    name: "backstage_move_lead",
    title: "Mudar a etapa do lead",
    description: "Move o lead para outra etapa do funil (respeita as regras das etapas). Para \"perdido\", informe o motivo (backstage_commercial_reference). Converter em cliente só pelo site.",
    input: {
      lead_id: uuid,
      etapa_id: z.string().trim().min(1).max(60),
      versao: version,
      motivo_perda_id: z.string().trim().max(60).optional(),
      observacao_perda: z.string().trim().max(1000).optional(),
    },
    allowed: has("ops.commercial"),
    write: true,
    async run(ctx, a) {
      const l = await loadLead(ctx, a.lead_id as string);
      await ctx.data.opsRpc("ops_lead_move", {
        p_id: l.lead.id, p_version: leadVersion(l, a.versao), p_stage: a.etapa_id, p_loss_reason: a.motivo_perda_id ?? null, p_loss_note: a.observacao_perda ?? null,
      });
      return { etapa_alterada: true, ...leadDetailOut(await loadLead(ctx, l.lead.id)) };
    },
  },
  {
    name: "backstage_lead_note",
    title: "Registrar interação no lead",
    description: "Registra uma interação no histórico do lead: contato, reunião, proposta, contrato ou observação. Não guarde conversas inteiras de WhatsApp: resuma.",
    input: {
      lead_id: uuid,
      tipo: z.enum(["contato", "reuniao", "proposta", "contrato", "observacao"]),
      texto: z.string().trim().min(2).max(5000),
      quando: z.string().datetime({ offset: true }).optional().describe("Data e hora (ISO). Padrão: agora."),
    },
    allowed: has("ops.commercial"),
    write: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("ops_lead_note_add", { p_lead: a.lead_id, p_kind: a.tipo, p_body: a.texto, p_happened_at: a.quando ?? null });
      return { registrado: true, link: leadLink(a.lead_id as string) };
    },
  },
  {
    name: "backstage_archive_lead",
    title: "Arquivar ou desarquivar lead",
    description: "Arquiva o lead (sai do quadro, nada é apagado) ou desarquiva.",
    input: { lead_id: uuid, arquivar: z.boolean().default(true) },
    allowed: has("ops.commercial"),
    write: true,
    destructive: true,
    async run(ctx, a) {
      await ctx.data.opsRpc("ops_lead_archive", { p_id: a.lead_id, p_archived: a.arquivar ?? true });
      return { [a.arquivar === false ? "desarquivado" : "arquivado"]: true, link: leadLink(a.lead_id as string) };
    },
  },
];

// ------------------------------------------------------------------ Reuniões

interface MeetingDetail {
  meeting: Record<string, unknown> & { id: string; version: number; status: string; notes: string | null };
  people: { user_id: string; name: string; attended: boolean }[];
  items: Record<string, unknown>[];
  events: { action: string; actor: string | null; origin: string; created_at: string }[];
  can?: Record<string, boolean>;
}

async function loadMeeting(ctx: ToolContext, id: string): Promise<MeetingDetail> {
  const m = (await ctx.data.opsRpc("ops_meeting_get", { p_id: id })) as MeetingDetail | null;
  if (!m?.meeting) throw new ToolError("NOT_FOUND", "Reunião não encontrada ou não liberada para você.");
  return m;
}

function meetingVersion(m: MeetingDetail, seen: unknown): number {
  if (typeof seen === "number" && seen !== m.meeting.version) {
    throw new ToolError("CONFLICT", "Alguém alterou esta reunião depois que você a leu. Abra de novo (backstage_get_meeting) e repita.");
  }
  return m.meeting.version;
}

function meetingOut(d: MeetingDetail) {
  const m = d.meeting;
  return {
    reuniao: {
      id: m.id, numero: m.number, titulo: m.title, tipo_id: m.category_id, tipo: m.category_name, situacao: m.status, inicio: m.starts_at,
      duracao_min: m.duration_min, setor_id: m.sector_id, setor: m.sector_name, cliente_id: m.client_id, cliente: m.client_name, local: m.location,
      pauta: m.agenda, ata: m.notes, motivo_cancelamento: m.cancel_reason, realizada_em: m.held_at, organizador: m.organizer_name, versao: m.version,
      link: meetingLink(m.id),
    },
    participantes: (d.people ?? []).map((p) => ({ user_id: p.user_id, nome: p.name, presente: p.attended })),
    itens: (d.items ?? []).map((i) => ({
      id: i.id, tipo: i.kind, texto: i.body, responsavel: i.owner_name, setor: i.sector_name, prazo: i.due_date,
      tarefa: i.task_number ? { numero: i.task_number, titulo: i.task_title ?? null, status: i.task_status ?? null } : null,
    })),
    historico: (d.events ?? []).slice(0, 30).map((e) => ({ acao: e.action, quem: e.actor, origem: e.origin === "mcp" ? "via MCP" : e.origin, quando: e.created_at })),
    voce_pode: d.can ?? {},
  };
}

const meetingInput = {
  titulo: z.string().trim().min(3).max(200).optional(),
  tipo_id: z.string().trim().max(60).optional().describe("Tipo da reunião (backstage_meeting_reference)."),
  inicio: z.string().datetime({ offset: true }).optional().describe("Data e hora (ISO, ex.: 2026-10-28T10:00:00-03:00)."),
  duracao_min: z.number().int().min(5).max(600).optional(),
  setor_id: uuid.nullable().optional(),
  cliente_id: uuid.nullable().optional(),
  local: opt(z.string().trim().max(300)).describe("Sala ou link da chamada."),
  pauta: opt(z.string().trim().max(5000)),
  participantes: z.array(uuid).max(60).optional().describe("Lista COMPLETA de participantes (user_id). Na edição, substitui a atual."),
};
const MEETING_MAP: [keyof typeof meetingInput, string][] = [
  ["titulo", "title"], ["tipo_id", "category_id"], ["inicio", "starts_at"], ["duracao_min", "duration_min"], ["setor_id", "sector_id"],
  ["cliente_id", "client_id"], ["local", "location"], ["pauta", "agenda"],
];

export const MEETING_TOOLS: ToolSpec[] = [
  {
    name: "backstage_meeting_reference",
    title: "Reuniões: tipos",
    description: "Lista os tipos de reunião (daily, alinhamento…) com os IDs.",
    input: {},
    allowed: has("ops.access"),
    async run(ctx) {
      const r = await ctx.data.commercialReference();
      return { tipos: r.meetingCategories.map((c) => ({ id: c.id, nome: c.name, ativo: c.active })) };
    },
  },
  {
    name: "backstage_list_meetings",
    title: "Listar reuniões",
    description: "Lista as reuniões que você pode ver (filtros por período, tipo, setor, cliente, situação, pessoa, só as minhas, busca).",
    input: {
      de: date.optional(), ate: date.optional(),
      tipo_id: z.string().trim().max(60).optional(), setor_id: uuid.optional(), cliente_id: uuid.optional(),
      situacao: z.enum(["agendada", "realizada", "cancelada"]).optional(), pessoa_id: uuid.optional(), minhas: z.boolean().optional(),
      busca: z.string().trim().min(1).max(80).optional(), ordem: z.enum(["asc", "desc"]).optional(),
      limite: z.number().int().min(1).max(100).optional(),
    },
    allowed: has("ops.access"),
    async run(ctx, a) {
      const r = (await ctx.data.opsRpc("ops_meeting_list", {
        f: { from: a.de ?? null, to: a.ate ?? null, category_id: a.tipo_id ?? null, sector_id: a.setor_id ?? null, client_id: a.cliente_id ?? null,
          status: a.situacao ?? null, person_id: a.pessoa_id ?? null, mine: a.minhas ?? false, q: a.busca ?? null, order: a.ordem ?? "desc" },
      })) as { meetings?: Record<string, unknown>[]; can?: { create?: boolean } } | null;
      const all = r?.meetings ?? [];
      const lim = (a.limite as number | undefined) ?? 50;
      return {
        total: all.length,
        voce_pode_criar: r?.can?.create ?? false,
        reunioes: all.slice(0, lim).map((m) => ({
          id: m.id, numero: m.number, titulo: m.title, tipo: m.category_name, situacao: m.status, inicio: m.starts_at, duracao_min: m.duration_min,
          setor: m.sector_name, cliente: m.client_name, organizador: m.organizer_name, participantes: m.people_count, presentes: m.attended_count,
          pendencias_sem_tarefa: m.open_items, tarefas_geradas: m.tasks_count, link: meetingLink(m.id as string),
        })),
      };
    },
  },
  {
    name: "backstage_get_meeting",
    title: "Abrir uma reunião",
    description: "Mostra a reunião: pauta, ata, participantes e presença, itens (objetivos, pendências, decisões, bloqueios) com as tarefas geradas, histórico e versão.",
    input: { reuniao_id: uuid },
    allowed: has("ops.access"),
    async run(ctx, a) {
      return meetingOut(await loadMeeting(ctx, a.reuniao_id as string));
    },
  },
  {
    name: "backstage_save_meeting",
    title: "Agendar ou editar reunião",
    description: "Sem reuniao_id: agenda uma reunião (título, tipo e início obrigatórios; você fica como organizador). Com reuniao_id: muda só os campos enviados. Só quem organiza (ou tem \"Criar reuniões\") edita.",
    input: { reuniao_id: uuid.optional(), versao: version, ...meetingInput },
    allowed: has("ops.access"),
    write: true,
    async run(ctx, a) {
      const id = a.reuniao_id as string | undefined;
      let cur: MeetingDetail | null = null;
      if (id) {
        if (![...MEETING_MAP.map(([k]) => k), "participantes"].some((k) => a[k] !== undefined)) throw new ToolError("INVALID_INPUT", "Diga o que mudar na reunião.");
        cur = await loadMeeting(ctx, id);
        meetingVersion(cur, a.versao);
      } else if (!a.titulo || !a.tipo_id || !a.inicio) {
        throw new ToolError("INVALID_INPUT", "Para agendar, informe título, tipo (backstage_meeting_reference) e início.");
      }
      const p: Record<string, unknown> = {};
      for (const [tool, db] of MEETING_MAP) p[db] = a[tool] !== undefined ? a[tool] : (cur?.meeting[db] ?? null);
      p.people = (a.participantes as string[] | undefined) ?? (cur?.people ?? []).map((x) => x.user_id);
      const saved = (await ctx.data.opsRpc("ops_meeting_save", { p_id: id ?? null, p_version: cur ? cur.meeting.version : null, p })) as string;
      return { [id ? "reuniao_editada" : "reuniao_agendada"]: true, ...meetingOut(await loadMeeting(ctx, saved)) };
    },
  },
  {
    name: "backstage_record_meeting",
    title: "Registrar a reunião (ata e presença)",
    description: "Marca a reunião como realizada com a ata e quem esteve presente (ou corrige a ata). Sem 'presentes', mantém a presença atual; sem 'ata', mantém a ata atual.",
    input: { reuniao_id: uuid, versao: version, ata: z.string().trim().max(20000).optional(), presentes: z.array(uuid).max(60).optional() },
    allowed: has("ops.access"),
    write: true,
    async run(ctx, a) {
      const m = await loadMeeting(ctx, a.reuniao_id as string);
      await ctx.data.opsRpc("ops_meeting_record", {
        p_id: m.meeting.id, p_version: meetingVersion(m, a.versao),
        p_notes: (a.ata as string | undefined) ?? m.meeting.notes ?? "",
        p_attended: (a.presentes as string[] | undefined) ?? (m.people ?? []).filter((p) => p.attended).map((p) => p.user_id),
      });
      return { registrada: true, ...meetingOut(await loadMeeting(ctx, m.meeting.id)) };
    },
  },
  {
    name: "backstage_meeting_add_item",
    title: "Adicionar item à reunião",
    description: "Registra um objetivo, pendência, decisão ou bloqueio na reunião (pendência e bloqueio aceitam prazo e podem virar tarefa).",
    input: {
      reuniao_id: uuid,
      tipo: z.enum(["objetivo", "pendencia", "decisao", "bloqueio"]),
      texto: z.string().trim().min(2).max(2000),
      responsavel_id: uuid.optional(),
      setor_id: uuid.optional(),
      prazo: date.optional(),
    },
    allowed: has("ops.access"),
    write: true,
    async run(ctx, a) {
      const id = await ctx.data.opsRpc("ops_meeting_item_add", {
        p_meeting: a.reuniao_id,
        p: { kind: a.tipo, body: a.texto, owner_id: a.responsavel_id ?? null, sector_id: a.setor_id ?? null, due_date: a.prazo ?? null },
      });
      return { item_adicionado: true, item_id: id, link: meetingLink(a.reuniao_id as string) };
    },
  },
  {
    name: "backstage_meeting_item_to_task",
    title: "Transformar pendência da reunião em tarefa",
    description: "Cria uma tarefa na Central a partir de uma pendência ou bloqueio da reunião (com o setor e o responsável do item). Se já virou tarefa, devolve a mesma.",
    input: { item_id: uuid },
    allowed: has("ops.tasks.create"),
    write: true,
    async run(ctx, a) {
      const task = (await ctx.data.opsRpc("ops_meeting_item_to_task", { p_item: a.item_id })) as string;
      return { tarefa_criada: true, tarefa_id: task, link: `${SITE}/operacoes/tarefas?tarefa=${task}` };
    },
  },
  {
    name: "backstage_cancel_meeting",
    title: "Cancelar reunião",
    description: "Cancela uma reunião agendada, com o motivo. Ela continua no histórico (nada é apagado).",
    input: { reuniao_id: uuid, motivo: z.string().trim().min(3).max(500), versao: version },
    allowed: has("ops.access"),
    write: true,
    destructive: true,
    async run(ctx, a) {
      const m = await loadMeeting(ctx, a.reuniao_id as string);
      await ctx.data.opsRpc("ops_meeting_cancel", { p_id: m.meeting.id, p_version: meetingVersion(m, a.versao), p_reason: a.motivo });
      return { cancelada: true, ...meetingOut(await loadMeeting(ctx, m.meeting.id)) };
    },
  },
];
