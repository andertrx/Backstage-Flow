// Histórico de alterações em português: "Status: Ativa → Pausada".
import { ENTITY_STATUS_LABELS, type EntityStatus, objectiveLabel, reviewInfo } from "@backstage/shared";
import { formatDate, formatMoney } from "@/lib/format.ts";
import type { EntityChange } from "./types.ts";

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  budget_micros: "Orçamento",
  budget_period: "Tipo de orçamento",
  name: "Nome",
  objective: "Objetivo",
  end_date: "Data de término",
  review_status: "Revisão",
};

const EMPTY = "(vazio)";

function formatValue(field: string, value: unknown, currency: string): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  switch (field) {
    case "status":
      return ENTITY_STATUS_LABELS[value as EntityStatus] ?? String(value);
    case "budget_micros":
      return formatMoney(Number(value) / 1_000_000, currency);
    case "budget_period":
      return value === "vitalicio" ? "Vitalício (total)" : value === "diario" ? "Diário" : String(value);
    case "objective":
      return objectiveLabel(String(value)) ?? String(value);
    case "review_status":
      return reviewInfo(String(value))?.label ?? String(value);
    case "end_date":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? formatDate(String(value)) : String(value);
    default:
      return String(value);
  }
}

export interface ChangeText {
  label: string;
  from: string;
  to: string;
}

export function describeChange(change: EntityChange, currency: string | null): ChangeText {
  const cur = currency ?? "BRL";
  return {
    label: FIELD_LABELS[change.field] ?? change.field,
    from: formatValue(change.field, change.old_value, cur),
    to: formatValue(change.field, change.new_value, cur),
  };
}
