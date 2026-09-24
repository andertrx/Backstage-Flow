import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "@backstage/shared";
import { friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { DashboardFilters } from "./filters.ts";
import type { FilterAccount, FilterCampaign, SummaryRow } from "./types.ts";

/** Contas vinculadas que o usuário enxerga (o RLS filtra no banco). */
export function useFilterAccounts() {
  return useQuery({
    queryKey: ["dashboard", "accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("id, client_id, platform_id, external_id, name, currency")
        .is("unlinked_at", null)
        .order("name");
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar as contas."));
      return data as FilterAccount[];
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
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar as campanhas."));
      return data as FilterCampaign[];
    },
  });
}

async function fetchSummary(range: DateRange, f: DashboardFilters): Promise<SummaryRow[]> {
  const { data, error } = await supabase.rpc("dashboard_summary", {
    p_from: range.from,
    p_to: range.to,
    p_client_ids: f.clientId ? [f.clientId] : null,
    p_platforms: f.platform ? [f.platform] : null,
    p_ad_account_ids: f.accountId ? [f.accountId] : null,
    p_campaign_ids: f.campaignId ? [f.campaignId] : null,
    p_campaign_statuses: f.status ? [f.status] : null,
  });
  if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar o resumo."));
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
export function useDashboardSummary(current: DateRange, previous: DateRange, filters: DashboardFilters) {
  const { currency: _ignored, ...queryFilters } = filters;
  return useQuery({
    queryKey: ["dashboard", "summary", current, previous, queryFilters],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const [now, before] = await Promise.all([fetchSummary(current, filters), fetchSummary(previous, filters)]);
      return { current: now, previous: before };
    },
  });
}
