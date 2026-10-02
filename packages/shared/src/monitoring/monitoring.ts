// Monitoramento de Desempenho (Etapa 37): as regras de cálculo usadas pela tela
// e espelhadas no banco. Tudo determinístico e explicável (sem IA).
// Regras: nunca dividir por zero, nunca inventar número, nunca somar moedas,
// períodos comparados sempre com a mesma quantidade de dias.
import { cpc, cpm, ctr, frequency, microsToAmount, roas } from "../metrics/formulas.ts";
import { addDays, addMonths, type DateRange, daysInRange, DEFAULT_TIMEZONE, previousPeriod, todayIn } from "../metrics/periods.ts";

// ---------------------------------------------------------------- métricas

export const MONITOR_METRICS = [
  "cost_per_result",
  "results",
  "cpc",
  "cpm",
  "ctr",
  "roas",
  "spend",
  "frequency",
] as const;
export type MonitorMetric = (typeof MONITOR_METRICS)[number];

/** up = subir é ruim (custos) · down = cair é ruim · both = mudança brusca nos dois sentidos. */
export type BadDirection = "up" | "down" | "both";

export interface MonitorMetricDefinition {
  key: MonitorMetric;
  label: string;
  format: "money" | "decimal" | "percent" | "ratio";
  bad: BadDirection;
  description: string;
}

export const MONITOR_METRIC_DEFINITIONS: Record<MonitorMetric, MonitorMetricDefinition> = {
  cost_per_result: { key: "cost_per_result", label: "Custo por resultado", format: "money", bad: "up",
    description: "Investimento ÷ resultados. Subir significa que cada resultado ficou mais caro." },
  results: { key: "results", label: "Resultados", format: "decimal", bad: "down",
    description: "O resultado principal da campanha, conforme o objetivo (leads, mensagens, conversões ou cliques no link)." },
  cpc: { key: "cpc", label: "CPC", format: "money", bad: "up", description: "Investimento ÷ cliques." },
  cpm: { key: "cpm", label: "CPM", format: "money", bad: "up", description: "Investimento ÷ impressões × 1.000." },
  ctr: { key: "ctr", label: "CTR", format: "percent", bad: "down", description: "Cliques ÷ impressões × 100." },
  roas: { key: "roas", label: "ROAS", format: "ratio", bad: "down",
    description: "Valor das conversões ÷ investimento. Só existe quando a conta informa o valor." },
  spend: { key: "spend", label: "Investimento", format: "money", bad: "both",
    description: "Quanto foi gasto. Mudança brusca é informativa (pode ser mudança de orçamento)." },
  frequency: { key: "frequency", label: "Frequência", format: "decimal", bad: "up",
    description: "Impressões ÷ alcance do período. Só o Meta informa alcance." },
};

// ---------------------------------------------------------------- resultado por objetivo

export type ResultKind = "leads" | "messages" | "conversions" | "link_clicks" | "mixed" | "none";

export const RESULT_KIND_LABELS: Record<ResultKind, string> = {
  leads: "Leads",
  messages: "Mensagens iniciadas",
  conversions: "Conversões",
  link_clicks: "Cliques no link",
  mixed: "Leads + mensagens + conversões",
  none: "Sem resultado principal (objetivo de alcance ou engajamento)",
};

/**
 * Qual número é o "resultado" de uma campanha, pelo objetivo informado pela plataforma.
 * Sem objetivo (ou nível de conta/cliente) = soma de leads + mensagens + conversões,
 * a mesma regra do dashboard executivo.
 */
export function resultKindForObjective(objective: string | null | undefined): ResultKind {
  const o = (objective ?? "").toUpperCase();
  if (!o) return "mixed";
  if (o === "OUTCOME_LEADS" || o === "LEAD_GENERATION") return "leads";
  if (o === "MESSAGES") return "messages";
  if (o === "OUTCOME_SALES" || o === "CONVERSIONS" || o === "PRODUCT_CATALOG_SALES") return "conversions";
  if (o === "OUTCOME_TRAFFIC" || o === "LINK_CLICKS") return "link_clicks";
  if (o === "OUTCOME_AWARENESS" || o === "OUTCOME_ENGAGEMENT" || o === "POST_ENGAGEMENT" || o === "REACH" || o === "BRAND_AWARENESS" || o === "VIDEO_VIEWS") return "none";
  // Objetivos do Google e outros: conversões (o Google só informa conversões).
  return "conversions";
}

