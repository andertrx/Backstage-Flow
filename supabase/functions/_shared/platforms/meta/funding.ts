import type { AccountFunding, FundingIssue } from "../types.ts";
import type { RawAdAccount } from "./mapping.ts";

/**
 * Valores de dinheiro da Marketing API (amount_spent, balance, spend_cap) vêm
 * como texto na MENOR unidade da moeda (centavos no BRL/USD). Algumas moedas
 * não têm centavos no Meta (lista "offset 1" da documentação de moedas).
 */
const NO_CENTS = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

export function metaMoneyToMicros(value: unknown, currency: string | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const offset = currency && NO_CENTS.has(currency.toUpperCase()) ? 1 : 100;
  return Math.round((n * 1_000_000) / offset);
}

export interface RawFundingAccount extends RawAdAccount {
  amount_spent?: string;
  balance?: string;
  spend_cap?: string;
  funding_source_details?: { type?: number; display_string?: string };
}

/**
 * Status/motivos do Meta → problemas de cobrança:
 *   account_status 3 (UNSETTLED) e 8 (PENDING_SETTLEMENT) → pagamento pendente
 *   9 (IN_GRACE_PERIOD) ou disable_reason 3 (RISK_PAYMENT) → problema na cobrança
 *   7 (PENDING_RISK_REVIEW) → conta limitada · 2 (DISABLED) → conta desativada
 */
export function mapMetaFunding(raw: RawFundingAccount): AccountFunding {
  const currency = raw.currency?.toUpperCase() ?? null;
  const spent = metaMoneyToMicros(raw.amount_spent, currency);
  const capRaw = metaMoneyToMicros(raw.spend_cap, currency);
  // spend_cap = 0 significa "sem limite de gastos" (documentação do Meta).
  const cap = capRaw && capRaw > 0 ? capRaw : null;
  const available = cap != null && spent != null ? Math.max(0, cap - spent) : null;

  const issues = new Set<FundingIssue>();
  const status = raw.account_status;
  if (status === 3 || status === 8) issues.add("pagamento_pendente");
  if (status === 9 || raw.disable_reason === 3) issues.add("cobranca_problema");
  if (status === 7) issues.add("conta_limitada");
  if (status === 2) issues.add("conta_desativada");
  if (available === 0) issues.add("sem_saldo");

  return {
    currency,
    amountSpentMicros: spent,
    amountDueMicros: metaMoneyToMicros(raw.balance, currency),
    spendCapMicros: cap,
    budgetMicros: null,
    availableMicros: available,
    availableBasis: available != null ? "meta_spend_cap" : null,
    budgetEndAt: null,
    fundingDescription: raw.funding_source_details?.display_string?.trim() || null,
    issues: [...issues],
    raw: {
      account_status: raw.account_status ?? null,
      disable_reason: raw.disable_reason ?? null,
      amount_spent: raw.amount_spent ?? null,
      balance: raw.balance ?? null,
      spend_cap: raw.spend_cap ?? null,
      is_prepay_account: raw.is_prepay_account ?? null,
      funding_source_type: raw.funding_source_details?.type ?? null,
    },
  };
}
