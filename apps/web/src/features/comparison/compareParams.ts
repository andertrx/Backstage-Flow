// Escolha do período de comparação, guardada no endereço (?comparar=ano ...),
// ao lado dos filtros do Dashboard.
import { type CompareMode, isValidRange } from "@backstage/shared";

export const COMPARE_PARAMS = { mode: "comparar", from: "comp_de", to: "comp_ate" } as const;

const MODE_BY_PARAM: Record<string, CompareMode> = {
  anterior: "previous",
  mes: "previous_month",
  ano: "previous_year",
  personalizado: "custom",
};
const PARAM_BY_MODE = Object.fromEntries(Object.entries(MODE_BY_PARAM).map(([k, v]) => [v, k])) as Record<CompareMode, string>;

export const COMPARE_MODES: CompareMode[] = ["previous", "previous_month", "previous_year", "custom"];

export interface CompareChoice {
  mode: CompareMode;
  /** Só no personalizado (datas válidas). */
  from: string | null;
  to: string | null;
}

export function parseCompare(params: URLSearchParams): CompareChoice {
  const mode = MODE_BY_PARAM[params.get(COMPARE_PARAMS.mode) ?? ""] ?? "previous";
  const from = params.get(COMPARE_PARAMS.from);
  const to = params.get(COMPARE_PARAMS.to);
  const ok = mode === "custom" && from && to && isValidRange({ from, to });
  return { mode, from: ok ? from : null, to: ok ? to : null };
}

/** Grava a escolha no endereço, preservando os demais parâmetros (filtros). */
export function writeCompare(current: URLSearchParams, choice: CompareChoice): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const name of Object.values(COMPARE_PARAMS)) next.delete(name);
  if (choice.mode !== "previous") next.set(COMPARE_PARAMS.mode, PARAM_BY_MODE[choice.mode]);
  if (choice.mode === "custom" && choice.from && choice.to) {
    next.set(COMPARE_PARAMS.from, choice.from);
    next.set(COMPARE_PARAMS.to, choice.to);
  }
  return next;
}