/** Totais de um período, na mesma moeda (quem chama agrupa por moeda antes). */
export interface MonitorTotals {
  spend_micros: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  link_clicks: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
}

const add = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : a + b);

export function resultsFor(t: MonitorTotals, kind: ResultKind): number | null {
  switch (kind) {
    case "leads": return t.leads;
    case "messages": return t.messages;
    case "conversions": return t.conversions;
    case "link_clicks": return t.link_clicks;
    case "mixed": return add(add(t.leads, t.messages), t.conversions);
    case "none": return null;
  }
}

/** Valor de cada métrica monitorada; null = não disponível (nunca estimado). */
export function monitorValues(t: MonitorTotals, kind: ResultKind): Record<MonitorMetric, number | null> {
  const results = resultsFor(t, kind);
  const spend = microsToAmount(t.spend_micros);
  return {
    spend,
    results,
    cost_per_result: spend == null || !results ? null : spend / results,
    cpc: cpc(t.spend_micros, t.clicks),
    cpm: cpm(t.spend_micros, t.impressions),
    ctr: ctr(t.clicks, t.impressions),
    // Sem valor de conversão informado não é "retorno zero".
    roas: t.conversion_value_micros ? roas(t.conversion_value_micros, t.spend_micros) : null,
    frequency: frequency(t.impressions, t.reach),
  };
}

// ---------------------------------------------------------------- variação

export type VariationKind = "percent" | "new" | "no_change" | "no_base" | "unavailable";

export interface MonitorVariation {
  kind: VariationKind;
  /** Só quando kind = percent. */
  percent: number | null;
  /** Atual − anterior, quando os dois existem. */
  difference: number | null;
}

export const VARIATION_LABELS: Record<Exclude<VariationKind, "percent">, string> = {
  new: "Novo resultado",
  no_change: "Sem variação",
  no_base: "Sem base comparativa",
  unavailable: "Dados insuficientes",
};

/**
 * (atual − anterior) ÷ anterior × 100, sem nunca dividir por zero:
 * anterior 0 e atual > 0 → "novo"; os dois 0 → "sem variação";
 * anterior ausente → "sem base"; atual ausente → "dados insuficientes".
 */
export function monitorVariation(current: number | null | undefined, previous: number | null | undefined): MonitorVariation {
  if (current == null || !Number.isFinite(current)) return { kind: "unavailable", percent: null, difference: null };
  if (previous == null || !Number.isFinite(previous)) return { kind: "no_base", percent: null, difference: null };
  const difference = current - previous;
  if (previous === 0) return { kind: current === 0 ? "no_change" : "new", percent: null, difference };
  // Arredonda a 6 casas: 1,4 ÷ 1 dá 39,9999…% em ponto flutuante (o banco usa numérico exato).
  const percent = Math.round((difference / Math.abs(previous)) * 100 * 1e6) / 1e6;
  if (Math.abs(percent) < 0.05) return { kind: "no_change", percent: 0, difference };
  return { kind: "percent", percent, difference };
}

// ---------------------------------------------------------------- limites e regras

export const SCOPE_LEVELS = ["global", "client", "account", "campaign", "ad"] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

export const SCOPE_LABELS: Record<ScopeLevel, string> = {
  global: "Todos os clientes",
  client: "Cliente",
  account: "Conta de anúncios",
  campaign: "Campanha",
  ad: "Anúncio",
};

/** Da mais específica para a mais geral. */
const SCOPE_PRIORITY: ScopeLevel[] = ["ad", "campaign", "account", "client", "global"];

export interface MonitorRule {
  id?: string;
  scope: ScopeLevel;
  scope_id: string | null;
  metric: MonitorMetric;
  /** Sentido que gera alerta. */
  direction: BadDirection;
  attention_pct: number;
  critical_pct: number;
  /** Volume mínimo da base (ver VOLUME_BASE); null = usa o padrão. */
  min_volume: number | null;
  active: boolean;
}

