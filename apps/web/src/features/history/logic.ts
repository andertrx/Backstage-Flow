// Histórico (Etapa 23): perguntas por mês/período respondidas com o que está
// guardado no banco, e o aviso de até onde o histórico de cada conta vai.
import { addDays, computeKpis, type DateRange, type MetricTotals } from "@backstage/shared";
import { formatDate, formatKpi } from "@/lib/format.ts";

export interface CoverageRow {
  ad_account_id: string;
  name: string;
  client_id: string;
  client_name: string;
  platform_id: string;
  currency: string | null;
  history_from: string | null;
  history_to: string | null;
  target: string;
  importing: boolean;
  backfill_error: string | null;
}

export interface MonthOption {
  /** AAAA-MM */
  value: string;
  label: string;
  range: DateRange;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "agosto de 2026" */
export function monthLabel(ym: string): string {
  return MONTH_FORMAT.format(new Date(`${ym}-01T00:00:00Z`));
}

/** Primeiro e último dia do mês (o mês atual vai só até hoje). */
export function monthRange(ym: string, today: string): DateRange {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: `${ym}-01`, to: last > today ? today : last };
}

/** Meses da pergunta: do atual até o mês da meta do histórico (mais recente primeiro). */
export function monthOptions(target: string, today: string): MonthOption[] {
  const out: MonthOption[] = [];
  let ym = today.slice(0, 7);
  const stop = target.slice(0, 7);
  while (ym >= stop && out.length < 60) {
    out.push({ value: ym, label: monthLabel(ym), range: monthRange(ym, today) });
    const [y, m] = ym.split("-").map(Number);
    ym = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  }
  return out;
}

/** Período anterior do mesmo tamanho, para comparar (mês → mês anterior). */
export function previousRange(range: DateRange, ym: string | null): DateRange {
  if (ym) {
    const [y, m] = ym.split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    return monthRange(prev, "9999-12-31");
  }
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

export type CoverageState = "completo" | "parcial" | "sem_historico";

export interface CoverageCheck {
  state: CoverageState;
  /** Contas que ainda não têm todo o período (com a data a partir da qual têm). */
  missing: { name: string; client_name: string; from: string | null; importing: boolean }[];
  /** O período começa antes do que o sistema importa (13 meses). */
  beforeTarget: boolean;
}

/** O histórico guardado cobre o período inteiro, para todas as contas do filtro? */
export function checkCoverage(range: DateRange, rows: CoverageRow[]): CoverageCheck {
  const beforeTarget = rows.length > 0 && range.from < rows[0].target;
  const missing = rows
    .filter((r) => !r.history_from || !r.history_to || r.history_from > range.from || r.history_to < range.to)
    .filter((r) => !(r.history_to && r.history_to < range.from && r.history_from && r.history_from <= range.from))
    .map((r) => ({ name: r.name, client_name: r.client_name, from: r.history_from, importing: r.importing }));
  const covered = rows.some((r) => r.history_from && r.history_to && r.history_from <= range.to && r.history_to >= range.from);
  const state: CoverageState = missing.length === 0 && rows.length > 0 ? "completo" : covered ? "parcial" : "sem_historico";
  return { state, missing, beforeTarget };
}

/** Texto de "até onde vai" a cobertura de uma conta. */
export function coverageText(r: CoverageRow): string {
  if (!r.history_from || !r.history_to) return "Ainda não sincronizada.";
  const done = r.history_from <= r.target;
  const base = `Histórico de ${formatDate(r.history_from)} até ${formatDate(r.history_to)}`;
  if (done) return `${base} (completo).`;
  if (r.backfill_error) return `${base}. Importação do passado pausada: ${r.backfill_error}`;
  return `${base}. Importando o passado até ${formatDate(r.target)}${r.importing ? " (agora)" : ""}…`;
}

/** Quanto da meta de histórico já foi importado (0 a 100), somando todas as contas. */
export function importProgress(rows: CoverageRow[], today: string): number | null {
  const valid = rows.filter((r) => r.history_from);
  if (!valid.length) return null;
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  let have = 0;
  let want = 0;
  for (const r of valid) {
    const total = Math.max(1, day(today) - day(r.target) + 1);
    const got = Math.min(total, Math.max(0, day(today) - day(r.history_from as string) + 1));
    have += got;
    want += total;
  }
  return Math.round((have / want) * 100);
}

/**
 * A resposta em uma frase: "Em agosto de 2026, Excalibur investiu R$ 1.234,56,
 * teve 120 leads e CPL de R$ 10,29." Nunca inventa: o que falta vira aviso.
 */
export function answerSentence(when: string, who: string, totals: MetricTotals, currency: string): string {
  const k = computeKpis(totals);
  const money = (v: number | null) => (v == null ? null : formatKpi(v, "money", currency));
  const parts: string[] = [];
  parts.push(k.spend == null ? "não tem investimento informado" : `investiu ${money(k.spend)}`);
  if (k.leads != null) parts.push(`teve ${formatKpi(k.leads, "decimal", currency)} ${k.leads === 1 ? "lead" : "leads"}`);
  if (k.cpl != null) parts.push(`CPL de ${money(k.cpl)}`);
  const last = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : parts[0];
  return `${when}, ${who} ${last}.`;
}

/** "Em agosto de 2026" ou "De 01/08/2026 a 15/08/2026". */
export function whenText(range: DateRange, ym: string | null): string {
  if (ym) return `Em ${monthLabel(ym)}`;
  return range.from === range.to ? `Em ${formatDate(range.from)}` : `De ${formatDate(range.from)} a ${formatDate(range.to)}`;
}
