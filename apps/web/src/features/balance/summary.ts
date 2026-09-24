import { assessBalance, type BalanceAlert } from "@backstage/shared";
import type { AccountBalance } from "./types.ts";

export interface BalanceTotals {
  currency: string | null;
  /** Soma do disponível das contas que informam (na moeda escolhida). */
  availableMicros: number | null;
  reporting: number;
  total: number;
  alerts: number;
  critical: number;
}

/**
 * Resumo para o cartão "Saldo" do dashboard. Só soma contas da MESMA moeda
 * e só as que a API informa o disponível — as demais são contadas à parte.
 */
export function summarizeBalances(rows: AccountBalance[], preferredCurrency: string | null): BalanceTotals {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.currency) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  const currency = preferredCurrency && counts.has(preferredCurrency)
    ? preferredCurrency
    : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const inCurrency = rows.filter((r) => r.currency === currency);
  const known = inCurrency.filter((r) => r.available_micros != null);
  let alerts = 0;
  let critical = 0;
  for (const r of rows) {
    const found: BalanceAlert[] = assessBalance(r).alerts;
    if (found.length) alerts++;
    if (found.some((a) => a.severity === "critical")) critical++;
  }
  return {
    currency,
    availableMicros: known.length ? known.reduce((t, r) => t + (r.available_micros ?? 0), 0) : null,
    reporting: known.length,
    total: inCurrency.length,
    alerts,
    critical,
  };
}