/** Tabela inicial pedida no prompt (sugestões, ajustáveis). */
export const DEFAULT_RULES: MonitorRule[] = [
  { scope: "global", scope_id: null, metric: "cost_per_result", direction: "up", attention_pct: 20, critical_pct: 40, min_volume: null, active: true },
  { scope: "global", scope_id: null, metric: "cpc", direction: "up", attention_pct: 20, critical_pct: 40, min_volume: null, active: true },
  { scope: "global", scope_id: null, metric: "cpm", direction: "up", attention_pct: 20, critical_pct: 40, min_volume: null, active: true },
  { scope: "global", scope_id: null, metric: "ctr", direction: "down", attention_pct: 15, critical_pct: 30, min_volume: null, active: true },
  { scope: "global", scope_id: null, metric: "results", direction: "down", attention_pct: 20, critical_pct: 40, min_volume: null, active: true },
  { scope: "global", scope_id: null, metric: "roas", direction: "down", attention_pct: 20, critical_pct: 40, min_volume: null, active: true },
];

/** Onde está cada entidade monitorada (para achar a regra que vale). */
export interface MonitorTarget {
  client_id: string | null;
  account_id: string | null;
  campaign_id: string | null;
  ad_id: string | null;
}

function targetIdFor(scope: ScopeLevel, t: MonitorTarget): string | null {
  switch (scope) {
    case "global": return null;
    case "client": return t.client_id;
    case "account": return t.account_id;
    case "campaign": return t.campaign_id;
    case "ad": return t.ad_id;
  }
}

/**
 * A regra que vale para a métrica: anúncio > campanha > conta > cliente > global.
 * Uma regra específica DESATIVADA também vale: desliga o alerta naquele ponto.
 */
export function resolveRule(rules: MonitorRule[], metric: MonitorMetric, target: MonitorTarget): MonitorRule | null {
  for (const scope of SCOPE_PRIORITY) {
    const id = targetIdFor(scope, target);
    if (scope !== "global" && !id) continue;
    const rule = rules.find((r) => r.metric === metric && r.scope === scope && (scope === "global" ? r.scope_id == null : r.scope_id === id));
    if (rule) return rule;
  }
  return null;
}

/** Validação da regra (a mesma que o banco faz). Devolve a mensagem de erro ou null. */
export function validateRule(r: Pick<MonitorRule, "scope" | "scope_id" | "attention_pct" | "critical_pct" | "min_volume">): string | null {
  if (!Number.isFinite(r.attention_pct) || r.attention_pct <= 0 || r.attention_pct > 1000) return "O limite de atenção precisa ser maior que 0% e até 1000%.";
  if (!Number.isFinite(r.critical_pct) || r.critical_pct <= 0 || r.critical_pct > 1000) return "O limite crítico precisa ser maior que 0% e até 1000%.";
  if (r.critical_pct < r.attention_pct) return "O limite crítico não pode ser menor que o de atenção.";
  if (r.min_volume != null && (!Number.isInteger(r.min_volume) || r.min_volume < 0)) return "O volume mínimo precisa ser um número inteiro, 0 ou maior.";
  if ((r.scope === "global") !== (r.scope_id == null)) return "Escolha onde a regra vale.";
  return null;
}

// ---------------------------------------------------------------- volume mínimo

/** Qual contagem precisa ter volume para a métrica ser confiável. */
export type VolumeBase = "results" | "clicks" | "impressions" | "conversions" | "none";

export const VOLUME_BASE: Record<MonitorMetric, VolumeBase> = {
  cost_per_result: "results",
  results: "results",
  cpc: "clicks",
  ctr: "impressions",
  cpm: "impressions",
  roas: "conversions",
  spend: "none",
  frequency: "impressions",
};

export const DEFAULT_MIN_VOLUME: Record<VolumeBase, number> = {
  results: 10,
  clicks: 20,
  impressions: 1000,
  conversions: 5,
  none: 0,
};

export const VOLUME_BASE_LABELS: Record<VolumeBase, string> = {
  results: "resultados",
  clicks: "cliques",
  impressions: "impressões",
  conversions: "conversões",
  none: "",
};

function baseCount(t: MonitorTotals, base: VolumeBase, kind: ResultKind): number | null {
  switch (base) {
    case "results": return resultsFor(t, kind);
    case "clicks": return t.clicks;
    case "impressions": return t.impressions;
    case "conversions": return t.conversions;
    case "none": return null;
  }
}

