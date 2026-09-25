/**
 * Cache da sincronização (Etapa 24): antes de chamar as APIs, olha o que já
 * está guardado no banco.
 *   * "Sincronizar agora": conta sincronizada há menos de 10 min é pulada
 *     (os dados guardados já são recentes).
 *   * Ao abrir uma página (onlyStale): só as contas desatualizadas (> 90 min
 *     ou nunca sincronizadas) são buscadas.
 */
import { isRecent, isStale } from "../../../../packages/shared/src/sync/freshness.ts";

export interface CacheState {
  adAccountId: string;
  lastSuccessAt: string | null;
}

export function pickForSync(states: CacheState[], onlyStale: boolean, now: Date = new Date()): { sync: string[]; fresh: string[] } {
  const sync: string[] = [];
  const fresh: string[] = [];
  for (const s of states) {
    if (onlyStale ? !isStale(s.lastSuccessAt, now) : isRecent(s.lastSuccessAt, now)) fresh.push(s.adAccountId);
    else sync.push(s.adAccountId);
  }
  return { sync, fresh };
}
