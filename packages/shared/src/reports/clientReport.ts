// Dashboard do cliente (Etapa 19): quais métricas existem, como cada uma é
// calculada a partir dos totais do período e como as ações do Meta viram
// nomes em português. Nada aqui inventa número: sem dado = null.
import { cpa, cpc, cpl, cpm, costPerMessage, ctr, frequency as freq, percentChange, roas } from "../metrics/formulas.ts";
import type { KpiDirection, KpiFormat } from "../metrics/kpis.ts";
import type { PeriodPreset } from "../metrics/periods.ts";

/** Totais de uma conta no período, como devolve public.client_report_accounts (cur/prev). */
export interface ReportTotals {
  spend_micros: number | null;
  impressions: number | null;
  clicks: number | null;
  link_clicks: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  video_views: number | null;
  days?: number | null;
  /** Alcance do período EXATO (a plataforma calcula); null = não informado. */
  reach: number | null;
  frequency: number | null;
  /** Ações do Meta somadas no período: {"tipo": total}. Vazio/null no Google. */
  actions: Record<string, number> | null;
}

export type MainResultSource = "leads" | "messages" | "conversions" | "action";
export interface MainResult {
  source: MainResultSource;
  label: string;
  action_type?: string | null;
}

export const REPORT_KPI_KEYS = [
  "spend", "main_result", "cost_per_result", "impressions", "reach", "frequency", "clicks", "link_clicks", "ctr", "link_ctr",
  "cpc", "cpm", "leads", "cpl", "messages", "cost_per_message", "conversions", "cpa", "conversion_value", "roas", "video_views",
] as const;
export type ReportKpiKey = (typeof REPORT_KPI_KEYS)[number];

export const REPORT_SECTIONS = ["summary", "kpis", "funnel", "daily", "breakdowns", "actions", "campaigns", "notes"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];
export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  summary: "Resumo em uma frase",
  kpis: "Cartões de métricas",
  funnel: "Funil (impressões → cliques → resultado)",
  daily: "Gráficos dia a dia",
  breakdowns: "Quem viu e onde (idade, gênero, horário, aparelho, plataforma, localização)",
  actions: "Ações por tipo (Meta)",
  campaigns: "Campanhas",
  notes: "Análise da agência e próximos passos",
};

export const REPORT_PERIODS = ["last_7_days", "last_14_days", "last_30_days", "this_month", "last_month"] as const satisfies readonly PeriodPreset[];
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export interface ClientReportSettings {
  title: string;
  subtitle: string | null;
  main_result: MainResult;
  kpis: ReportKpiKey[];
  sections: Record<ReportSection, boolean>;
  default_period: ReportPeriod;
  agency_notes: string | null;
  next_steps: string | null;
}

export const DEFAULT_REPORT_KPIS: ReportKpiKey[] = ["spend", "main_result", "cost_per_result", "impressions", "reach", "clicks", "ctr", "cpc", "cpm"];

/** Modelo usado quando o cliente ainda não tem um salvo (igual ao padrão do banco). */
export function defaultReportSettings(clientName: string): ClientReportSettings {
  return {
    title: `Relatório de anúncios · ${clientName}`.slice(0, 120),
    subtitle: null,
    main_result: { source: "leads", label: "Leads" },
    kpis: [...DEFAULT_REPORT_KPIS],
    sections: Object.fromEntries(REPORT_SECTIONS.map((s) => [s, true])) as Record<ReportSection, boolean>,
    default_period: "last_7_days",
    agency_notes: null,
    next_steps: null,
  };
}

/** Junta o que veio do banco com o padrão (seções novas ligadas, chaves desconhecidas fora). */
export function normalizeReportSettings(row: Partial<ClientReportSettings> | null | undefined, clientName: string): ClientReportSettings {
  const base = defaultReportSettings(clientName);
  if (!row) return base;
  const sections = { ...base.sections };
  for (const s of REPORT_SECTIONS) {
    const v = (row.sections as Record<string, unknown> | undefined)?.[s];
    if (typeof v === "boolean") sections[s] = v;
  }
  const kpis = (row.kpis ?? []).filter((k): k is ReportKpiKey => (REPORT_KPI_KEYS as readonly string[]).includes(k));
  return {
    title: row.title || base.title,
    subtitle: row.subtitle ?? null,
    main_result: row.main_result?.source ? row.main_result : base.main_result,
    kpis: kpis.length ? kpis : base.kpis,
    sections,
    default_period: (REPORT_PERIODS as readonly string[]).includes(row.default_period ?? "") ? row.default_period! : base.default_period,
    agency_notes: row.agency_notes ?? null,
    next_steps: row.next_steps ?? null,
  };
}