/**
 * A amostra é suficiente? O período anterior (a base) precisa ter o volume mínimo.
 * Nas taxas (CPC, CTR, CPM, ROAS, frequência) o período atual também precisa,
 * senão poucos cliques viram um "alarme". Resultados e custo por resultado olham
 * só a base: cair para zero é justamente o que queremos ver.
 */
export function hasMinimumVolume(metric: MonitorMetric, current: MonitorTotals, previous: MonitorTotals, kind: ResultKind, minVolume?: number | null): boolean {
  const base = VOLUME_BASE[metric];
  if (base === "none") return true;
  const min = minVolume ?? DEFAULT_MIN_VOLUME[base];
  const prev = baseCount(previous, base, kind) ?? 0;
  if (prev < min) return false;
  if (metric === "results" || metric === "cost_per_result") return true;
  return (baseCount(current, base, kind) ?? 0) >= min;
}

// ---------------------------------------------------------------- gravidade

export const MONITOR_SEVERITIES = ["critico", "atencao", "informativo", "normal"] as const;
export type MonitorSeverity = (typeof MONITOR_SEVERITIES)[number];

export const MONITOR_SEVERITY_LABELS: Record<MonitorSeverity, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  informativo: "Informativo",
  normal: "Normal",
};

/** Qualidade do dado que sustenta a classificação. */
export type DataQuality = "confirmado" | "amostra_pequena" | "sem_base" | "dados_em_revisao" | "periodo_parcial" | "historico_incompleto";

export const DATA_QUALITY_LABELS: Record<DataQuality, string> = {
  confirmado: "Confirmado pelos dados disponíveis",
  amostra_pequena: "Amostra pequena — sinal de atenção, não conclusivo",
  sem_base: "Sem base comparativa",
  dados_em_revisao: "Dados recentes: a plataforma ainda pode ajustar os números",
  periodo_parcial: "Período parcial (hoje ainda em coleta): não é equivalente ao anterior",
  historico_incompleto: "O histórico guardado não cobre os dois períodos inteiros",
};

export interface Classification {
  severity: MonitorSeverity;
  quality: DataQuality;
  /** A variação no sentido ruim, em % (positivo = piorou). null = não se aplica. */
  worsening_pct: number | null;
}

/**
 * Classifica uma variação pela regra:
 * - sem regra ativa → normal;
 * - sem valor atual → normal (a métrica não existe ou depende de outra que já alerta);
 * - sem valor anterior → informativo "sem base";
 * - amostra pequena → no máximo informativo;
 * - piora ≥ crítico → crítico; ≥ atenção → atenção; senão normal.
 * "both" (investimento) nunca passa de informativo: mudança de gasto não é, sozinha, um problema.
 */
export function classifyVariation(variation: MonitorVariation, rule: MonitorRule | null, volumeOk: boolean): Classification {
  if (!rule || !rule.active) return { severity: "normal", quality: "confirmado", worsening_pct: null };
  // Sem valor atual (métrica que não existe para o item, ou custo sem resultados): não alerta por si;
  // a queda de resultados é que avisa. Sem valor anterior (item novo): só informativo.
  if (variation.kind === "unavailable") return { severity: "normal", quality: "sem_base", worsening_pct: null };
  if (variation.kind === "no_base") return { severity: "informativo", quality: "sem_base", worsening_pct: null };
  if (variation.kind === "new" || variation.kind === "no_change") return { severity: "normal", quality: volumeOk ? "confirmado" : "amostra_pequena", worsening_pct: null };
  const pct = variation.percent ?? 0;
  const worsening = rule.direction === "up" ? pct : rule.direction === "down" ? -pct : Math.abs(pct);
  if (worsening < rule.attention_pct) return { severity: "normal", quality: volumeOk ? "confirmado" : "amostra_pequena", worsening_pct: worsening };
  if (!volumeOk) return { severity: "informativo", quality: "amostra_pequena", worsening_pct: worsening };
  if (rule.direction === "both") return { severity: "informativo", quality: "confirmado", worsening_pct: worsening };
  return { severity: worsening >= rule.critical_pct ? "critico" : "atencao", quality: "confirmado", worsening_pct: worsening };
}

