// Etapa 36.7 — painel operacional, visões salvas e busca da Central.
// Tudo o que o painel mostra vem do banco (só o que a pessoa pode ver).
import { opsAddDays } from "./tasks.ts";

export const OPS_SAVED_VIEW_PAGES = ["tarefas", "comercial", "reunioes", "painel"] as const;
export type OpsSavedViewPage = (typeof OPS_SAVED_VIEW_PAGES)[number];
export const OPS_SAVED_VIEW_MAX = 30;
export const OPS_SAVED_VIEW_NAME_MAX = 60;

export type OpsViewFilterValue = string | boolean | string[];
export type OpsViewFilters = Record<string, OpsViewFilterValue>;

/**
 * Guarda só os filtros conhecidos daquela tela e só valores simples
 * (texto, sim/não ou lista de textos). Vazio e "não" não são guardados.
 */
export function opsCleanViewFilters(filters: Record<string, unknown> | null | undefined, allowed: readonly string[]): OpsViewFilters {
  const out: OpsViewFilters = {};
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return out;
  for (const key of allowed) {
    const v = filters[key];
    if (typeof v === "string") {
      if (v.trim() !== "") out[key] = v.trim().slice(0, 200);
    } else if (v === true) {
      out[key] = true;
    } else if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 50);
      if (list.length > 0) out[key] = list;
    }
  }
  return out;
}

/** Nome de visão: sem espaços nas pontas, de 1 a 60 letras. */
export function opsViewNameError(name: string): string | null {
  const n = name.trim();
  if (n.length === 0) return "Dê um nome à visão.";
  if (n.length > OPS_SAVED_VIEW_NAME_MAX) return `Use até ${OPS_SAVED_VIEW_NAME_MAX} letras.`;
  return null;
}

export const OPS_DASHBOARD_PERIODS = [7, 30, 90] as const;
export type OpsDashboardPeriod = (typeof OPS_DASHBOARD_PERIODS)[number];

/** Período das concluídas: os últimos N dias contando hoje (datas de Brasília). */
export function opsDashboardRange(days: number, today: string): { from: string; to: string } {
  return { from: opsAddDays(today, -(Math.max(1, Math.floor(days)) - 1)), to: today };
}

export const OPS_SEARCH_KIND_LABELS = { tarefa: "Tarefa", reuniao: "Reunião", cliente: "Cliente", lead: "Lead" } as const;
export type OpsSearchKind = keyof typeof OPS_SEARCH_KIND_LABELS;
