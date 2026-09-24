// Períodos de análise. Todas as datas são "dias de calendário" (AAAA-MM-DD)
// no fuso informado: "hoje" em São Paulo pode ser "ontem" em UTC.

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_14_days"
  | "last_30_days"
  | "this_month"
  | "last_month";

export interface DateRange {
  from: string; // AAAA-MM-DD (inclusive)
  to: string; // AAAA-MM-DD (inclusive)
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last_7_days: "Últimos 7 dias",
  last_14_days: "Últimos 14 dias",
  last_30_days: "Últimos 30 dias",
  this_month: "Mês atual",
  last_month: "Mês anterior",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export function todayIn(timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUtc(date: string): number {
  if (!DATE_RE.test(date)) throw new Error(`Data inválida: ${date}`);
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) throw new Error(`Data inválida: ${date}`);
  return ms;
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Soma meses mantendo o dia quando possível (31/03 − 1 mês = 28 ou 29/02). */
export function addMonths(date: string, months: number): string {
  const d = new Date(toUtc(date));
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target.getTime());
}

/** Quantidade de dias do intervalo (inclui as duas pontas). */
export function daysInRange(range: DateRange): number {
  return Math.round((toUtc(range.to) - toUtc(range.from)) / DAY_MS) + 1;
}

export function isValidRange(range: DateRange): boolean {
  try {
    return toUtc(range.from) <= toUtc(range.to);
  } catch {
    return false;
  }
}

/** Intervalo de um período pronto. "Últimos N dias" NÃO inclui hoje (dia incompleto). */
export function resolvePeriod(preset: PeriodPreset, timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): DateRange {
  const today = todayIn(timezone, now);
  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: yesterday, to: yesterday };
    case "last_7_days":
      return { from: addDays(today, -7), to: yesterday };
    case "last_14_days":
      return { from: addDays(today, -14), to: yesterday };
    case "last_30_days":
      return { from: addDays(today, -30), to: yesterday };
    case "this_month":
      return { from: monthStart, to: today };
    case "last_month":
      return { from: addMonths(monthStart, -1), to: addDays(monthStart, -1) };
  }
}

/** Período imediatamente anterior, com a mesma quantidade de dias. */
export function previousPeriod(range: DateRange): DateRange {
  const days = daysInRange(range);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

/** Mesmo período no ano anterior (29/02 vira 28/02). */
export function samePeriodLastYear(range: DateRange): DateRange {
  return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
}
