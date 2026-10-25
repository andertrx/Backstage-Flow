import { useQuery } from "@tanstack/react-query";
import type { DateRange, Granularity, SeriesRow } from "@backstage/shared";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { useActiveClients } from "@/features/clients/api.ts";
import type { DashboardFilters } from "./filters.ts";
import type { FilterAccount, FilterCampaign, SummaryRow } from "./types.ts";

/**
 * Clientes ativos (25/10/2026): sem filtro de cliente, os números e as contas não incluem cliente
 * desativado. null = sem restrição (tela de Histórico, que guarda o passado de todos).
 */
function useScopeClientIds(includeInactive: boolean): { ids: string[] | null; ready: boolean } {
  const active = useActiveClients();
  if (includeInactive) return { ids: null, ready: true };
  return { ids: active.data ? active.data.map((c) => c.id) : null, ready: Boolean(active.data) };
}
const clientScope = (clientId: string | null, ids: string[] | null) => (clientId ? [clientId] : ids);

/** Contas vinculadas que o usuário enxerga (o RLS filtra no banco); sem as de cliente desativado, salvo no Histórico. */
export function useFilterAccounts(opts: { includeInactive?: boolean } = {}) {
  const includeInactive = opts.includeInactive ?? false;
  return useQuery({
    queryKey: ["dashboard", "accounts", includeInactive],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("id, client_id, platform_id, external_id, name, currency, clients(status)")
        .is("unlinked_at", null)
        .order("name");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as contas."));
      return (data as unknown as (FilterAccount & { clients: { status: string } | null })[])
        .filter((a) => includeInactive || a.clients?.status !== "encerrado")
        .map(({ clients: _c, ...a }) => a as FilterAccount);
    },
  });
}

/** Campanhas do cliente ou da conta escolhida (lista só depois de escolher um dos dois). */
export function useFilterCampaigns(clientId: string | null, accountId: string | null, platform: string | null) {
  return useQuery({
    queryKey: ["dashboard", "campaigns", clientId, accountId, platform],
    enabled: Boolean(clientId || accountId),
    queryFn: async () => {
      let query = supabase.from("campaigns").select("id, name, ad_account_id, platform_id, status").order("name").limit(500);
      if (accountId) query = query.eq("ad_account_id", accountId);
      else if (clientId) query = query.eq("client_id", clientId);
      if (platform) query = query.eq("platform_id", platform);
      const { data, error } = await query;
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as campanhas."));
      return data as FilterCampaign[];
    },
  });
}

async function fetchSummary(range: DateRange, f: DashboardFilters, scopeIds: string[] | null): Promise<SummaryRow[]> {
  const { data, error } = await supabase.rpc("dashboard_summary", {
    p_from: range.from,
    p_to: range.to,
    p_client_ids: clientScope(f.clientId, scopeIds),
    p_platforms: f.platform ? [f.platform] : null,
    p_ad_account_ids: f.accountId ? [f.accountId] : null,
    p_campaign_ids: campaignFilter(f),
    p_campaign_statuses: f.status ? [f.status] : null,
  });
  if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o resumo."));
  // bigint chega como número ou texto, dependendo do tamanho: normaliza para número.
  return (data as Record<string, unknown>[]).map((row) => {
    const n = (v: unknown) => (v == null ? null : Number(v));
    return {
      currency: String(row.currency),
      source_level: row.source_level as SummaryRow["source_level"],
      spend_micros: n(row.spend_micros),
      impressions: n(row.impressions),
      clicks: n(row.clicks),
      link_clicks: n(row.link_clicks),
      leads: n(row.leads),
      messages: n(row.messages),
      conversions: n(row.conversions),
      conversion_value_micros: n(row.conversion_value_micros),
      accounts: Number(row.accounts ?? 0),
      campaigns: Number(row.campaigns ?? 0),
      days_with_data: Number(row.days_with_data ?? 0),
      last_synced_at: (row.last_synced_at as string | null) ?? null,
    };
  });
}

/** Totais do período atual e do período de comparação (mesmos filtros). */
export function useDashboardSummary(current: DateRange, previous: DateRange, filters: DashboardFilters, opts: { includeInactive?: boolean } = {}) {
  const { currency: _ignored, ...queryFilters } = filters;
  const scope = useScopeClientIds(opts.includeInactive ?? false);
  return useQuery({
    queryKey: ["dashboard", "summary", current, previous, queryFilters, scope.ids],
    enabled: scope.ready,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const [now, before] = await Promise.all([fetchSummary(current, filters, scope.ids), fetchSummary(previous, filters, scope.ids)]);
      return { current: now, previous: before };
    },
  });
}

/** Série no tempo do gráfico (mesmos filtros do resumo). */
export function useDashboardTimeseries(range: DateRange, f: DashboardFilters, granularity: Granularity, byPlatform: boolean, opts: { includeInactive?: boolean } = {}) {
  const { currency: _ignored, ...queryFilters } = f;
  const scope = useScopeClientIds(opts.includeInactive ?? false);
  const scopeIds = scope.ids;
  return useQuery({
    queryKey: ["dashboard", "timeseries", range, queryFilters, granularity, byPlatform, scopeIds],
    enabled: scope.ready,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_timeseries", {
        p_from: range.from,
        p_to: range.to,
        p_granularity: granularity,
        p_client_ids: clientScope(f.clientId, scopeIds),
        p_platforms: f.platform ? [f.platform] : null,
        p_ad_account_ids: f.accountId ? [f.accountId] : null,
        p_campaign_ids: campaignFilter(f),
        p_campaign_statuses: f.status ? [f.status] : null,
        p_by_platform: byPlatform,
      });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o gráfico."));
      const n = (v: unknown) => (v == null ? null : Number(v));
      return (data as Record<string, unknown>[]).map((row): SeriesRow => ({
        bucket: String(row.bucket),
        platform_id: (row.platform_id as string | null) ?? null,
        currency: String(row.currency),
        spend_micros: n(row.spend_micros),
        impressions: n(row.impressions),
        reach: n(row.reach),
        clicks: n(row.clicks),
        leads: n(row.leads),
        messages: n(row.messages),
        conversions: n(row.conversions),
        conversion_value_micros: n(row.conversion_value_micros),
      }));
    },
  });
}

/** Campanhas escolhidas: várias (Relatórios) ou uma (demais telas). null = todas. */
export function campaignFilter(f: Pick<DashboardFilters, "campaignId" | "campaignIds">): string[] | null {
  return f.campaignIds.length ? f.campaignIds : f.campaignId ? [f.campaignId] : null;
}