/**
 * O Google Ads não separa leads/mensagens nem tem as ações do Meta:
 * lá o resultado principal é sempre "Conversões".
 */
export function mainResultFor(main: MainResult, platform: string): MainResult {
  if (platform === "google" && main.source !== "conversions") return { source: "conversions", label: "Conversões" };
  return main;
}

type Totalsish = Pick<ReportTotals, "leads" | "messages" | "conversions"> & { actions: Record<string, number> | null };

/** Valor do resultado principal nos totais (null = a plataforma não informa). */
export function mainResultValue(t: Totalsish | null | undefined, main: MainResult): number | null {
  if (!t) return null;
  switch (main.source) {
    case "leads": return t.leads ?? null;
    case "messages": return t.messages ?? null;
    case "conversions": return t.conversions ?? null;
    case "action": {
      if (!t.actions || !main.action_type) return null;
      // Conta do Meta com ações no período, mas sem esta: zero (não "não informado").
      return Number(t.actions[main.action_type] ?? 0);
    }
  }
}

export interface ReportKpiDefinition {
  key: ReportKpiKey;
  label: string;
  description: string;
  format: KpiFormat;
  direction: KpiDirection;
}

/** Métricas que podem aparecer nos cartões. Rótulo do resultado principal vem do modelo. */
export function reportKpiDefinitions(main: MainResult): Record<ReportKpiKey, ReportKpiDefinition> {
  const r = main.label;
  const list: ReportKpiDefinition[] = [
    { key: "spend", label: "Investimento", format: "money", direction: "neutral", description: "Quanto foi gasto em anúncios no período." },
    { key: "main_result", label: r, format: "decimal", direction: "up", description: `O resultado principal escolhido para este cliente: ${r}.` },
    { key: "cost_per_result", label: "Custo por resultado", format: "money", direction: "down", description: `Investimento ÷ ${r}. Quanto menor, melhor.` },
    { key: "impressions", label: "Impressões", format: "integer", direction: "neutral", description: "Quantas vezes os anúncios apareceram na tela (a mesma pessoa pode ver várias vezes)." },
    { key: "reach", label: "Alcance", format: "integer", direction: "up", description: "Pessoas diferentes que viram os anúncios no período, como a plataforma calcula. Só existe para os períodos prontos." },
    { key: "frequency", label: "Frequência", format: "decimal", direction: "neutral", description: "Quantas vezes, em média, cada pessoa viu os anúncios. Muito alta pode cansar o público." },
    { key: "clicks", label: "Cliques", format: "integer", direction: "up", description: "Todos os cliques no anúncio (inclui curtidas, perfil e ver mais)." },
    { key: "link_clicks", label: "Cliques no link", format: "integer", direction: "up", description: "Cliques que levaram para o site, WhatsApp ou formulário." },
    { key: "ctr", label: "CTR", format: "percent", direction: "up", description: "Cliques ÷ impressões × 100. Mostra o quanto o anúncio chama atenção." },
    { key: "link_ctr", label: "CTR do link", format: "percent", direction: "up", description: "Cliques no link ÷ impressões × 100." },
    { key: "cpc", label: "CPC", format: "money", direction: "down", description: "Custo por clique = investimento ÷ cliques." },
    { key: "cpm", label: "CPM", format: "money", direction: "down", description: "Custo para aparecer mil vezes = investimento ÷ impressões × 1.000." },
    { key: "leads", label: "Leads", format: "decimal", direction: "up", description: "Cadastros informados pela plataforma." },
    { key: "cpl", label: "Custo por lead", format: "money", direction: "down", description: "Investimento ÷ leads." },
    { key: "messages", label: "Conversas iniciadas", format: "integer", direction: "up", description: "Conversas começadas pelos anúncios (WhatsApp, Messenger, Direct)." },
    { key: "cost_per_message", label: "Custo por conversa", format: "money", direction: "down", description: "Investimento ÷ conversas iniciadas." },
    { key: "conversions", label: "Conversões", format: "decimal", direction: "up", description: "Ações valiosas registradas pela plataforma." },
    { key: "cpa", label: "Custo por conversão", format: "money", direction: "down", description: "Investimento ÷ conversões." },
    { key: "conversion_value", label: "Valor das conversões", format: "money", direction: "up", description: "Soma do valor das conversões (ex.: vendas), quando a conta informa." },
    { key: "roas", label: "ROAS", format: "ratio", direction: "up", description: "Valor das conversões ÷ investimento. 3x = R$ 3 de retorno para cada R$ 1." },
    { key: "video_views", label: "Visualizações de vídeo", format: "integer", direction: "up", description: "Vezes que o vídeo foi assistido por pelo menos 3 segundos." },
  ];
  return Object.fromEntries(list.map((d) => [d.key, d])) as Record<ReportKpiKey, ReportKpiDefinition>;
}

