import {
  addDays, type DateRange, daysInRange, isValidRange, type MainResult, mainResultValue, REPORT_PERIODS, type ReportPeriod, resolvePeriod,
  type SummaryParts,
} from "@backstage/shared";
import { formatChange, formatDate, formatKpi } from "@/lib/format.ts";
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

const lower = (label: string) => (label === label.toUpperCase() ? label : label.toLowerCase());

/**
 * Frase de resumo, só com fatos do período:
 * "Foram investidos R$ 700,00 e gerados 50 leads, a R$ 14,00 cada. Comparado ao período anterior: 25,0% mais leads e custo por resultado 20,0% menor."
 */
export function summarySentence(s: SummaryParts, main: MainResult, currency: string): string {
  if (s.spend == null) return "Sem investimento registrado neste período.";
  const money = (v: number) => formatKpi(v, "money", currency);
  const name = lower(main.label);
  let text = `Foram investidos ${money(s.spend)}`;
  if (s.result == null) text += ".";
  else if (s.result === 0) text += `, sem ${name} no período.`;
  else {
    text += ` e gerados ${formatKpi(s.result, "decimal", currency)} ${name}`;
    text += s.costPerResult != null ? `, a ${money(s.costPerResult)} cada.` : ".";
  }
  const parts: string[] = [];
  if (s.resultChange != null && Math.abs(s.resultChange) >= 0.05) {
    parts.push(`${formatChange(Math.abs(s.resultChange)).replace("+", "")} ${s.resultChange > 0 ? "mais" : "menos"} ${name}`);
  }
  if (s.costChange != null && Math.abs(s.costChange) >= 0.05) {
    parts.push(`custo por resultado ${formatChange(Math.abs(s.costChange)).replace("+", "")} ${s.costChange > 0 ? "maior" : "menor"}`);
  }
  if (parts.length) text += ` Comparado ao período anterior: ${parts.join(" e ")}.`;
  return text;
}

/** Lista "A, B e C". */
export function joinPt(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Nome sugerido para o arquivo PDF (o navegador usa o título da página). */
export function pdfTitle(clientName: string, range: DateRange): string {
  return `Relatório ${clientName} ${range.from} a ${range.to}`.replace(/[\\/:*?"<>|]+/g, "-");
}
