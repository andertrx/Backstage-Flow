// Regras de exibição dos cards: qual valor mostrar e, quando não há valor, POR QUÊ.
import type { KpiKey, MetricTotals } from "@backstage/shared";

export const NOT_AVAILABLE = "Informação não disponível pela API.";

/** Motivo de um card estar sem valor (nunca mostramos um número inventado). */
export function missingReason(key: KpiKey, t: MetricTotals): string {
  const zeroOrMissing = (value: number | null, zeroText: string) => (value == null ? NOT_AVAILABLE : value === 0 ? zeroText : NOT_AVAILABLE);
  switch (key) {
    case "cpl":
      return zeroOrMissing(t.leads, "Sem leads no período.");
    case "cpc":
      return zeroOrMissing(t.clicks, "Sem cliques no período.");
    case "conversion_value":
      return t.conversion_value_micros === 0 ? "Sem valor de conversão informado no período." : NOT_AVAILABLE;
    case "cpa":
      return zeroOrMissing(t.conversions, "Sem conversões no período.");
    case "cpm":
    case "ctr":
      return zeroOrMissing(t.impressions, "Sem impressões no período.");
    case "roas":
      if (t.conversion_value_micros === 0) return "Sem valor de conversão informado no período.";
      if (t.spend_micros === 0) return "Sem investimento no período.";
      return NOT_AVAILABLE;
    default:
      return NOT_AVAILABLE;
  }
}

/** Escolhe a moeda exibida: a pedida (se existir) ou a de maior investimento. */
export function pickCurrency(currencies: string[], requested: string | null): string | null {
  if (requested && currencies.includes(requested)) return requested;
  return currencies[0] ?? null;
}
