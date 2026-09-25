/**
 * Edge Function: sync (Etapa 16 — sincronização automática)
 *
 * Ações (POST com JSON):
 *   scheduled {}                  → agendador do banco (cabeçalho x-cron-secret); pega
 *                                   as contas cuja vez chegou e sincroniza. Com o tempo
 *                                   que sobra, importa o passado (Etapa 23): blocos de
 *                                   30 dias até 13 meses para trás.
 *   run { adAccountIds?: uuid[] } → "Sincronizar agora" (admin, gestor, operador).
 *                                   Sem ids = todas as contas que o usuário enxerga.
 *
 * Os tokens das plataformas ficam no cofre e só são lidos aqui. Cada conta tem
 * trava (não roda duas vezes ao mesmo tempo). Uma conta com erro não impede as outras.
 * Se o tempo da função estiver acabando, as contas restantes ficam na fila e o
 * agendador as sincroniza em poucos minutos.
 */
import { z } from "npm:zod@4";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, requireRole, userClient } from "../_shared/auth.ts";
import { AppError, handle, json } from "../_shared/http.ts";
import { getAdapter } from "../_shared/platforms/registry.ts";
import { backfillAccount, type SyncAccount, syncAccount } from "../_shared/sync/runner.ts";
import { supabaseSyncStore } from "../_shared/sync/store.ts";

const SYNC_ROLES = ["admin", "gestor", "operador"] as const;
/** Tempo máximo para COMEÇAR uma conta nova (a função tem limite de ~150 s). */
const TIME_BUDGET_MS = 100_000;
const MAX_MANUAL = 20;
const SCHEDULED_BATCH = 3;
/** Só começa um bloco da importação do passado se ainda houver folga de tempo. */
const BACKFILL_START_LIMIT_MS = 70_000;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scheduled") }),
  z.object({
    action: z.literal("run"),
    adAccountIds: z.array(z.guid("Identificador inválido.")).max(MAX_MANUAL, `Máximo de ${MAX_MANUAL} contas por vez.`).optional(),
  }),
]);

const ACCOUNT_COLUMNS = "id, client_id, platform_id, external_id, currency, timezone, manager_customer_id, connection_id";

async function loadAccounts(db: SupabaseClient, ids: string[]): Promise<SyncAccount[]> {
  if (!ids.length) return [];
  const { data, error } = await db.from("ad_accounts").select(`${ACCOUNT_COLUMNS}, sync_state(last_success_at, history_from, history_to)`).in("id", ids).is("unlinked_at", null);
  if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos carregar as contas.", error);
  return (data ?? []).map((a: Record<string, unknown>) => {
    const state = (Array.isArray(a.sync_state) ? a.sync_state[0] : a.sync_state) as
      { last_success_at?: string | null; history_from?: string | null; history_to?: string | null } | null;
    return {
      ...a,
      sync_state: undefined,
      last_success_at: state?.last_success_at ?? null,
      history_from: state?.history_from ?? null,
      history_to: state?.history_to ?? null,
    } as unknown as SyncAccount;
  });
}

/** Contas não iniciadas por falta de tempo: destrava e deixa na fila do agendador. */
async function requeue(db: SupabaseClient, ids: string[]) {
  if (!ids.length) return;
  await db.from("sync_state").update({ locked_until: null, status: "pendente", next_run_at: new Date().toISOString() }).in("ad_account_id", ids);
}

