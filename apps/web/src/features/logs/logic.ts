import { auditActionLabel, describeAuditDetails } from "@backstage/shared";
import type { AuditRow } from "./api.ts";

/** Períodos do filtro. "todos" = sem limite de data. */
export const LOG_PERIODS = [
  { value: "1", label: "Últimas 24 horas" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "todos", label: "Tudo" },
] as const;
export type LogPeriod = (typeof LOG_PERIODS)[number]["value"];

export function periodStart(period: LogPeriod, now: Date = new Date()): string | null {
  if (period === "todos") return null;
  return new Date(now.getTime() - Number(period) * 86_400_000).toISOString();
}

/** Quem fez: nome, e-mail ou "Sistema" (agendador e servidor). */
export function actorLabel(r: Pick<AuditRow, "actor_id" | "actor_name" | "actor_email">): string {
  if (!r.actor_id) return "Sistema (automático)";
  return r.actor_name ?? r.actor_email ?? "Usuário removido";
}

/** Planilha (CSV) do que está na tela — abre no Excel/Google Planilhas em português. */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\n");
}

export function auditCsvRows(rows: AuditRow[]): string[][] {
  return [
    ["Data e hora", "Quem", "E-mail", "O que fez", "Onde", "Detalhes"],
    ...rows.map((r) => [
      new Date(r.created_at).toLocaleString("pt-BR"),
      actorLabel(r),
      r.actor_email ?? "",
      auditActionLabel(r.action),
      r.target_label ?? "",
      describeAuditDetails(r.action, r.details).join(" | "),
    ]),
  ];
}

export function downloadCsv(name: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
