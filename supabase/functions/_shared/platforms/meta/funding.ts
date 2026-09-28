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

/** Forma de pagamento em uso (funding_source_details.type). */
export const META_FUNDING_CREDIT_CARD = 1;
/** Saldo pré-pago (recargas por PIX ou boleto): o texto traz "Saldo disponível (R$1.345,32 BRL)". */
export const META_FUNDING_PREPAID_BALANCE = 20;

/**
 * Lê o saldo pré-pago do texto oficial do Meta, ex. "Saldo disponível (R$1.345,32 BRL)".
 * Só aceita quando a moeda escrita é a moeda da conta; senão devolve null (não inventa).
 * Aceita "1.345,32" e "1,345.32": o separador decimal é o último ponto/vírgula seguido de 1 ou 2 dígitos.
 */
export function parseMetaPrepaidBalance(display: string | null | undefined, currency: string | null): number | null {
  if (!display || !currency) return null;
  const m = /\(\s*[^\d(]*?([\d][\d.,\s]*)\s+([A-Z]{3})\s*\)/.exec(display);
  if (!m || m[2] !== currency.toUpperCase()) return null;
  const num = m[1].replace(/\s/g, "");
  const dec = /[.,](\d{1,2})$/.exec(num);
  const whole = (dec ? num.slice(0, dec.index) : num).replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole)) return null;
  const value = Number(`${whole}.${dec ? dec[1].padEnd(2, "0") : "00"}`);
  return Number.isFinite(value) ? Math.round(value * 1_000_000) : null;
}

/**
 * Status/motivos do Meta → problemas de cobrança:
 *   account_status 3 (UNSETTLED) e 8 (PENDING_SETTLEMENT) → pagamento pendente
 *   9 (IN_GRACE_PERIOD) ou disable_reason 3 (RISK_PAYMENT) → problema na cobrança
 *   7 (PENDING_RISK_REVIEW) → conta limitada · 2 (DISABLED) → conta desativada
 *
 * Valor disponível (correção de 28/09/2026): o limite de gastos (spend_cap) NÃO é
 * dinheiro na conta. Disponível só existe para saldo pré-pago (PIX/boleto), com o
 * valor que o próprio Meta informa. Conta paga no cartão não tem saldo em conta:
 * fica "meta_card" (a tela mostra R$ 0,00) e não gera alerta de "sem saldo".
 */
export function mapMetaFunding(raw: RawFundingAccount): AccountFunding {
  const currency = raw.currency?.toUpperCase() ?? null;
  const spent = metaMoneyToMicros(raw.amount_spent, currency);
  const capRaw = metaMoneyToMicros(raw.spend_cap, currency);
  // spend_cap = 0 significa "sem limite de gastos" (documentação do Meta).
  const cap = capRaw && capRaw > 0 ? capRaw : null;
  const type = raw.funding_source_details?.type;
  const display = raw.funding_source_details?.display_string?.trim() || null;
  const prepaid = type === META_FUNDING_PREPAID_BALANCE || raw.is_prepay_account === true;
  const available = prepaid ? parseMetaPrepaidBalance(display, currency) : null;
  const basis: AccountFunding["availableBasis"] = available != null
    ? "meta_prepaid_balance"
    : type === META_FUNDING_CREDIT_CARD ? "meta_card" : null;

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
    availableBasis: basis,
    budgetEndAt: null,
    fundingDescription: display,
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
