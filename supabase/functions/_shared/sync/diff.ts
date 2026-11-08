/**
 * Gravação só do que mudou (Auditoria de desempenho, 08/11/2026).
 * A sincronização reescrevia TODAS as campanhas, grupos e anúncios a cada rodada (milhões de atualizações iguais,
 * ~70 GB de log de escrita). Aqui se decide, linha a linha, se vale gravar:
 *   - linha nova                                   → grava;
 *   - algum campo mudou                            → grava (e renova "visto por último");
 *   - nada mudou, mas "visto por último" é antigo  → grava só 1 vez por dia, para manter essa informação viva;
 *   - nada mudou e foi visto há pouco              → não grava.
 * Campos "só decorativos" (ex.: endereço da miniatura, que o Meta troca de assinatura) não contam como mudança:
 * são renovados junto com a gravação diária.
 */

/** Tempo máximo sem renovar "visto por último" de uma linha que não mudou. */
export const TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;

export interface ExistingRow {
  id: string;
  external_id: string;
  last_seen_at: string | null;
  [field: string]: unknown;
}

/** Compara dois valores do mesmo campo como o banco os devolveria (null = vazio; número e texto numérico são iguais; data só pelo dia). */
export function sameValue(a: unknown, b: unknown): boolean {
  const na = a === undefined || a === "" ? null : a;
  const nb = b === undefined || b === "" ? null : b;
  if (na === null || nb === null) return na === nb;
  if (typeof na === "number" || typeof nb === "number") return Number(na) === Number(nb);
  if (typeof na === "object" || typeof nb === "object") return JSON.stringify(na) === JSON.stringify(nb);
  const sa = String(na);
  const sb = String(nb);
  // Coluna de data: o banco devolve só o dia; a plataforma pode mandar data com hora.
  if (/^\d{4}-\d{2}-\d{2}$/.test(sa) !== /^\d{4}-\d{2}-\d{2}$/.test(sb)) {
    const [day, other] = /^\d{4}-\d{2}-\d{2}$/.test(sa) ? [sa, sb] : [sb, sa];
    return other.startsWith(day);
  }
  return sa === sb;
}

export interface Plan {
  /** Linhas para gravar (novas, mudadas ou com renovação diária). */
  write: Record<string, unknown>[];
  /** Linhas intactas: só entram nos mapas de ids. */
  skipped: number;
}

/**
 * @param rows        linhas que a plataforma informou agora (já no formato do banco)
 * @param existing    o que o banco já tem, por external_id
 * @param compare     campos que contam como mudança
 */
export function planWrites(
  rows: Record<string, unknown>[],
  existing: Map<string, ExistingRow>,
  compare: string[],
  nowMs: number,
): Plan {
  const write: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const row of rows) {
    const old = existing.get(String(row.external_id));
    if (!old) {
      write.push(row);
      continue;
    }
    const changed = compare.some((f) => !sameValue(row[f], old[f]));
    const seen = old.last_seen_at ? Date.parse(old.last_seen_at) : 0;
    const stale = !Number.isFinite(seen) || nowMs - seen >= TOUCH_AFTER_MS;
    if (changed || stale) write.push(row);
    else skipped++;
  }
  return { write, skipped };
}
