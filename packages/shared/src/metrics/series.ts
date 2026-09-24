// Séries no tempo para os gráficos: quais métricas, como agrupar os períodos
// (dia, semana de segunda a domingo, mês) e como montar cada linha.
// Período sem dados → null (a linha é interrompida; nunca vira zero inventado).
import { cpc, cpl, cpm, ctr, microsToAmount, roas } from "./formulas.ts";
import type { KpiFormat, MetricTotals } from "./kpis.ts";
import { addDays, type DateRange } from "./periods.ts";

export type Granularity = "day" | "week" | "month";

export const GRANULARITY_LABELS: Record<Granularity, string> = { day: "Diário", week: "Semanal", month: "Mensal" };

/** Totais de um período do gráfico (como vêm de public.dashboard_timeseries). */
export interface SeriesTotals extends MetricTotals {
  reach: number | null;
}

export type ChartMetricKey =
  | "spend" | "leads" | "cpl" | "clicks" | "ctr" | "cpm" | "cpc" | "conversions" | "roas" | "reach" | "impressions" | "messages";

export interface ChartMetric {
  key: ChartMetricKey;
  label: string;
  format: KpiFormat;
  value: (t: SeriesTotals) => number | null;
}

export const CHART_METRICS: ChartMetric[] = [
  { key: "spend", label: "Investimento", format: "money", value: (t) => microsToAmount(t.spend_micros) },
  { key: "leads", label: "Leads", format: "decimal", value: (t) => t.leads },
  { key: "cpl", label: "CPL", format: "money", value: (t) => cpl(t.spend_micros, t.leads) },
  { key: "clicks", label: "Cliques", format: "integer", value: (t) => t.clicks },
  { key: "ctr", label: "CTR", format: "percent", value: (t) => ctr(t.clicks, t.impressions) },
  { key: "cpm", label: "CPM", format: "money", value: (t) => cpm(t.spend_micros, t.impressions) },
  { key: "cpc", label: "CPC", format: "money", value: (t) => cpc(t.spend_micros, t.clicks) },
  { key: "conversions", label: "Conversões", format: "decimal", value: (t) => t.conversions },
  { key: "roas", label: "ROAS", format: "ratio", value: (t) => (t.conversion_value_micros ? roas(t.conversion_value_micros, t.spend_micros) : null) },
  { key: "reach", label: "Alcance", format: "integer", value: (t) => t.reach },
  { key: "impressions", label: "Impressões", format: "integer", value: (t) => t.impressions },
  { key: "messages", label: "Mensagens", format: "integer", value: (t) => t.messages },
];

export interface Bucket {
  /** Chave do período (1º dia do período cheio: o dia, a segunda-feira ou o dia 1º). */
  key: string;
  /** Parte do período que está dentro do intervalo escolhido. */
  from: string;
  to: string;
}

const dayOfWeek = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = domingo
const monday = (date: string) => addDays(date, -((dayOfWeek(date) + 6) % 7));
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const nextMonth = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

/** Todos os períodos do gráfico, inclusive os que não têm dados. */
export function bucketsFor(range: DateRange, granularity: Granularity): Bucket[] {
  const out: Bucket[] = [];
  let key = granularity === "day" ? range.from : granularity === "week" ? monday(range.from) : monthStart(range.from);
  for (let guard = 0; key <= range.to && guard < 5000; guard++) {
    const next = granularity === "day" ? addDays(key, 1) : granularity === "week" ? addDays(key, 7) : nextMonth(key);
    const end = addDays(next, -1);
    out.push({ key, from: key < range.from ? range.from : key, to: end > range.to ? range.to : end });
    key = next;
  }
  return out;
}

export interface SeriesRow extends SeriesTotals {
  bucket: string;
  platform_id: string | null;
  currency: string;
}

export interface SeriesPoint {
  bucket: Bucket;
  value: number | null;
}

export interface ChartSeries {
  /** "total" ou o id da plataforma. */
  key: string;
  points: SeriesPoint[];
}

/** Monta as linhas do gráfico para uma moeda e uma métrica. */
export function buildSeries(
  rows: SeriesRow[],
  buckets: Bucket[],
  metric: ChartMetric,
  currency: string | null,
  byPlatform: boolean,
): ChartSeries[] {
  const inCurrency = rows.filter((r) => r.currency === currency);
  const keys = byPlatform ? [...new Set(inCurrency.map((r) => r.platform_id ?? "outros"))].sort() : ["total"];
  return keys.map((key) => {
    const mine = inCurrency.filter((r) => !byPlatform || (r.platform_id ?? "outros") === key);
    const byBucket = new Map(mine.map((r) => [r.bucket, r]));
    return {
      key,
      points: buckets.map((b) => {
        const row = byBucket.get(b.key);
        return { bucket: b, value: row ? metric.value(row) : null };
      }),
    };
  });
}
