import { auditActionLabel, describeAuditDetails, errorSourceLabel } from "@backstage/shared";
import type { AuditRow, ErrorLogRow } from "./api.ts";

export { downloadCsv, toCsv } from "@/lib/download.ts";

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

/** Onde o erro aconteceu, em uma linha (conta, cliente, pessoa, tela). */
export function errorWhere(r: Pick<ErrorLogRow, "account_name" | "client_name" | "user_name" | "context">): string {
  const parts: string[] = [];
  if (r.client_name) parts.push(`Cliente: ${r.client_name}`);
  if (r.account_name) parts.push(`Conta: ${r.account_name}`);
  if (r.user_name) parts.push(`Pessoa: ${r.user_name}`);
  if (r.context?.pagina) parts.push(`Tela: ${r.context.pagina}`);
  if (r.context?.funcao) parts.push(`Função: ${r.context.funcao}`);
  return parts.join(" · ");
}

export function errorCsvRows(rows: ErrorLogRow[]): string[][] {
  return [
    ["Data e hora", "Origem", "Código", "Mensagem mostrada", "Onde", "Detalhe técnico", "Contexto"],
    ...rows.map((r) => [
      new Date(r.occurred_at).toLocaleString("pt-BR"),
      errorSourceLabel(r.source),
      r.code,
      r.user_message ?? "",
      errorWhere(r),
      r.technical ?? "",
      Object.entries(r.context ?? {}).map(([k, v]) => `${k}: ${v}`).join(" | "),
    ]),
  ];
}
