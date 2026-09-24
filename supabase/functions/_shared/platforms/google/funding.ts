import type { AccountFunding, FundingIssue, PlatformAccount } from "../types.ts";

/** Orçamento da conta (recurso account_budget). A API responde em camelCase; int64 vem como texto. */
export interface RawAccountBudget {
  id?: string;
  status?: string;
  approvedSpendingLimitMicros?: string;
  approvedSpendingLimitType?: string;
  adjustedSpendingLimitMicros?: string;
  adjustedSpendingLimitType?: string;
  amountServedMicros?: string;
  approvedStartDateTime?: string;
  approvedEndDateTime?: string;
  approvedEndTimeType?: string;
}

export interface RawBillingSetup {
  id?: string;
  status?: string;
}

export const ACCOUNT_BUDGET_QUERY =
  "SELECT account_budget.id, account_budget.status, account_budget.approved_spending_limit_micros, account_budget.approved_spending_limit_type, " +
  "account_budget.adjusted_spending_limit_micros, account_budget.adjusted_spending_limit_type, account_budget.amount_served_micros, " +
  "account_budget.approved_start_date_time, account_budget.approved_end_date_time, account_budget.approved_end_time_type " +
  "FROM account_budget WHERE account_budget.status = 'APPROVED'";

export const BILLING_SETUP_QUERY = "SELECT billing_setup.id, billing_setup.status FROM billing_setup";

const int = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "2026-10-31 23:59:59" no fuso da conta → instante em UTC (ISO). */
export function zonedToIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(local);
  if (!m) return null;
  const guess = Date.parse(`${m[1]}T${m[2]}Z`);
  const shown = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .format(new Date(guess));
  const diff = Date.parse(`${shown.replace(" ", "T")}Z`) - guess;
  return new Date(guess - diff).toISOString();
}

/** Agora, no formato do Google ("yyyy-MM-dd HH:mm:ss") e no fuso da conta. */
export function nowInZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
}

/** Orçamento vigente: já começou e ainda não terminou. */
export function activeBudget(budgets: RawAccountBudget[], nowLocal: string): RawAccountBudget | null {
  return budgets.find((b) =>
    (!b.approvedStartDateTime || b.approvedStartDateTime <= nowLocal) &&
    (!b.approvedEndDateTime || b.approvedEndTimeType === "FOREVER" || b.approvedEndDateTime > nowLocal)
  ) ?? null;
}

/**
 * Google Ads → saldo/cobrança.
 * - Disponível = limite do orçamento da conta − valor já veiculado (amount_served),
 *   só quando existe orçamento com limite (faturamento mensal/crédito). Pagamento
 *   automático por cartão não tem limite na API → "não disponível".
 * - billing_setup: nenhum aprovado + algum pendente → pagamento pendente;
 *   nenhum ativo → sem forma de pagamento. `billing` = null quando não foi possível ler.
 */
export function mapGoogleFunding(
  account: PlatformAccount,
  budgets: RawAccountBudget[] | null,
  billing: RawBillingSetup[] | null,
  now = new Date(),
): AccountFunding {
  const tz = account.timezone ?? "America/Sao_Paulo";
  const budget = budgets ? activeBudget(budgets, nowInZone(tz, now)) : null;
  const approved = budget && budget.approvedSpendingLimitType !== "INFINITE" ? int(budget.approvedSpendingLimitMicros) : null;
  const adjusted = budget && budget.adjustedSpendingLimitType !== "INFINITE" ? int(budget.adjustedSpendingLimitMicros) : null;
  const limit = adjusted ?? approved;
  const served = budget ? int(budget.amountServedMicros) : null;
  const available = limit != null && served != null ? Math.max(0, limit - served) : null;

  const issues = new Set<FundingIssue>();
  if (account.status === "restrita") issues.add("conta_limitada");
  if (account.status === "encerrada") issues.add("conta_desativada");
  if (billing && !account.isTestAccount) {
    const statuses = billing.map((b) => b.status);
    if (!statuses.includes("APPROVED")) {
      if (statuses.includes("PENDING") || statuses.includes("APPROVED_HELD")) issues.add("pagamento_pendente");
      else issues.add("sem_forma_pagamento");
    }
  }
  if (available === 0) issues.add("sem_saldo");

  const endLocal = budget?.approvedEndTimeType === "FOREVER" ? null : budget?.approvedEndDateTime;
  return {
    currency: account.currency,
    amountSpentMicros: served,
    amountDueMicros: null,
    spendCapMicros: limit,
    budgetMicros: approved,
    availableMicros: available,
    availableBasis: available != null ? "google_account_budget" : null,
    budgetEndAt: endLocal ? zonedToIso(endLocal, tz) : null,
    fundingDescription: null,
    issues: [...issues],
    raw: {
      customer_status: account.rawStatus,
      account_budget: budget ?? null,
      account_budget_readable: budgets !== null,
      billing_setup_statuses: billing?.map((b) => b.status) ?? null,
    },
  };
}
