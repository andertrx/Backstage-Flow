import { assessBalance, type BalanceAlert, shownAvailableMicros } from "@backstage/shared";
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
 * e só dinheiro real: saldo pré-pago (PIX/boleto) e orçamento informados pela
 * API. Conta paga no cartão entra com R$ 0,00 (o limite nunca é somado).
 * Contas sem informação são contadas à parte.
 */
export function summarizeBalances(rows: AccountBalance[], preferredCurrency: string | null): BalanceTotals {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.currency) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  const currency = preferredCurrency && counts.has(preferredCurrency)
    ? preferredCurrency
    : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const inCurrency = rows.filter((r) => r.currency === currency);
  const known = inCurrency.map((r) => shownAvailableMicros(r)).filter((v): v is number => v != null);
  let alerts = 0;
  let critical = 0;
  for (const r of rows) {
    const found: BalanceAlert[] = assessBalance(r).alerts;
    if (found.length) alerts++;
    if (found.some((a) => a.severity === "critical")) critical++;
  }
  return {
    currency,
    availableMicros: known.length ? known.reduce((t, v) => t + v, 0) : null,
    reporting: known.length,
    total: inCurrency.length,
    alerts,
    critical,
  };
}