async function runAll(db: SupabaseClient, ids: string[], trigger: "agendada" | "manual", requestedBy: string | null) {
  const started = Date.now();
  const store = supabaseSyncStore(db);
  const accounts = await loadAccounts(db, ids);
  const results = [];
  const queued: string[] = [];
  for (const account of accounts) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      queued.push(account.id);
      continue;
    }
    const adapter = getAdapter(account.platform_id);
    if (!adapter) {
      queued.push(account.id);
      continue;
    }
    const r = await syncAccount(store, adapter, account, { trigger, requestedBy });
    results.push({ adAccountId: r.adAccountId, status: r.status, records: r.records, durationMs: r.durationMs, error: r.errorMessage ?? null });
  }
  await requeue(db, queued);
  // Atualiza os alertas com os dados novos (saldo, status, entrega, quedas).
  if (results.length) {
    const { error } = await db.rpc("refresh_alerts");
    if (error) console.error(JSON.stringify({ code: "ALERTS_REFRESH_FAILED", technical: error.message }));
  }
  return { results, queued: queued.length };
}

/** Importação do passado com o tempo que sobrou (uma conta por vez, um bloco cada). */
async function runBackfill(db: SupabaseClient, started: number) {
  const done: { adAccountId: string; status: string; from: string; to: string; records: number; error: string | null }[] = [];
  const { data: target, error } = await db.rpc("history_target");
  if (error || !target) return done;
  const store = supabaseSyncStore(db);
  while (Date.now() - started < BACKFILL_START_LIMIT_MS) {
    const { data: ids, error: claimError } = await db.rpc("sync_claim_backfill", { p_limit: 1 });
    if (claimError || !ids?.length) break;
    const [account] = await loadAccounts(db, ids as string[]);
    const adapter = account && getAdapter(account.platform_id);
    if (!account || !adapter) {
      await db.from("sync_state").update({ backfill_locked_until: null }).in("ad_account_id", ids as string[]);
      break;
    }
    const r = await backfillAccount(store, adapter, account, target as string);
    if (!r) {
      await db.from("sync_state").update({ backfill_locked_until: null }).eq("ad_account_id", account.id);
      continue;
    }
    done.push({ adAccountId: r.adAccountId, status: r.status, from: r.range.from, to: r.range.to, records: r.records, error: r.errorMessage ?? null });
  }
  return done;
}

Deno.serve(
  handle(async (req) => {
    const db = adminClient();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const input = parsed.data;

    if (input.action === "scheduled") {
      const { data: ok, error } = await db.rpc("sync_cron_secret_ok", { p_secret: req.headers.get("x-cron-secret") ?? "" });
      if (error || !ok) throw new AppError(401, "UNAUTHENTICATED", "Acesso negado.");
      const { data: ids, error: claimError } = await db.rpc("sync_claim_due", { p_limit: SCHEDULED_BATCH });
      if (claimError) throw new AppError(500, "DB_ERROR", "Não conseguimos escolher as contas.", claimError);
      const started = Date.now();
      const regular = await runAll(db, (ids ?? []) as string[], "agendada", null);
      return json(req, 200, { data: { ...regular, historico: await runBackfill(db, started) } });
    }

    // "Sincronizar agora": quem pediu precisa poder sincronizar e enxergar as contas.
    const caller = await requireRole(req, db, SYNC_ROLES);
    let query = userClient(req).from("ad_accounts").select("id").is("unlinked_at", null).not("connection_id", "is", null);
    if (input.adAccountIds?.length) query = query.in("id", input.adAccountIds);
    const { data: visible, error } = await query.limit(MAX_MANUAL);
    if (error) throw new AppError(500, "DB_ERROR", "Não conseguimos carregar as contas.", error);
    const wanted = (visible ?? []).map((a) => a.id as string);
    if (!wanted.length) throw new AppError(404, "NOT_FOUND", "Nenhuma conta com conexão ativa para sincronizar.");

    const { data: locked, error: lockError } = await db.rpc("sync_lock", { p_ad_account_ids: wanted });
    if (lockError) throw new AppError(500, "DB_ERROR", "Não conseguimos iniciar a sincronização.", lockError);
    const lockedIds = (locked ?? []) as string[];
    const result = await runAll(db, lockedIds, "manual", caller.id);
    return json(req, 200, { data: { ...result, alreadyRunning: wanted.length - lockedIds.length } });
  }),
);
