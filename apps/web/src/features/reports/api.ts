import type { DateRange } from "@backstage/shared";
import { useQuery } from "@tanstack/react-query";
import type { CampaignRow } from "@/features/campaigns/types.ts";
import type { DashboardFilters } from "@/features/dashboard/filters.ts";
import { friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

const NUMERIC = [
  "budget_micros", "spend_micros", "impressions", "reach", "frequency", "clicks", "ctr", "cpc_micros", "cpm_micros",
  "leads", "messages", "conversions", "conversion_value_micros", "cpl_micros", "cpa_micros", "roas",
] as const;
const PAGE = 200;
/** Limite de segurança: relatório com até 2.000 campanhas. */
export const MAX_CAMPAIGNS = 2000;

/** Todas as campanhas do período (com os filtros), da que mais investiu para a que menos investiu. */
export function useReportCampaigns(range: DateRange, f: DashboardFilters) {
  return useQuery({
    queryKey: ["reports", "campaigns", range, f.clientId, f.platform, f.accountId, f.campaignId, f.status],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const rows: CampaignRow[] = [];
      for (let offset = 0; offset < MAX_CAMPAIGNS; offset += PAGE) {
        const { data, error } = await supabase.rpc("campaign_table", {
          p_from: range.from,
          p_to: range.to,
          p_client_ids: f.clientId ? [f.clientId] : null,
          p_platforms: f.platform ? [f.platform] : null,
          p_ad_account_ids: f.accountId ? [f.accountId] : null,
          p_statuses: f.status ? [f.status] : null,
          p_search: null,
          p_sort: "spend",
          p_desc: true,
          p_limit: PAGE,
          p_offset: offset,
        });
        if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar as campanhas do relatório."));
        const page = (data as Record<string, unknown>[]).map((row) => {
          const out: Record<string, unknown> = { ...row, total_count: Number(row.total_count ?? 0) };
          for (const k of NUMERIC) out[k] = row[k] == null ? null : Number(row[k]);
          return out as unknown as CampaignRow;
        });
        rows.push(...page);
        if (page.length < PAGE || rows.length >= (page[0]?.total_count ?? 0)) break;
      }
      const filtered = f.campaignId ? rows.filter((r) => r.campaign_id === f.campaignId) : rows;
      // Campanhas sem nenhum dado no período não entram (nada de linha zerada inventada).
      return filtered.filter((r) => r.has_data);
    },
  });
}
