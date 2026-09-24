// Comparação de períodos (tela Comparar): qual período entra na comparação e,
// para cada indicador, a diferença absoluta e a percentual.
import { KPI_DEFINITIONS, type KpiDefinition, type KpiKey, kpiVariation, type Variation } from "./kpis.ts";
import { addMonths, type DateRange, daysInRange, isValidRange, previousPeriod, samePeriodLastYear } from "./periods.ts";

export type CompareMode = "previous" | "previous_month" | "previous_year" | "custom";

export const COMPARE_MODE_LABELS: Record<CompareMode, string> = {
  previous: "Período anterior",
  previous_month: "Mesmos dias do mês anterior",
  previous_year: "Mesmo período do ano anterior",
  custom: "Outro período (personalizado)",
};

export const COMPARE_MODE_HINTS: Record<CompareMode, string> = {
  previous: "Os dias logo antes do período atual, com a mesma quantidade de dias.",
  previous_month: "As mesmas datas, um mês antes (ex.: 01/09 a 23/09 → 01/08 a 23/08).",
  previous_year: "As mesmas datas, um ano antes. Só funciona se o histórico já tiver esses dias.",
  custom: "Você escolhe as datas do período de comparação.",
};

/** Período de comparação para o modo escolhido. No personalizado, cai no anterior se as datas forem inválidas. */
export function compareRange(mode: CompareMode, current: DateRange, custom?: { from?: string | null; to?: string | null } | null): DateRange {
  switch (mode) {
    case "previous_month":
      return { from: addMonths(current.from, -1), to: addMonths(current.to, -1) };
    case "previous_year":
      return samePeriodLastYear(current);
    case "custom":
      if (custom?.from && custom.to && isValidRange({ from: custom.from, to: custom.to })) return { from: custom.from, to: custom.to };
      return previousPeriod(current);
    case "previous":
      return previousPeriod(current);
  }
}

/** Os dois períodos se sobrepõem (algum dia aparece nos dois)? */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/** Os dois períodos têm a mesma quantidade de dias? (totais só são comparáveis assim) */
export function sameLength(a: DateRange, b: DateRange): boolean {
  return daysInRange(a) === daysInRange(b);
}

/** Indicadores da comparação, na ordem pedida. */
export const COMPARISON_KPIS: KpiKey[] = ["spend", "leads", "cpl", "ctr", "cpc", "cpm", "conversions", "roas"];

export const COMPARISON_DEFINITIONS: KpiDefinition[] = COMPARISON_KPIS.map((key) => KPI_DEFINITIONS.find((d) => d.key === key)!);

export interface MetricComparison extends Variation {
  current: number | null;
  previous: number | null;
  /** Atual − anterior (na unidade da métrica; no CTR, em pontos percentuais). null = sem um dos dois. */
  difference: number | null;
}

export function compareMetric(current: number | null, previous: number | null, definition: KpiDefinition): MetricComparison {
  const difference = current == null || previous == null ? null : current - previous;
  return { current, previous, difference, ...kpiVariation(current, previous, definition.direction) };
}
