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

/** Ações da Central que o MCP pode chamar (as mesmas do site; o banco confere a permissão de quem chama). */
export const OPS_RPCS = [
  "ops_directory", "ops_task_list", "ops_task_get", "ops_task_save", "ops_task_set_status", "ops_task_set_people", "ops_comment_add",
  "ops_task_archive", "ops_sector_save", "ops_sector_set_status", "ops_status_save", "ops_status_set_active", "ops_queue_column_save",
  "ops_queue_column_set_active", "ops_activity_type_save",
] as const;
export type OpsRpc = (typeof OPS_RPCS)[number];

export interface OpsReference {
  sectors: { id: string; name: string; color: string; status: string; position: number }[];
  statuses: { id: string; name: string; color: string; category: string; active: boolean; position: number }[];
  columns: { id: string; sector_id: string; name: string; color: string; status_id: string; active: boolean; position: number }[];
  activityTypes: { id: string; name: string; active: boolean; position: number }[];
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
  opsRpc(name: OpsRpc, args: Record<string, unknown>): Promise<unknown>;
  opsReference(): Promise<OpsReference>;
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
    async opsRpc(name, args) {
      if (!(OPS_RPCS as readonly string[]).includes(name)) throw new DataError("42501", "ação não permitida");
      return check(await db.rpc(name, args));
    },
    async opsReference() {
      const [sectors, statuses, columns, activityTypes] = await Promise.all([
        db.from("ops_sectors").select("id, name, color, status, position").order("position"),
        db.from("ops_statuses").select("id, name, color, category, active, position").order("position"),
        db.from("ops_queue_columns").select("id, sector_id, name, color, status_id, active, position").order("position"),
        db.from("ops_activity_types").select("id, name, active, position").order("position"),
      ]);
      return {
        sectors: check(sectors) as OpsReference["sectors"],
        statuses: check(statuses) as OpsReference["statuses"],
        columns: check(columns) as OpsReference["columns"],
        activityTypes: check(activityTypes) as OpsReference["activityTypes"],
      };
    },
  };
}
