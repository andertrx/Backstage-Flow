import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Etapa 40 — o que o MCP lê do Backstage Flow. Tudo passa pelo "crachá" da própria pessoa
 * (o login dela): o banco aplica as mesmas regras do site (RLS) e o isolamento entre clientes.
 * Só consultas que já existem; nenhuma escrita.
 */

export interface DbError {
  code?: string;
  message?: string;
}

export class DataError extends Error {
  constructor(public readonly dbCode: string | undefined, message: string) {
    super(message);
  }
}

export interface ClientRow {
  id: string;
  name: string;
  status: string;
  timezone: string;
  is_demo: boolean;
}
export interface AccountRow {
  id: string;
  client_id: string;
  name: string;
  platform_id: string;
  currency: string;
  status: string;
}
export interface SummaryRow {
  currency: string;
  spend_micros: number | null;
  impressions: number | null;
  clicks: number | null;
  link_clicks: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  accounts: number | null;
  campaigns?: number | null;
  last_synced_at?: string | null;
  first_date?: string | null;
  last_date?: string | null;
}
export interface CampaignRow {
  id: string;
  client_id: string;
  ad_account_id: string;
  platform_id: string;
  external_id: string;
  name: string;
  objective: string | null;
  status: string;
  effective_status: string | null;
  budget_micros: number | null;
  budget_period: string | null;
  bid_strategy: string | null;
  start_date: string | null;
  end_date: string | null;
  last_seen_at: string | null;
}
export interface MetricsFilter {
  from: string;
  to: string;
  clientIds: string[] | null;
  platforms: string[] | null;
  accountIds: string[] | null;
  campaignIds: string[] | null;
}

export interface DataPort {
  ping(): Promise<void>;
  lastSync(): Promise<{ finished_at: string; status: string } | null>;
  opsPermissions(): Promise<string[]>;
  listClients(q: { search: string | null; status: string | null; limit: number; offset: number }): Promise<{ rows: ClientRow[]; total: number }>;
  accounts(clientIds: string[]): Promise<AccountRow[]>;
  summary(f: MetricsFilter): Promise<SummaryRow[]>;
  alerts(open: boolean, limit: number): Promise<Record<string, unknown>[]>;
  campaign(id: string): Promise<CampaignRow | null>;
  client(id: string): Promise<ClientRow | null>;
  account(id: string): Promise<AccountRow | null>;
  mcpHealth(hours: number): Promise<Record<string, unknown>>;
}

function check<T>(r: { data: T | null; error: DbError | null }): T {
  if (r.error) throw new DataError(r.error.code, r.error.message ?? "erro do banco");
  return r.data as T;
}

/** Busca por nome: % e _ viram texto comum. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function supabaseData(db: SupabaseClient): DataPort {
  return {
    async ping() {
      check(await db.from("profiles").select("id").limit(1));
    },
    async lastSync() {
      const rows = check(await db.from("sync_runs").select("finished_at, status").not("finished_at", "is", null)
        .order("finished_at", { ascending: false }).limit(1)) as { finished_at: string; status: string }[];
      return rows[0] ?? null;
    },
    async opsPermissions() {
      return (check(await db.rpc("ops_my_permissions")) ?? []) as string[];
    },
    async listClients({ search, status, limit, offset }) {
      let q = db.from("clients").select("id, name, status, timezone, is_demo", { count: "exact" }).is("excluded_at", null);
      if (search) q = q.ilike("name", `%${likeEscape(search)}%`);
      if (status) q = q.eq("status", status);
      const r = await q.order("name").range(offset, offset + limit - 1);
      return { rows: check(r) as ClientRow[], total: r.count ?? 0 };
    },
    async accounts(clientIds) {
      if (!clientIds.length) return [];
      return check(await db.from("ad_accounts").select("id, client_id, name, platform_id, currency, status")
        .in("client_id", clientIds).is("unlinked_at", null).order("name")) as AccountRow[];
    },
    async summary(f) {
      if (f.campaignIds?.length) {
        return check(await db.rpc("dashboard_summary", {
          p_from: f.from, p_to: f.to, p_client_ids: f.clientIds, p_platforms: f.platforms, p_ad_account_ids: f.accountIds,
          p_campaign_ids: f.campaignIds, p_campaign_statuses: null,
        })) as SummaryRow[];
      }
      return check(await db.rpc("metrics_summary", {
        p_from: f.from, p_to: f.to, p_client_ids: f.clientIds, p_platforms: f.platforms, p_ad_account_ids: f.accountIds,
      })) as SummaryRow[];
    },
    async alerts(open, limit) {
      return (check(await db.rpc("monitor_alerts_query", { p_open: open, p_limit: limit })) ?? []) as Record<string, unknown>[];
    },
    async campaign(id) {
      const rows = check(await db.from("campaigns").select(
        "id, client_id, ad_account_id, platform_id, external_id, name, objective, status, effective_status, budget_micros, budget_period, bid_strategy, start_date, end_date, last_seen_at",
      ).eq("id", id).limit(1)) as CampaignRow[];
      return rows[0] ?? null;
    },
    async client(id) {
      const rows = check(await db.from("clients").select("id, name, status, timezone, is_demo").eq("id", id).limit(1)) as ClientRow[];
      return rows[0] ?? null;
    },
    async account(id) {
      const rows = check(await db.from("ad_accounts").select("id, client_id, name, platform_id, currency, status").eq("id", id).limit(1)) as AccountRow[];
      return rows[0] ?? null;
    },
    async mcpHealth(hours) {
      return check(await db.rpc("mcp_health", { p_hours: hours })) as Record<string, unknown>;
    },
  };
}
