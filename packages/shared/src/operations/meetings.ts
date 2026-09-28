/**
 * Central de Operações (Etapa 36.5): Dailies e reuniões. Nomes em português e
 * horários sempre no horário de Brasília (a agência trabalha nele), qualquer
 * que seja o fuso do computador de quem abre. As regras ficam no banco.
 */
export const OPS_MEETING_STATUSES = ["agendada", "realizada", "cancelada"] as const;
export type OpsMeetingStatus = (typeof OPS_MEETING_STATUSES)[number];
export const OPS_MEETING_STATUS_LABELS: Record<OpsMeetingStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

export const OPS_MEETING_ITEM_KINDS = ["objetivo", "pendencia", "decisao", "bloqueio"] as const;
export type OpsMeetingItemKind = (typeof OPS_MEETING_ITEM_KINDS)[number];
export const OPS_MEETING_ITEM_LABELS: Record<OpsMeetingItemKind, string> = {
  objetivo: "Objetivo",
  pendencia: "Pendência",
  decisao: "Decisão",
  bloqueio: "Bloqueio",
};
/** Só pendências e bloqueios viram tarefa (com prazo e responsável). */
export const opsMeetingItemMakesTask = (kind: string) => kind === "pendencia" || kind === "bloqueio";

export const OPS_MEETING_TZ = "America/Sao_Paulo";

/**
 * "2026-09-28T09:00" digitado na tela (horário de Brasília) → instante ISO.
 * Brasília é UTC−3 o ano todo (sem horário de verão desde 2019).
 */
export function opsMeetingLocalToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Data e hora inválidas.");
  return new Date(`${local}:00-03:00`).toISOString();
}

function spParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPS_MEETING_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Instante ISO → "2026-09-28T09:00" no horário de Brasília (para o campo de data e hora). */
export function opsMeetingIsoToLocal(iso: string): string {
  const p = spParts(iso);
  return `${p.day}T${p.time}`;
}

/** Dia (AAAA-MM-DD) e hora (HH:MM) da reunião no horário de Brasília. */
export function opsMeetingDay(iso: string): string {
  return spParts(iso).day;
}
export function opsMeetingTime(iso: string): string {
  return spParts(iso).time;
}

/** "09:00 – 09:15" (término calculado pela duração). */
export function opsMeetingSpan(iso: string, durationMin: number): string {
  const end = new Date(Date.parse(iso) + durationMin * 60_000).toISOString();
  return `${opsMeetingTime(iso)} – ${opsMeetingTime(end)}`;
}

/** Agrupa por dia (na ordem em que vieram), para a agenda. */
export function opsGroupMeetingsByDay<T extends { starts_at: string }>(items: readonly T[]): { day: string; items: T[] }[] {
  const out: { day: string; items: T[] }[] = [];
  for (const m of items) {
    const day = opsMeetingDay(m.starts_at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(m);
    else out.push({ day, items: [m] });
  }
  return out;
}