/** Nome da métrica para a lista de escolha (sem depender do resultado principal). */
export function reportKpiLabel(key: ReportKpiKey, main: MainResult): string {
  if (key === "main_result") return `Resultado principal (${main.label})`;
  if (key === "cost_per_result") return `Custo por resultado (${main.label})`;
  return reportKpiDefinitions(main)[key].label;
}

/** Valor de cada métrica (null = não dá para calcular / a plataforma não informa). */
export function computeReportKpis(t: ReportTotals | null | undefined, main: MainResult): Record<ReportKpiKey, number | null> {
  const out = Object.fromEntries(REPORT_KPI_KEYS.map((k) => [k, null])) as Record<ReportKpiKey, number | null>;
  if (!t) return out;
  const result = mainResultValue(t, main);
  const resultRatio = result == null || result === 0 || t.spend_micros == null ? null : t.spend_micros / 1_000_000 / result;
  return {
    spend: t.spend_micros == null ? null : t.spend_micros / 1_000_000,
    main_result: result,
    cost_per_result: resultRatio,
    impressions: t.impressions,
    reach: t.reach,
    frequency: t.frequency ?? freq(t.impressions, t.reach),
    clicks: t.clicks,
    link_clicks: t.link_clicks,
    ctr: ctr(t.clicks, t.impressions),
    link_ctr: ctr(t.link_clicks, t.impressions),
    cpc: cpc(t.spend_micros, t.clicks),
    cpm: cpm(t.spend_micros, t.impressions),
    leads: t.leads,
    cpl: cpl(t.spend_micros, t.leads),
    messages: t.messages,
    cost_per_message: costPerMessage(t.spend_micros, t.messages),
    conversions: t.conversions,
    cpa: cpa(t.spend_micros, t.conversions),
    conversion_value: t.conversion_value_micros ? t.conversion_value_micros / 1_000_000 : null,
    roas: t.conversion_value_micros ? roas(t.conversion_value_micros, t.spend_micros) : null,
    video_views: t.video_views,
  };
}

// ---------------------------------------------------------------------------
// Ações do Meta. A API devolve o mesmo acontecimento com vários nomes
// (ex.: purchase, omni_purchase, offsite_conversion.fb_pixel_purchase). Cada
// grupo abaixo usa UM nome (o primeiro que existir), para não contar duas vezes.
// ---------------------------------------------------------------------------

export type ActionCategory = "site" | "mensagens" | "cadastros" | "engajamento";
export const ACTION_CATEGORY_LABELS: Record<ActionCategory, string> = {
  site: "Site e loja",
  cadastros: "Cadastros",
  mensagens: "Mensagens",
  engajamento: "Engajamento",
};

export interface ActionGroup {
  id: string;
  label: string;
  category: ActionCategory;
  /** Nomes aceitos, na ordem de preferência. */
  types: string[];
}

