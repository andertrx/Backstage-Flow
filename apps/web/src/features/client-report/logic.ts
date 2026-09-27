import {
  addDays, type DateRange, daysInRange, isValidRange, type MainResult, mainResultValue, REPORT_PERIODS, type ReportPeriod, resolvePeriod,
} from "@backstage/shared";
import { formatDate } from "@/lib/format.ts";
import type { ReportDailyRow } from "./api.ts";

export const MAX_REPORT_DAYS = 400;

export type PeriodChoice = ReportPeriod | "custom";

export interface ReportPeriodState {
  choice: PeriodChoice;
  range: DateRange;
  /** Motivo quando o período personalizado não vale (a tela mostra e usa o padrão). */
  invalid: string | null;
}

/** Período da tela: ?periodo=… (ou personalizado ?de=&ate=); sem nada = padrão do cliente. */
export function reportPeriodFromParams(params: URLSearchParams, fallback: ReportPeriod, timezone: string, now = new Date()): ReportPeriodState {
  const p = params.get("periodo");
  if (p === "custom") {
    const range = { from: params.get("de") ?? "", to: params.get("ate") ?? "" };
    if (!isValidRange(range)) return { choice: fallback, range: resolvePeriod(fallback, timezone, now), invalid: "Datas inválidas: mostrando o período padrão." };
    if (daysInRange(range) > MAX_REPORT_DAYS) {
      return { choice: fallback, range: resolvePeriod(fallback, timezone, now), invalid: `Escolha no máximo ${MAX_REPORT_DAYS} dias.` };
    }
    return { choice: "custom", range, invalid: null };
  }
  const choice = (REPORT_PERIODS as readonly string[]).includes(p ?? "") ? (p as ReportPeriod) : fallback;
  return { choice, range: resolvePeriod(choice, timezone, now), invalid: null };
}

export const rangeText = (r: DateRange) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} a ${formatDate(r.to)}`);

/** Todos os dias do período (o gráfico mostra buraco onde não há dado). */
export function daysOf(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to && out.length <= MAX_REPORT_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

export type DailyMetric = "spend" | "result" | "cost_per_result" | "ctr";

/** Valor por dia (null = sem dado naquele dia, ou sem base para calcular). */
export function dailyValues(rows: ReportDailyRow[], days: string[], metric: DailyMetric, main: MainResult): (number | null)[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return days.map((d) => {
    const r = byDate.get(d);
    if (!r) return null;
    const result = mainResultValue(r, main);
    switch (metric) {
      case "spend": return r.spend_micros == null ? null : r.spend_micros / 1_000_000;
      case "result": return result;
      case "cost_per_result": return r.spend_micros == null || !result ? null : r.spend_micros / 1_000_000 / result;
      case "ctr": {
        const clicks = r.link_clicks ?? r.clicks;
        return clicks == null || !r.impressions ? null : (clicks / r.impressions) * 100;
      }
    }
  });
}

export { summarySentence } from "@backstage/shared";

/** Lista "A, B e C". */
export function joinPt(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Nome sugerido para o arquivo PDF (o navegador usa o título da página). */
export function pdfTitle(clientName: string, range: DateRange): string {
  return `Relatório ${clientName} ${range.from} a ${range.to}`.replace(/[\\/:*?"<>|]+/g, "-");
}
