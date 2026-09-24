// Central de alertas: nomes, gravidades e situações, em português.
// Os tipos e gravidades são os mesmos da tabela public.alerts.

export const ALERT_TYPES = [
  "sem_saldo",
  "saldo_baixo",
  "conta_restrita",
  "conta_desativada",
  "pagamento_pendente",
  "cobranca_problema",
  "sem_forma_pagamento",
  "sincronizacao_atrasada",
  "erro_api",
  "campanha_sem_entrega",
  "queda_resultados",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  sem_saldo: "Conta sem saldo",
  saldo_baixo: "Saldo baixo",
  conta_restrita: "Conta restrita",
  conta_desativada: "Conta desativada",
  pagamento_pendente: "Problema de pagamento",
  cobranca_problema: "Problema na cobrança",
  sem_forma_pagamento: "Sem forma de pagamento",
  sincronizacao_atrasada: "Sincronização atrasada",
  erro_api: "Erro na API",
  campanha_sem_entrega: "Campanha sem entrega",
  queda_resultados: "Queda significativa de resultados",
};

/** Da mais grave para a menos grave. */
export const ALERT_SEVERITIES = ["critica", "alta", "media"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = { critica: "Crítica", alta: "Alta", media: "Média" };
/** Símbolos pedidos no projeto: 🔴 crítica · 🟠 alta · 🟡 média. */
export const ALERT_SEVERITY_EMOJI: Record<AlertSeverity, string> = { critica: "🔴", alta: "🟠", media: "🟡" };

export const ALERT_STATUSES = ["aberto", "visto", "resolvido"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = { aberto: "Aberto", visto: "Visto", resolvido: "Resolvido" };

export interface SortableAlert {
  severity: AlertSeverity;
  status: AlertStatus;
  first_seen_at: string;
}

/** Ordem da lista: não resolvidos primeiro, depois o mais grave, depois o mais recente. */
export function compareAlerts(a: SortableAlert, b: SortableAlert): number {
  const resolved = Number(a.status === "resolvido") - Number(b.status === "resolvido");
  if (resolved) return resolved;
  const sev = ALERT_SEVERITIES.indexOf(a.severity) - ALERT_SEVERITIES.indexOf(b.severity);
  if (sev) return sev;
  return b.first_seen_at.localeCompare(a.first_seen_at);
}

/** Quantos alertas NÃO resolvidos existem em cada gravidade. */
export function countOpenBySeverity(alerts: SortableAlert[]): Record<AlertSeverity, number> {
  const out: Record<AlertSeverity, number> = { critica: 0, alta: 0, media: 0 };
  for (const a of alerts) if (a.status !== "resolvido") out[a.severity] += 1;
  return out;
}