// ---------------------------------------------------------------- períodos

export const MONITOR_PERIODS = [
  "today",
  "yesterday",
  "last_3_days",
  "last_7_days",
  "last_14_days",
  "last_30_days",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
] as const;
export type MonitorPeriod = (typeof MONITOR_PERIODS)[number] | "custom";

export const MONITOR_PERIOD_LABELS: Record<MonitorPeriod, string> = {
  today: "Hoje até o momento",
  yesterday: "Ontem",
  last_3_days: "Últimos 3 dias",
  last_7_days: "Últimos 7 dias",
  last_14_days: "Últimos 14 dias",
  last_30_days: "Últimos 30 dias",
  this_week: "Semana atual",
  last_week: "Semana anterior",
  this_month: "Mês atual",
  last_month: "Mês anterior",
  custom: "Período personalizado",
};

export interface PeriodPair {
  current: DateRange;
  previous: DateRange;
  /** O período atual inclui hoje (dia ainda em coleta). */
  partial: boolean;
  /** Os dois períodos têm a mesma quantidade de dias. */
  same_length: boolean;
  /** Explicação curta do que está sendo comparado. */
  note: string | null;
}

/** Segunda-feira da semana da data (semana de segunda a domingo). */
function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, -((dow + 6) % 7));
}

/**
 * Os dois períodos comparados, sempre com a mesma quantidade de dias.
 * "Últimas 24 horas" não existe porque os dados são diários (não há dado por hora).
 * Hoje entra só em "Hoje até o momento", "Semana atual" e "Mês atual", marcado como parcial:
 * o anterior é o mesmo número de dias COMPLETOS, então a tela avisa que não é equivalente.
 */
export function monitorPeriods(period: MonitorPeriod, timezone: string = DEFAULT_TIMEZONE, now: Date = new Date(), custom?: DateRange | null): PeriodPair {
  const today = todayIn(timezone, now);
  const yesterday = addDays(today, -1);
  const lastN = (n: number): DateRange => ({ from: addDays(today, -n), to: yesterday });
  const pair = (current: DateRange, previous: DateRange = previousPeriod(current)): PeriodPair => {
    const partial = current.to >= today;
    return {
      current,
      previous,
      partial,
      same_length: daysInRange(current) === daysInRange(previous),
      note: partial ? "Hoje ainda está em coleta: o período atual é parcial e o anterior tem dias completos." : null,
    };
  };
  switch (period) {
    case "today":
      return pair({ from: today, to: today }, { from: yesterday, to: yesterday });
    case "yesterday":
      return pair({ from: yesterday, to: yesterday });
    case "last_3_days":
      return pair(lastN(3));
    case "last_7_days":
      return pair(lastN(7));
    case "last_14_days":
      return pair(lastN(14));
    case "last_30_days":
      return pair(lastN(30));
    case "this_week": {
      const monday = mondayOf(today);
      const current = { from: monday, to: today };
      const days = daysInRange(current);
      return pair(current, { from: addDays(monday, -7), to: addDays(monday, -8 + days) });
    }
    case "last_week": {
      const monday = addDays(mondayOf(today), -7);
      return pair({ from: monday, to: addDays(monday, 6) });
    }
    case "this_month": {
      const start = `${today.slice(0, 7)}-01`;
      const current = { from: start, to: today };
      const prevStart = addMonths(start, -1);
      // Mesmo número de dias do mês anterior (limitado ao fim dele).
      const prevMonthEnd = addDays(start, -1);
      const wanted = addDays(prevStart, daysInRange(current) - 1);
      const previous = { from: prevStart, to: wanted > prevMonthEnd ? prevMonthEnd : wanted };
      const p = pair(current, previous);
      if (!p.same_length) p.note = `${p.note ? p.note + " " : ""}O mês anterior tem menos dias: a comparação tem durações diferentes.`;
      return p;
    }
    case "last_month": {
      const start = addMonths(`${today.slice(0, 7)}-01`, -1);
      const current = { from: start, to: addDays(`${today.slice(0, 7)}-01`, -1) };
      return pair(current);
    }
    case "custom": {
      const current = custom ?? lastN(7);
      return pair(current);
    }
  }
}

// ---------------------------------------------------------------- frequência de avaliação

