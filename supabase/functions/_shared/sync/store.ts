/**
 * Gravação da sincronização no banco (chave de serviço: só existe no servidor).
 * Estrutura por "upsert" (mesma conta + mesmo id da plataforma = mesmo registro),
 * métricas pela função ingest_metrics_daily (Etapa 5) e alcance em period_reach.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { AppError } from "../http.ts";
import type { DailyMetric, PeriodReach } from "../platforms/types.ts";
import type { IdMaps, SyncAccount, SyncStore } from "./runner.ts";

const dbError = (error: unknown, message: string) => new AppError(500, "DB_ERROR", message, error);

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function upsertReturningIds(
  db: SupabaseClient,
  table: "campaigns" | "ad_groups" | "ads",
  rows: Record<string, unknown>[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const part of chunks(rows, 500)) {
    const { data, error } = await db.from(table).upsert(part, { onConflict: "ad_account_id,external_id" }).select("id, external_id");
    if (error) throw dbError(error, "Não conseguimos gravar a estrutura das campanhas.");
    for (const r of data ?? []) ids.set(r.external_id as string, r.id as string);
  }
  return ids;
}

export function supabaseSyncStore(db: SupabaseClient): SyncStore {
  return {
    async loadToken(connectionId) {
      const { data: connection, error } = await db.from("platform_connections").select("status").eq("id", connectionId).maybeSingle();
      if (error) throw dbError(error, "Não conseguimos carregar a conexão.");
      if (!connection || connection.status === "revogada") throw new AppError(400, "CONNECTION_REVOKED", "A conexão com a plataforma foi desconectada.");
      const { data: token, error: secretError } = await db.rpc("connection_secret_get", { p_connection_id: connectionId });
      if (secretError) throw dbError(secretError, "Não conseguimos ler a credencial da conexão.");
      if (!token) throw new AppError(400, "CONNECTION_WITHOUT_TOKEN", "Esta conexão está sem credencial. Conecte novamente.");
      return token as string;
    },

    async startRun(account, trigger, requestedBy, range) {
      const { data, error } = await db.from("sync_runs").insert({
        ad_account_id: account.id,
        client_id: account.client_id,
        platform_id: account.platform_id,
        trigger,
        requested_by: requestedBy,
        date_from: range.from,
        date_to: range.to,
      }).select("id").single();
      if (error) throw dbError(error, "Não conseguimos registrar a sincronização.");
      return data.id as number;
    },

    async saveFunding(account, fresh, funding) {
      const { error } = await db.from("ad_accounts").update({
        name: fresh.name,
        currency: fresh.currency,
        timezone: fresh.timezone,
        status: fresh.status,
        raw_status: fresh.rawStatus,
        status_reason: fresh.statusReason,
        is_prepay: fresh.isPrepay,
        details_updated_at: new Date().toISOString(),
      }).eq("id", account.id);
      if (error) throw dbError(error, "Não conseguimos atualizar a conta.");
      const { error: snapError } = await db.from("account_snapshots").insert({
        ad_account_id: account.id,
        client_id: account.client_id,
        platform_id: account.platform_id,
        status: fresh.status,
        raw_status: fresh.rawStatus,
        currency: funding.currency ?? fresh.currency,
        amount_spent_micros: funding.amountSpentMicros,
        balance_micros: funding.amountDueMicros,
        spend_cap_micros: funding.spendCapMicros,
        budget_micros: funding.budgetMicros,
        available_micros: funding.availableMicros,
        available_basis: funding.availableBasis,
        budget_end_at: funding.budgetEndAt,
        funding_description: funding.fundingDescription,
        issues: funding.issues,
        payload: funding.raw,
      });
      if (snapError) throw dbError(snapError, "Não conseguimos guardar a fotografia do saldo.");
      return 1;
    },

    async upsertStructure(account, structure) {
      const seen = new Date().toISOString();
      const base = { ad_account_id: account.id, client_id: account.client_id, platform_id: account.platform_id, last_seen_at: seen };
      const campaigns = await upsertReturningIds(db, "campaigns", structure.campaigns.map((c) => ({
        ...base,
        external_id: c.externalId,
        name: c.name,
        objective: c.objective,
        status: c.status,
        raw_status: c.rawStatus,
        effective_status: c.effectiveStatus,
        budget_micros: c.budgetMicros,
        budget_period: c.budgetPeriod,
        bid_strategy: c.bidStrategy,
        start_date: c.startDate,
        end_date: c.endDate,
      })));
      const groupRows = structure.adGroups.filter((g) => campaigns.has(g.campaignExternalId)).map((g) => ({
        ...base,
        campaign_id: campaigns.get(g.campaignExternalId),
        external_id: g.externalId,
        name: g.name,
        status: g.status,
        raw_status: g.rawStatus,
        effective_status: g.effectiveStatus,
        budget_micros: g.budgetMicros,
        budget_period: g.budgetPeriod,
        optimization_goal: g.optimizationGoal,
      }));
      const adGroups = await upsertReturningIds(db, "ad_groups", groupRows);
      const adRows = structure.ads.filter((a) => adGroups.has(a.adGroupExternalId) && campaigns.has(a.campaignExternalId)).map((a) => ({
        ...base,
        ad_group_id: adGroups.get(a.adGroupExternalId),
        campaign_id: campaigns.get(a.campaignExternalId),
        external_id: a.externalId,
        name: a.name,
        status: a.status,
        raw_status: a.rawStatus,
        effective_status: a.effectiveStatus,
        creative_type: a.creativeType,
        review_status: a.reviewStatus,
        thumbnail_url: a.thumbnailUrl,
      }));
      const ads = await upsertReturningIds(db, "ads", adRows);
      return { count: campaigns.size + adGroups.size + ads.size, ids: { campaigns, adGroups, ads } };
    },

    async ingestMetrics(account, rows: DailyMetric[], ids: IdMaps, currency) {
      const payload = rows.map((m) => ({
        date: m.date,
        ad_account_id: account.id,
        level: m.level,
        entity_external_id: m.entityExternalId,
        campaign_id: m.campaignExternalId ? ids.campaigns.get(m.campaignExternalId) ?? null : null,
        ad_group_id: m.adGroupExternalId ? ids.adGroups.get(m.adGroupExternalId) ?? null : null,
        ad_id: m.adExternalId ? ids.ads.get(m.adExternalId) ?? null : null,
        currency,
        spend_micros: m.spendMicros,
        impressions: m.impressions,
        reach: m.reach,
        clicks: m.clicks,
        link_clicks: m.linkClicks,
        leads: m.leads,
        messages: m.messages,
        conversions: m.conversions,
        conversion_value_micros: m.conversionValueMicros,
        raw_actions: m.rawActions,
      }));
      let total = 0;
      for (const part of chunks(payload, 5000)) {
        const { data, error } = await db.rpc("ingest_metrics_daily", { p_rows: part });
        if (error) throw dbError(error, "Não conseguimos gravar as métricas diárias.");
        const r = data as { inserted?: number; updated?: number } | null;
        total += (r?.inserted ?? 0) + (r?.updated ?? 0);
      }
      return total;
    },

    async upsertReach(account, rows: PeriodReach[]) {
      if (!rows.length) return 0;
      const { error } = await db.from("period_reach").upsert(rows.map((r) => ({
        ad_account_id: account.id,
        client_id: account.client_id,
        level: r.level,
        entity_external_id: r.entityExternalId,
        period_start: r.from,
        period_end: r.to,
        reach: r.reach,
        impressions: r.impressions,
        frequency: r.frequency,
        synced_at: new Date().toISOString(),
      })), { onConflict: "ad_account_id,level,entity_external_id,period_start,period_end" });
      if (error) throw dbError(error, "Não conseguimos gravar o alcance.");
      return rows.length;
    },

    async finishRun(runId, account: SyncAccount, result, durationMs, nextRunAt) {
      const finishedAt = new Date().toISOString();
      const { error } = await db.from("sync_runs").update({
        status: result.status,
        finished_at: finishedAt,
        duration_ms: durationMs,
        records_updated: result.records,
        details: result.details,
        error_code: result.errorCode ?? null,
        error_message: result.errorMessage ?? null,
      }).eq("id", runId);
      if (error) console.error(JSON.stringify({ code: "SYNC_RUN_UPDATE_FAILED", runId, technical: error.message }));
      const state: Record<string, unknown> = {
        status: result.status,
        locked_until: null,
        next_run_at: nextRunAt.toISOString(),
        last_error_code: result.errorCode ?? null,
        last_error_message: result.errorMessage ?? null,
      };
      if (result.status === "sucesso") state.last_success_at = finishedAt;
      const { error: stateError } = await db.from("sync_state").update(state).eq("ad_account_id", account.id);
      if (stateError) console.error(JSON.stringify({ code: "SYNC_STATE_UPDATE_FAILED", adAccountId: account.id, technical: stateError.message }));
    },

    async markConnectionError(connectionId, message) {
      await db.from("platform_connections").update({ status: "erro", last_error: message.slice(0, 500) }).eq("id", connectionId);
    },
  };
}
