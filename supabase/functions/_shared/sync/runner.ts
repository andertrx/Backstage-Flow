/**
 * Sincronização de UMA conta de anúncio (Etapa 16).
 *
 * Ordem: saldo/status → estrutura (campanhas, conjuntos/grupos, anúncios) →
 * métricas diárias → alcance por período (Meta). Tudo com a API oficial.
 * Nada é gravado "inventado": o que a plataforma não informa fica vazio.
 *
 * O acesso ao banco fica atrás de SyncStore, para poder testar sem banco.
 */
import { addDays, comparisonPeriod, PERIOD_LABELS, type PeriodPreset, resolvePeriod } from "../../../../packages/shared/src/metrics/periods.ts";
import { recordError } from "../errorlog.ts";
import { AppError } from "../http.ts";
import type { PlatformAdapter } from "../platforms/adapter.ts";
import type { AccountFunding, DailyMetric, DateRange, PeriodReach, PlatformAccount, PlatformStructure } from "../platforms/types.ts";

export interface SyncAccount {
  id: string;
  client_id: string;
  platform_id: string;
  external_id: string;
  currency: string | null;
  timezone: string | null;
  manager_customer_id: string | null;
  connection_id: string | null;
  last_success_at: string | null;
  /** Até onde o histórico já foi buscado (sem buracos). */
  history_from?: string | null;
  history_to?: string | null;
}

export interface IdMaps {
  campaigns: Map<string, string>;
  adGroups: Map<string, string>;
  ads: Map<string, string>;
}

