import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "@backstage/shared";
import type { DashboardFilters } from "@/features/dashboard/filters.ts";
import { friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { type PlatformId, type ReachScope, type StructureRow, summarizeStructure } from "./logic.ts";

/** Campanhas, conjuntos/grupos e anúncios por status (o RLS decide o que entra). */
export function usePlatformStructure(platform: PlatformId, f: DashboardFilters) {
  return useQuery({
    queryKey: ["platform", platform, "structure", f.clientId, f.accountId, f.campaignId],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_structure", {
        p_platform: platform,
        p_client_ids: f.clientId ? [f.clientId] : null,
        p_ad_account_ids: f.accountId ? [f.accountId] : null,
        p_campaign_ids: f.campaignId ? [f.campaignId] : null,
      });
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar a estrutura."));
      return summarizeStructure((data as Record<string, unknown>[]).map((r) => ({ ...r, total: Number(r.total) }) as StructureRow));
    },
  });
}

export interface PeriodReach {
  reach: number | null;
  frequency: number | null;
}

/** Alcance e frequência de UM item no período EXATO (como a plataforma calculou), ou null se não houver. */
async function fetchReach(scope: ReachScope, range: DateRange): Promise<PeriodReach | null> {
  let target: { adAccountId: string; level: "account" | "campaign"; externalId: string } | null = null;
  if (scope.kind === "account") target = { adAccountId: scope.adAccountId, level: "account", externalId: scope.externalId };
  if (scope.kind === "campaign") {
    const { data, error } = await supabase.from("campaigns").select("ad_account_id, external_id").eq("id", scope.campaignId).maybeSingle();
    if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar o alcance."));
    if (data) target = { adAccountId: data.ad_account_id as string, level: "campaign", externalId: data.external_id as string };
  }
  if (!target) return null;
  const { data, error } = await supabase
    .from("period_reach")
    .select("reach, frequency")
    .eq("ad_account_id", target.adAccountId)
    .eq("level", target.level)
    .eq("entity_external_id", target.externalId)
    .eq("period_start", range.from)
    .eq("period_end", range.to)
    .maybeSingle();
  if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar o alcance."));
  if (!data) return null;
  const n = (v: unknown) => (v == null ? null : Number(v));
  return { reach: n(data.reach), frequency: n(data.frequency) };
}

/** Alcance do período atual e do de comparação. */
export function usePeriodReach(scope: ReachScope, current: DateRange, previous: DateRange) {
  return useQuery({
    queryKey: ["platform", "reach", scope, current, previous],
    enabled: scope.kind !== "none",
    queryFn: async () => {
      const [now, before] = await Promise.all([fetchReach(scope, current), fetchReach(scope, previous)]);
      return { current: now, previous: before };
    },
  });
}
