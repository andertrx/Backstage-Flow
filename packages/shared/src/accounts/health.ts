// Saúde da conta: junta status da plataforma, saldo, sincronização e conexão
// num único status (o pior encontrado) + a lista de motivos, em português.
import { assessBalance, type BalanceInput } from "../balance/balance.ts";

export const HEALTH_STATUSES = ["desativada", "pagamento_pendente", "restrita", "erro_sincronizacao", "atencao", "ativa"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

/** Ordem = gravidade (o primeiro é o pior). */
export const HEALTH_LABELS: Record<HealthStatus, string> = {
  desativada: "Desativada",
  pagamento_pendente: "Pagamento pendente",
  restrita: "Restrita",
  erro_sincronizacao: "Erro de sincronização",
  atencao: "Atenção",
  ativa: "Ativa",
};

export const HEALTH_TONE: Record<HealthStatus, "danger" | "warning" | "success"> = {
  desativada: "danger",
  pagamento_pendente: "danger",
  restrita: "danger",
  erro_sincronizacao: "danger",
  atencao: "warning",
  ativa: "success",
};

export interface HealthInput extends BalanceInput {
  status_reason?: string | null;
  sync_status: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
  connection_id: string | null;
  /** null = conexão não visível para este papel (não é tratado como problema). */
  connection_status: string | null;
  connection_error: string | null;
}

export interface Health {
  status: HealthStatus;
  reasons: string[];
}

/** Sincronização considerada atrasada depois de 48 horas sem sucesso. */
const SYNC_LATE_MS = 48 * 3600 * 1000;

export function accountHealth(a: HealthInput, now: Date = new Date()): Health {
  const found = new Map<HealthStatus, string[]>();
  const add = (status: HealthStatus, reason: string) => found.set(status, [...(found.get(status) ?? []), reason]);

  // Status informado pela plataforma
  switch (a.status) {
    case "desativada": add("desativada", "Conta desativada pela plataforma."); break;
    case "encerrada": add("desativada", "Conta encerrada na plataforma."); break;
    case "pagamento_pendente": add("pagamento_pendente", "A plataforma informa pagamento pendente."); break;
    case "restrita": add("restrita", "Conta restrita ou em análise pela plataforma."); break;
    case "atencao": add("atencao", "A plataforma pede atenção (ex.: período de carência)."); break;
    case "desconhecida": add("atencao", "Status não reconhecido. Confira na plataforma."); break;
  }

  // Saldo e cobrança (sem repetir o que o status da plataforma já disse)
  const fromPlatform = new Set(found.keys());
  const addAlert = (status: HealthStatus, reason: string) => {
    if (!fromPlatform.has(status)) add(status, reason);
  };
  for (const alert of assessBalance(a, now).alerts) {
    if (alert.code === "conta_desativada") addAlert("desativada", `${alert.label}.`);
    else if (alert.code === "pagamento_pendente") addAlert("pagamento_pendente", `${alert.label}.`);
    else if (alert.code === "cobranca_problema") add("pagamento_pendente", `${alert.label}.`);
    else if (alert.code === "conta_limitada") addAlert("restrita", `${alert.label}.`);
    else add("atencao", `${alert.label}.`);
  }

  // Conexão e sincronização
  if (!a.connection_id) add("erro_sincronizacao", "Conta sem conexão com a plataforma. Vincule novamente.");
  else if (a.connection_status === "revogada") add("erro_sincronizacao", "A conexão com a plataforma foi desconectada.");
  else if (a.connection_status === "erro") add("erro_sincronizacao", a.connection_error || "A conexão com a plataforma está com erro.");
  if (a.sync_status === "erro") add("erro_sincronizacao", a.last_error_message || "A última sincronização falhou.");

  if (!a.last_success_at) add("atencao", "Ainda não sincronizada.");
  else if (now.getTime() - Date.parse(a.last_success_at) > SYNC_LATE_MS) add("atencao", "Sincronização atrasada (mais de 48 horas).");

  const status = HEALTH_STATUSES.find((s) => found.has(s)) ?? "ativa";
  const reasons = HEALTH_STATUSES.flatMap((s) => [...new Set(found.get(s) ?? [])]);
  return { status, reasons };
}