export interface RunResult {
  status: "sucesso" | "erro";
  records: number;
  details: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface SyncStore {
  loadToken(connectionId: string): Promise<string>;
  startRun(account: SyncAccount, trigger: SyncTrigger, requestedBy: string | null, range: DateRange): Promise<number>;
  saveFunding(account: SyncAccount, fresh: PlatformAccount, funding: AccountFunding): Promise<number>;
  upsertStructure(account: SyncAccount, structure: PlatformStructure): Promise<{ count: number; ids: IdMaps }>;
  ingestMetrics(account: SyncAccount, rows: DailyMetric[], ids: IdMaps, currency: string | null): Promise<number>;
  upsertReach(account: SyncAccount, rows: PeriodReach[]): Promise<number>;
  finishRun(runId: number, account: SyncAccount, result: RunResult, durationMs: number, nextRunAt: Date): Promise<void>;
  markConnectionError(connectionId: string, message: string): Promise<void>;
  /** Soma um período buscado com sucesso à cobertura do histórico. */
  markCoverage(account: SyncAccount, range: DateRange): Promise<void>;
  /** Ids internos das campanhas, conjuntos e anúncios já gravados (importação do passado). */
  loadIdMaps(account: SyncAccount): Promise<IdMaps>;
  /** Fecha uma execução da importação do passado (sem mexer no estado do dia a dia). */
  finishBackfill(runId: number, account: SyncAccount, result: RunResult, durationMs: number, retryAt: Date | null): Promise<void>;
}

export type SyncTrigger = "agendada" | "manual" | "historico";

/** Próxima sincronização: 1 hora depois do sucesso; 30 minutos depois de um erro. */
export const INTERVAL_MINUTES = 60;
export const RETRY_MINUTES = 30;
/** Primeira sincronização busca 30 dias; as seguintes, os últimos 7 (conversões chegam atrasadas). */
export const FIRST_SYNC_DAYS = 30;
export const INCREMENTAL_DAYS = 7;
/** Depois de dias sem sincronizar, recupera o que faltou (até 90 dias; o resto vem pela importação do passado). */
export const MAX_CATCHUP_DAYS = 90;
/** Importação do passado: blocos de 30 dias; depois de erro, tenta de novo em 1 hora. */
export const BACKFILL_CHUNK_DAYS = 30;
export const BACKFILL_RETRY_MINUTES = 60;

export function todayInZone(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

/**
 * Período a buscar, no fuso da conta (inclui hoje, que ainda está em andamento).
 * Se a conta ficou dias sem sincronizar, volta até o último dia já buscado
 * (sem deixar buraco no histórico), limitado a 90 dias.
 */
export function syncRange(lastSuccessAt: string | null, timeZone: string, now: Date, historyTo: string | null = null): DateRange {
  const today = todayInZone(timeZone, now);
  const days = lastSuccessAt ? INCREMENTAL_DAYS : FIRST_SYNC_DAYS;
  let from = addDays(today, -(days - 1));
  if (historyTo && historyTo < from) {
    const oldest = addDays(today, -(MAX_CATCHUP_DAYS - 1));
    from = historyTo < oldest ? oldest : historyTo;
  }
  return { from, to: today };
}

/** Próximo bloco da importação do passado (null = já chegou à meta). */
export function backfillRange(historyFrom: string | null | undefined, target: string): DateRange | null {
  if (!historyFrom || historyFrom <= target) return null;
  const to = addDays(historyFrom, -1);
  const start = addDays(historyFrom, -BACKFILL_CHUNK_DAYS);
  return { from: start < target ? target : start, to };
}

/** Períodos prontos do painel (e os de comparação) — o alcance só existe para o período EXATO. */
export function reachRanges(timeZone: string, now: Date): DateRange[] {
  const seen = new Map<string, DateRange>();
  for (const preset of Object.keys(PERIOD_LABELS) as PeriodPreset[]) {
    const current = resolvePeriod(preset, timeZone, now);
    for (const r of [current, comparisonPeriod(preset, current)]) seen.set(`${r.from}|${r.to}`, r);
  }
  return [...seen.values()];
}

/** Erros de credencial: a conexão inteira precisa ser refeita. */
const CONNECTION_ERRORS = new Set(["AUTH_EXPIRED", "CONNECTION_REVOKED", "CONNECTION_WITHOUT_TOKEN"]);

export async function syncAccount(
  store: SyncStore,
  adapter: PlatformAdapter,
  account: SyncAccount,
  options: { trigger: "agendada" | "manual"; requestedBy: string | null; now?: Date },
): Promise<RunResult & { adAccountId: string; runId: number; durationMs: number }> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const tz = account.timezone || "America/Sao_Paulo";
  const range = syncRange(account.last_success_at, tz, now, account.history_to ?? null);
  const runId = await store.startRun(account, options.trigger, options.requestedBy, range);
  const details: Record<string, unknown> = { periodo: range };
  let result: RunResult;

  try {
    if (!account.connection_id) throw new AppError(400, "NO_CONNECTION", "Esta conta não tem conexão ativa. Vincule novamente.");
    const token = await store.loadToken(account.connection_id);
    const access = { managerId: account.manager_customer_id };

    // 1) Saldo, status e cobrança (fotografia)
    const { account: fresh, funding } = await adapter.getFunding(token, account.external_id, access);
    const currency = funding.currency ?? fresh.currency ?? account.currency;
    details.saldo = await store.saveFunding(account, fresh, funding);

    // 2) Estrutura
    const structure = await adapter.fetchStructure(token, account.external_id, access, currency);
    const saved = await store.upsertStructure(account, structure);
    details.estrutura = saved.count;

    // 3) Métricas diárias (todos os níveis)
    const metrics = await adapter.fetchDailyMetrics(token, account.external_id, access, range, currency);
    details.metricas = await store.ingestMetrics(account, metrics, saved.ids, currency);

    // 4) Alcance por período exato (só onde a plataforma informa)
    if (adapter.fetchPeriodReach) {
      const reach = await adapter.fetchPeriodReach(token, account.external_id, access, reachRanges(fresh.timezone || tz, now));
      details.alcance = await store.upsertReach(account, reach);
    }

    const records = ["saldo", "estrutura", "metricas", "alcance"].reduce((t, k) => t + (Number(details[k]) || 0), 0);
    result = { status: "sucesso", records, details };
    await store.markCoverage(account, range).catch((err) =>
      recordError({ source: "sincronizacao", code: "COVERAGE_UPDATE_FAILED", technical: err, adAccountId: account.id, clientId: account.client_id }));
  } catch (err) {
    const code = err instanceof AppError ? err.code : "UNKNOWN";
    const message = err instanceof AppError ? err.userMessage : "Erro inesperado durante a sincronização.";
    await recordError({
      source: "sincronizacao", code, userMessage: "Não conseguimos atualizar os dados desta conta. " + message, technical: err,
      context: { etapa: stepOf(details), periodo: `${range.from}..${range.to}`, gatilho: options.trigger }, adAccountId: account.id, clientId: account.client_id,
    });
    if (account.connection_id && CONNECTION_ERRORS.has(code)) await store.markConnectionError(account.connection_id, message).catch(() => {});
    const partial = ["saldo", "estrutura", "metricas", "alcance"].reduce((t, k) => t + (Number(details[k]) || 0), 0);
    result = { status: "erro", records: partial, details, errorCode: code, errorMessage: message.slice(0, 500) };
  }

  const durationMs = Date.now() - started;
  const next = new Date(Date.now() + (result.status === "sucesso" ? INTERVAL_MINUTES : RETRY_MINUTES) * 60_000);
  await store.finishRun(runId, account, result, durationMs, next);
  return { ...result, adAccountId: account.id, runId, durationMs };
}

/** Em qual passo a sincronização parou (para o log técnico). */
function stepOf(details: Record<string, unknown>): string {
  for (const step of ["saldo", "estrutura", "metricas", "alcance"]) if (!(step in details)) return step;
  return "final";
}

/**
 * Importação do passado (Etapa 23): busca um bloco de 30 dias ANTES do que já
 * temos, só as métricas diárias (todos os níveis). Não mexe no saldo, na
 * estrutura nem no estado do dia a dia; erro aqui só adia a próxima tentativa.
 */
export async function backfillAccount(
  store: SyncStore,
  adapter: PlatformAdapter,
  account: SyncAccount,
  target: string,
): Promise<(RunResult & { adAccountId: string; runId: number; durationMs: number; range: DateRange }) | null> {
  const range = backfillRange(account.history_from, target);
  if (!range) return null;
  const started = Date.now();
  const runId = await store.startRun(account, "historico", null, range);
  const details: Record<string, unknown> = { periodo: range, importacao: true };
  let result: RunResult;
  try {
    if (!account.connection_id) throw new AppError(400, "NO_CONNECTION", "Esta conta não tem conexão ativa. Vincule novamente.");
    const token = await store.loadToken(account.connection_id);
    const ids = await store.loadIdMaps(account);
    const metrics = await adapter.fetchDailyMetrics(token, account.external_id, { managerId: account.manager_customer_id }, range, account.currency);
    details.metricas = await store.ingestMetrics(account, metrics, ids, account.currency);
    await store.markCoverage(account, range);
    result = { status: "sucesso", records: Number(details.metricas) || 0, details };
  } catch (err) {
    const code = err instanceof AppError ? err.code : "UNKNOWN";
    const message = err instanceof AppError ? err.userMessage : "Erro inesperado ao importar o histórico.";
    await recordError({
      source: "historico", code, userMessage: "Não conseguimos importar este pedaço do histórico. " + message, technical: err,
      context: { periodo: `${range.from}..${range.to}` }, adAccountId: account.id, clientId: account.client_id,
    });
    result = { status: "erro", records: Number(details.metricas) || 0, details, errorCode: code, errorMessage: message.slice(0, 500) };
  }
  const durationMs = Date.now() - started;
  const retryAt = result.status === "sucesso" ? null : new Date(Date.now() + BACKFILL_RETRY_MINUTES * 60_000);
  await store.finishBackfill(runId, account, result, durationMs, retryAt);
  return { ...result, adAccountId: account.id, runId, durationMs, range };
}
