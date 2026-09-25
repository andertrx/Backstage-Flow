import { FRESH_MINUTES } from "@backstage/shared";
import type { SyncOverviewRow, SyncRunResult } from "./api.ts";

/** Situação de uma conta na tela de Sincronização. */
export type AccountSyncState = "executando" | "sucesso" | "erro" | "pendente" | "sem_conexao" | "teste";

export const STATE_LABELS: Record<AccountSyncState, string> = {
  executando: "Sincronizando…",
  sucesso: "Sucesso",
  erro: "Erro",
  pendente: "Aguardando a primeira",
  sem_conexao: "Sem conexão",
  teste: "Conta de teste",
};

/** Contas que o agendador sincroniza sozinho (com conexão e que não são de teste). */
export const isScheduled = (r: SyncOverviewRow) => r.has_connection && !r.is_test_account;

export function accountState(r: SyncOverviewRow): AccountSyncState {
  if (!r.has_connection) return "sem_conexao";
  if (r.running) return "executando";
  if (r.is_test_account) return "teste";
  if (r.status === "sucesso" || r.status === "erro") return r.status;
  return "pendente";
}

/** 850 → "menos de 1 s"; 12_400 → "12 s"; 65_000 → "1 min 5 s". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return "menos de 1 s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

/** Próxima sincronização: "em 35 minutos", "em 1 hora" — ou "na fila" quando a hora já chegou. */
export function formatNext(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Na fila (começa em até 5 minutos)";
  const minutes = Math.ceil((Date.parse(iso) - now.getTime()) / 60_000);
  if (minutes <= 0) return "Na fila (começa em até 5 minutos)";
  if (minutes < 60) return `em ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return rest ? `em ${h} e ${rest} min` : `em ${h}`;
}

const max = (values: (string | null)[]) => values.reduce<string | null>((m, v) => (v && (!m || v > m) ? v : m), null);
const min = (values: (string | null)[]) => values.reduce<string | null>((m, v) => (v && (!m || v < m) ? v : m), null);

/** Resumo do topo: última sincronização terminada, próxima prevista e contagens. */
export function summarize(rows: SyncOverviewRow[]) {
  const scheduled = rows.filter(isScheduled);
  const states = rows.map(accountState);
  const lastFinished = max(rows.map((r) => r.run_finished_at));
  const lastRow = rows.find((r) => r.run_finished_at && r.run_finished_at === lastFinished) ?? null;
  // Conta na vez sem data marcada (nunca rodou) = "na fila"
  const due = scheduled.some((r) => !r.next_run_at && !r.running);
  return {
    total: rows.length,
    scheduled: scheduled.length,
    lastFinishedAt: lastFinished,
    lastStatus: lastRow?.run_status ?? null,
    lastSuccessAt: max(rows.map((r) => r.last_success_at)),
    nextRunAt: scheduled.length === 0 ? undefined : due ? null : min(scheduled.map((r) => r.next_run_at)),
    success: states.filter((s) => s === "sucesso").length,
    errors: states.filter((s) => s === "erro").length,
    running: states.filter((s) => s === "executando").length,
  };
}

/** Mensagem depois do "Sincronizar agora". */
export function describeRun(r: SyncRunResult): string {
  const fresh = r.fresh ?? 0;
  const freshText = `${fresh} ${fresh === 1 ? "conta já estava atualizada" : "contas já estavam atualizadas"} (sincronizada${fresh === 1 ? "" : "s"} há menos de ${FRESH_MINUTES} minutos): usamos os dados guardados, sem chamar as APIs.`;
  if (!r.results.length && fresh && !r.queued && !r.alreadyRunning) {
    return fresh === 1 ? `A conta já estava atualizada (sincronizada há menos de ${FRESH_MINUTES} minutos): usamos os dados guardados, sem chamar as APIs.`
      : `Todas as ${fresh} contas já estavam atualizadas (sincronizadas há menos de ${FRESH_MINUTES} minutos): usamos os dados guardados, sem chamar as APIs.`;
  }
  const ok = r.results.filter((x) => x.status === "sucesso").length;
  const failed = r.results.length - ok;
  const records = r.results.reduce((t, x) => t + x.records, 0);
  const parts = [
    `${r.results.length} ${r.results.length === 1 ? "conta sincronizada" : "contas sincronizadas"}`,
    `${ok} com sucesso`,
    ...(failed ? [`${failed} com erro`] : []),
    `${records.toLocaleString("pt-BR")} ${records === 1 ? "registro atualizado" : "registros atualizados"}`,
  ];
  let text = `${parts.join(" · ")}.`;
  if (r.alreadyRunning) text += ` ${r.alreadyRunning} já ${r.alreadyRunning === 1 ? "estava" : "estavam"} sincronizando.`;
  if (r.queued) text += ` ${r.queued} ${r.queued === 1 ? "ficou" : "ficaram"} na fila e ${r.queued === 1 ? "será sincronizada" : "serão sincronizadas"} em poucos minutos.`;
  if (fresh) text += ` ${freshText}`;
  return text;
}
