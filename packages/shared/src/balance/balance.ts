// Saldo das contas: previsão de duração e alertas. Nada é inventado:
// sem "disponível" informado pela API, não há previsão nem alerta de saldo baixo.

export type BalanceIssue =
  | "pagamento_pendente"
  | "cobranca_problema"
  | "conta_limitada"
  | "conta_desativada"
  | "sem_saldo"
  | "sem_forma_pagamento";

export type BalanceAlertCode = BalanceIssue | "saldo_baixo";
export type BalanceSeverity = "critical" | "warning";

export interface BalanceAlert {
  code: BalanceAlertCode;
  severity: BalanceSeverity;
  label: string;
}

export const BALANCE_ALERTS: Record<BalanceAlertCode, { label: string; severity: BalanceSeverity }> = {
  sem_saldo: { label: "Sem saldo (limite atingido)", severity: "critical" },
  saldo_baixo: { label: "Saldo baixo", severity: "warning" },
  pagamento_pendente: { label: "Pagamento pendente", severity: "critical" },
  cobranca_problema: { label: "Problema na cobrança", severity: "critical" },
  conta_desativada: { label: "Conta desativada", severity: "critical" },
  conta_limitada: { label: "Conta limitada", severity: "warning" },
  sem_forma_pagamento: { label: "Sem forma de pagamento ativa", severity: "warning" },
};

/** Status da conta (ad_accounts.status) que já indicam um problema. */
const STATUS_ISSUES: Record<string, BalanceIssue> = {
  pagamento_pendente: "pagamento_pendente",
  restrita: "conta_limitada",
  desativada: "conta_desativada",
};

export interface BalanceInput {
  status: string;
  available_micros: number | null;
  spend_last_7_days_micros: number | null;
  /** Quantos dias (dos últimos 7 completos) têm dados de gasto. */
  spend_days: number;
  low_balance_days: number;
  low_balance_amount_micros: number | null;
  issues: string[];
  captured_at: string | null;
}

export interface BalanceAssessment {
  /** Gasto médio por dia (micros), nos dias com dados. null = sem histórico. */
  avgDailySpendMicros: number | null;
  /** Quantos dias o disponível dura no ritmo atual. null = não dá para prever. */
  forecastDays: number | null;
  alerts: BalanceAlert[];
  /** Fotografia com mais de 24 horas. */
  stale: boolean;
}

const alert = (code: BalanceAlertCode): BalanceAlert => ({ code, ...BALANCE_ALERTS[code] });

export function assessBalance(b: BalanceInput, now: Date = new Date()): BalanceAssessment {
  const avg = b.spend_days > 0 && b.spend_last_7_days_micros != null ? b.spend_last_7_days_micros / b.spend_days : null;
  const forecastDays = b.available_micros != null && avg != null && avg > 0 ? b.available_micros / avg : null;

  const codes = new Set<BalanceAlertCode>();
  for (const issue of b.issues) if (issue in BALANCE_ALERTS) codes.add(issue as BalanceIssue);
  const fromStatus = STATUS_ISSUES[b.status];
  if (fromStatus) codes.add(fromStatus);

  if (b.available_micros === 0) codes.add("sem_saldo");
  else if (b.available_micros != null && !codes.has("sem_saldo")) {
    const byDays = forecastDays != null && forecastDays < b.low_balance_days;
    const byAmount = b.low_balance_amount_micros != null && b.available_micros <= b.low_balance_amount_micros;
    if (byDays || byAmount) codes.add("saldo_baixo");
  }

  const alerts = [...codes].map(alert).sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "critical" ? -1 : 1));
  const stale = b.captured_at != null && now.getTime() - Date.parse(b.captured_at) > 24 * 3600 * 1000;
  return { avgDailySpendMicros: avg, forecastDays, alerts, stale };
}

/** "3,5 dias" → texto amigável da previsão. */
export function describeForecast(days: number): string {
  if (days < 1) return "menos de 1 dia";
  if (days > 365) return "mais de 1 ano";
  const whole = Math.floor(days);
  return `cerca de ${whole} ${whole === 1 ? "dia" : "dias"}`;
}