export const META_ACTION_GROUPS: ActionGroup[] = [
  { id: "link_click", label: "Cliques no link", category: "site", types: ["link_click"] },
  { id: "landing_page_view", label: "Visualizações da página de destino", category: "site", types: ["landing_page_view", "omni_landing_page_view"] },
  { id: "view_content", label: "Visualizações de conteúdo", category: "site", types: ["omni_view_content", "view_content", "offsite_conversion.fb_pixel_view_content"] },
  { id: "search", label: "Pesquisas no site", category: "site", types: ["omni_search", "search", "offsite_conversion.fb_pixel_search"] },
  { id: "add_to_cart", label: "Adições ao carrinho", category: "site", types: ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"] },
  { id: "initiate_checkout", label: "Finalizações de compra iniciadas", category: "site", types: ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"] },
  { id: "add_payment_info", label: "Informações de pagamento adicionadas", category: "site", types: ["add_payment_info", "offsite_conversion.fb_pixel_add_payment_info"] },
  { id: "purchase", label: "Compras", category: "site", types: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"] },
  { id: "pixel_custom", label: "Eventos personalizados do Pixel", category: "site", types: ["offsite_conversion.fb_pixel_custom"] },
  { id: "lead", label: "Leads (todos)", category: "cadastros", types: ["lead"] },
  { id: "pixel_lead", label: "Leads no site (Pixel)", category: "cadastros", types: ["offsite_conversion.fb_pixel_lead"] },
  { id: "form_lead", label: "Leads no formulário do Meta", category: "cadastros", types: ["onsite_conversion.lead_grouped"] },
  { id: "complete_registration", label: "Cadastros concluídos", category: "cadastros", types: ["omni_complete_registration", "complete_registration", "offsite_conversion.fb_pixel_complete_registration"] },
  { id: "conversation_started", label: "Conversas iniciadas", category: "mensagens", types: ["onsite_conversion.messaging_conversation_started_7d"] },
  { id: "messaging_connection", label: "Conexões por mensagem", category: "mensagens", types: ["onsite_conversion.total_messaging_connection"] },
  { id: "first_reply", label: "Primeiras respostas", category: "mensagens", types: ["onsite_conversion.messaging_first_reply"] },
  { id: "depth_2", label: "Conversas com 2+ mensagens da pessoa", category: "mensagens", types: ["onsite_conversion.messaging_user_depth_2_message_send"] },
  { id: "depth_3", label: "Conversas com 3+ mensagens da pessoa", category: "mensagens", types: ["onsite_conversion.messaging_user_depth_3_message_send"] },
  { id: "depth_5", label: "Conversas com 5+ mensagens da pessoa", category: "mensagens", types: ["onsite_conversion.messaging_user_depth_5_message_send"] },
  { id: "messaging_block", label: "Bloqueios na conversa", category: "mensagens", types: ["onsite_conversion.messaging_block"] },
  { id: "post_engagement", label: "Engajamento com a publicação", category: "engajamento", types: ["post_engagement"] },
  { id: "post_reaction", label: "Reações", category: "engajamento", types: ["post_reaction"] },
  { id: "comment", label: "Comentários", category: "engajamento", types: ["comment"] },
  { id: "share", label: "Compartilhamentos", category: "engajamento", types: ["post"] },
  { id: "save", label: "Salvamentos", category: "engajamento", types: ["onsite_conversion.post_save"] },
  { id: "page_like", label: "Curtidas na página", category: "engajamento", types: ["like"] },
  { id: "video_view", label: "Visualizações de vídeo (3 s)", category: "engajamento", types: ["video_view"] },
];

/** Grupos que não são "resultado" (não fazem sentido como resultado principal). */
const NOT_A_RESULT = new Set(["messaging_block"]);

const CUSTOM_CONVERSION = /^offsite_conversion\.custom\.(\d+)$/;

export interface ActionRow {
  id: string;
  /** Nome que a API usou (é o que fica salvo quando vira resultado principal). */
  type: string;
  label: string;
  category: ActionCategory;
  value: number;
  previous: number | null;
}

const KNOWN_ACTION_TYPES = new Set(META_ACTION_GROUPS.flatMap((g) => g.types));

/** Tipos de ação que o painel usa (os demais não precisam ser guardados nas divisões). */
export function isReportActionType(type: string): boolean {
  return KNOWN_ACTION_TYPES.has(type) || CUSTOM_CONVERSION.test(type);
}

/** Nome em português de um tipo de ação (ou null se não conhecemos). */
export function actionLabel(type: string): string | null {
  const g = META_ACTION_GROUPS.find((x) => x.types.includes(type));
  if (g) return g.label;
  const m = CUSTOM_CONVERSION.exec(type);
  if (m) return `Conversão personalizada (…${m[1].slice(-4)})`;
  return null;
}

/**
 * Ações do período em linhas legíveis, sem contar o mesmo acontecimento duas
 * vezes. Tipos desconhecidos ficam de fora (evita número duplicado ou sem nome).
 */
export function actionRows(cur: Record<string, number> | null | undefined, prev: Record<string, number> | null | undefined): ActionRow[] {
  if (!cur) return [];
  const rows: ActionRow[] = [];
  for (const g of META_ACTION_GROUPS) {
    const type = g.types.find((t) => cur[t] != null) ?? g.types.find((t) => prev?.[t] != null);
    if (!type) continue;
    const value = Number(cur[type] ?? 0);
    const previous = prev ? Number(prev[type] ?? 0) : null;
    if (value === 0 && !previous) continue;
    rows.push({ id: g.id, type, label: g.label, category: g.category, value, previous });
  }
  for (const type of Object.keys(cur).filter((t) => CUSTOM_CONVERSION.test(t)).sort()) {
    const value = Number(cur[type]);
    if (!value) continue;
    rows.push({ id: type, type, label: actionLabel(type)!, category: "site", value, previous: prev ? Number(prev[type] ?? 0) : null });
  }
  return rows;
}

/** Opções de resultado principal do tipo "ação", a partir das ações encontradas. */
export function actionResultOptions(actions: Record<string, number>): { type: string; label: string }[] {
  return actionRows(actions, null)
    .filter((r) => !NOT_A_RESULT.has(r.id))
    .map((r) => ({ type: r.type, label: r.label }));
}

// ---------------------------------------------------------------------------
// Funil e resumo
// ---------------------------------------------------------------------------

export interface FunnelStage {
  label: string;
  value: number;
  /** % em relação à etapa anterior (null na primeira). */
  rate: number | null;
  rateLabel: string | null;
}

/**
 * Impressões → cliques no link (ou cliques) → [visualizações da página] → resultado.
 * Etapas sem dado ficam de fora; se uma etapa for maior que a anterior
 * (contagens diferentes da plataforma), a taxa não é mostrada.
 */
export function funnelStages(t: ReportTotals | null | undefined, main: MainResult): FunnelStage[] {
  if (!t) return [];
  const raw: { label: string; value: number | null; rateLabel: string }[] = [
    { label: "Impressões", value: t.impressions, rateLabel: "" },
    t.link_clicks != null
      ? { label: "Cliques no link", value: t.link_clicks, rateLabel: "CTR do link" }
      : { label: "Cliques", value: t.clicks, rateLabel: "CTR" },
  ];
  const lpv = t.actions?.landing_page_view ?? t.actions?.omni_landing_page_view;
  if (lpv && main.source !== "messages" && !(main.source === "action" && /messaging/.test(main.action_type ?? ""))) {
    raw.push({ label: "Visualizações da página", value: Number(lpv), rateLabel: "dos cliques chegaram à página" });
  }
  raw.push({ label: main.label, value: mainResultValue(t, main), rateLabel: "taxa de conversão" });
  const present = raw.filter((s): s is { label: string; value: number; rateLabel: string } => s.value != null);
  return present.map((s, i) => {
    const before = i > 0 ? present[i - 1].value : null;
    const rate = before && s.value <= before ? (s.value / before) * 100 : null;
    return { label: s.label, value: s.value, rate, rateLabel: i > 0 && rate != null ? s.rateLabel : null };
  });
}

export interface SummaryParts {
  spend: number | null;
  result: number | null;
  costPerResult: number | null;
  resultChange: number | null;
  costChange: number | null;
}

/** Números da frase de resumo (a tela formata). Variação só com base de comparação. */
export function summaryParts(cur: ReportTotals | null | undefined, prev: ReportTotals | null | undefined, main: MainResult): SummaryParts {
  const c = computeReportKpis(cur, main);
  const p = computeReportKpis(prev, main);
  return {
    spend: c.spend,
    result: c.main_result,
    costPerResult: c.cost_per_result,
    resultChange: percentChange(c.main_result, p.main_result),
    costChange: percentChange(c.cost_per_result, p.cost_per_result),
  };
}

/** Converte a linha do banco (números como texto/numeric) em ReportTotals. */
export function toReportTotals(raw: Record<string, unknown> | null | undefined): ReportTotals | null {
  if (!raw) return null;
  const n = (k: string) => (raw[k] == null ? null : Number(raw[k]));
  const actions = raw.actions && typeof raw.actions === "object"
    ? Object.fromEntries(Object.entries(raw.actions as Record<string, unknown>).map(([k, v]) => [k, Number(v)]))
    : null;
  return {
    spend_micros: n("spend_micros"), impressions: n("impressions"), clicks: n("clicks"), link_clicks: n("link_clicks"),
    leads: n("leads"), messages: n("messages"), conversions: n("conversions"), conversion_value_micros: n("conversion_value_micros"),
    video_views: n("video_views"), days: n("days"), reach: n("reach"), frequency: n("frequency"),
    actions: actions && Object.keys(actions).length ? actions : null,
  };
}
