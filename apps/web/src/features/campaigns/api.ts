import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CAMPAIGN_STATUS_FILTERS, type DateRange } from "@backstage/shared";
import type { DashboardFilters } from "@/features/dashboard/filters.ts";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { PAGE_SIZE, type TableState } from "./table.ts";
import type { CampaignRow } from "./types.ts";

const NUMERIC = [
  "budget_micros", "spend_micros", "impressions", "reach", "frequency", "clicks", "ctr", "cpc_micros", "cpm_micros",
  "leads", "messages", "conversions", "conversion_value_micros", "cpl_micros", "cpa_micros", "roas",
] as const;

/** Uma página da tabela de campanhas, já ordenada e filtrada pelo banco (com o RLS do usuário). */
export function useCampaignTable(range: DateRange, filters: DashboardFilters, table: TableState) {
  return useQuery({
    queryKey: ["campaigns", "table", range, filters.clientId, filters.platform, filters.accountId, table],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaign_table", {
        p_from: range.from,
        p_to: range.to,
        p_client_ids: filters.clientId ? [filters.clientId] : null,
        p_platforms: filters.platform ? [filters.platform] : null,
        p_ad_account_ids: filters.accountId ? [filters.accountId] : null,
        p_statuses: table.status ? [...CAMPAIGN_STATUS_FILTERS[table.status]] : null,
        p_search: table.search.trim() || null,
        p_sort: table.sort,
        p_desc: table.desc,
        p_limit: PAGE_SIZE,
        p_offset: (table.page - 1) * PAGE_SIZE,
      });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as campanhas."));
      const rows = (data as Record<string, unknown>[]).map((row) => {
        const out: Record<string, unknown> = { ...row, total_count: Number(row.total_count ?? 0) };
        for (const k of NUMERIC) out[k] = row[k] == null ? null : Number(row[k]);
        return out as unknown as CampaignRow;
      });
      return { rows, total: rows[0]?.total_count ?? 0 };
    },
  });
}