export const EVALUATION_INTERVALS = [15, 30, 60, 180, 360, 1440] as const;
export type EvaluationInterval = (typeof EVALUATION_INTERVALS)[number];

export const EVALUATION_INTERVAL_LABELS: Record<EvaluationInterval, string> = {
  15: "A cada 15 minutos",
  30: "A cada 30 minutos",
  60: "A cada hora",
  180: "A cada 3 horas",
  360: "A cada 6 horas",
  1440: "Uma vez ao dia",
};

/**
 * Intervalos menores que a atualização real das contas não trazem nada novo:
 * a tela avisa. As contas atualizam ~1 vez por hora.
 */
export function intervalNote(minutes: EvaluationInterval, syncEveryMinutes = 60): string | null {
  return minutes < syncEveryMinutes
    ? `As contas atualizam cerca de 1 vez a cada ${syncEveryMinutes} minutos. Avaliações mais frequentes só reavaliam contas que receberam dados novos.`
    : null;
}

// ---------------------------------------------------------------- avaliação de uma comparação

export type CompareLevel = "account" | "campaign" | "ad_group" | "ad" | "creative";
export type Coverage = "completa" | "parcial" | "sem_historico";

/** Métricas mostradas e avaliadas nas comparações (frequência fica de fora: alcance não se soma entre dias). */
export const COMPARED_METRICS = ["spend", "results", "cost_per_result", "ctr", "cpc", "cpm", "roas"] as const satisfies readonly MonitorMetric[];
export type ComparedMetric = (typeof COMPARED_METRICS)[number];

export interface CompareInput {
  level: CompareLevel;
  objective: string | null;
  coverage: Coverage;
  /** O período atual inclui hoje. */
  partial: boolean;
  current: MonitorTotals;
  previous: MonitorTotals;
  target: MonitorTarget;
}

export interface MetricEvaluation extends Classification {
  metric: ComparedMetric;
  current: number | null;
  previous: number | null;
  variation: MonitorVariation;
  rule: MonitorRule | null;
}

export interface CompareEvaluation {
  resultKind: ResultKind;
  metrics: Record<ComparedMetric, MetricEvaluation>;
  /** A pior gravidade entre as métricas. */
  worst: MonitorSeverity;
}

const SEVERITY_RANK: Record<MonitorSeverity, number> = { critico: 3, atencao: 2, informativo: 1, normal: 0 };

export function worseSeverity(a: MonitorSeverity, b: MonitorSeverity): MonitorSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/** Ordena do mais grave para o menos grave. */
export function compareSeverity(a: MonitorSeverity, b: MonitorSeverity): number {
  return SEVERITY_RANK[b] - SEVERITY_RANK[a];
}

/**
 * Avalia todas as métricas de uma linha comparada, com as regras em vigor.
 * Conta e cliente usam a soma de leads + mensagens + conversões; os demais níveis,
 * o resultado do objetivo da campanha. Período parcial ou histórico incompleto
 * nunca passam de informativo (não são comparações equivalentes).
 */
export function evaluateComparison(input: CompareInput, rules: MonitorRule[]): CompareEvaluation {
  const resultKind = input.level === "account" ? "mixed" : resultKindForObjective(input.objective);
  const cur = monitorValues(input.current, resultKind);
  const prev = monitorValues(input.previous, resultKind);
  let worst: MonitorSeverity = "normal";
  const metrics = {} as Record<ComparedMetric, MetricEvaluation>;
  for (const metric of COMPARED_METRICS) {
    const variation = monitorVariation(cur[metric], prev[metric]);
    const rule = resolveRule(rules, metric, input.target);
    const volumeOk = hasMinimumVolume(metric, input.current, input.previous, resultKind, rule?.min_volume);
    let c = classifyVariation(variation, rule, volumeOk);
    if (c.severity === "critico" || c.severity === "atencao") {
      if (input.partial) c = { ...c, severity: "informativo", quality: "periodo_parcial" };
      else if (input.coverage !== "completa") c = { ...c, severity: "informativo", quality: "historico_incompleto" };
    }
    metrics[metric] = { metric, current: cur[metric], previous: prev[metric], variation, rule, ...c };
    worst = worseSeverity(worst, c.severity);
  }
  return { resultKind, metrics, worst };
}
