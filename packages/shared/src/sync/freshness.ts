// Cache (Etapa 24): quando os dados guardados no banco servem e quando é
// preciso buscar de novo nas APIs. Mesma regra no servidor e na tela.

/** Sincronizada há menos que isto = recente: "Sincronizar agora" e "Verificar saldo" usam o que já está guardado. */
export const FRESH_MINUTES = 10;
/** Sem sincronizar há mais que isto = desatualizada (o normal é 1 em 1 hora): abrir a página já pede atualização. */
export const STALE_MINUTES = 90;

export type Freshness = "recente" | "em_dia" | "desatualizada" | "nunca";

export function minutesSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, (now.getTime() - t) / 60_000);
}

export function freshness(lastSuccessAt: string | null | undefined, now: Date = new Date()): Freshness {
  const m = minutesSince(lastSuccessAt, now);
  if (m == null) return "nunca";
  if (m < FRESH_MINUTES) return "recente";
  return m > STALE_MINUTES ? "desatualizada" : "em_dia";
}

/** Dá para usar o que já está guardado, sem chamar a API? */
export function isRecent(iso: string | null | undefined, now: Date = new Date()): boolean {
  return freshness(iso, now) === "recente";
}

/** Precisa buscar de novo ao abrir a página? (nunca sincronizada ou atrasada) */
export function isStale(iso: string | null | undefined, now: Date = new Date()): boolean {
  const f = freshness(iso, now);
  return f === "desatualizada" || f === "nunca";
}
