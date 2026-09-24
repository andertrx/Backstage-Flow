import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CAMPAIGN_STATUS_FILTERS, type DateRange, type StructureLevel } from "@backstage/shared";
import { PAGE_SIZE, type TableState } from "@/features/campaigns/table.ts";
import { friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { EntityChange, EntityRow } from "./types.ts";

const NUMERIC = [
  "budget_micros", "spend_micros", "impressions", "reach", "frequency", "clicks", "ctr", "cpc_micros", "cpm_micros",
  "leads", "messages", "conversions", "conversion_value_micros", "cpl_micros", "cpa_micros", "roas",
] as const;

async function fetchRows(level: StructureLevel, range: DateRange, args: Record<string, unknown>): Promise<EntityRow[]> {
  const { data, error } = await supabase.rpc("entity_rows", { p_level: level, p_from: range.from, p_to: range.to, ...args });
  if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar os dados."));
  return (data as Record<string, unknown>[]).map((row) => {
    const out: Record<string, unknown> = { ...row, total_count: Number(row.total_count ?? 0) };
    for (const k of NUMERIC) out[k] = row[k] == null ? null : Number(row[k]);
    return out as unknown as EntityRow;
  });
}

/** Um item (campanha, conjunto/grupo ou anúncio) com os números do período e do período de comparação. */
export function useEntitySummary(level: StructureLevel, id: string | undefined, current: DateRange, previous: DateRange) {
  return useQuery({
    queryKey: ["structure", "summary", level, id, current, previous],
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [now, before] = await Promise.all([
        fetchRows(level, current, { p_ids: [id], p_limit: 1 }),
        fetchRows(level, previous, { p_ids: [id], p_limit: 1 }),
      ]);
      return { current: now[0] ?? null, previous: before[0] ?? null };
    },
  });
}

/** Filhos de um item: conjuntos/grupos de uma campanha ou anúncios de um conjunto/grupo. */
export function useChildRows(level: "ad_group" | "ad", parentId: string | undefined, range: DateRange, table: TableState) {
  return useQuery({
    queryKey: ["structure", "children", level, parentId, range, table],
    enabled: Boolean(parentId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const rows = await fetchRows(level, range, {
        p_parent_id: parentId,
        p_statuses: table.status ? [...CAMPAIGN_STATUS_FILTERS[table.status]] : null,
        p_search: table.search.trim() || null,
        p_sort: table.sort,
        p_desc: table.desc,
        p_limit: PAGE_SIZE,
        p_offset: (table.page - 1) * PAGE_SIZE,
      });
      return { rows, total: rows[0]?.total_count ?? 0 };
    },
  });
}

/** Nomes para o caminho "Campanhas › Campanha › Conjunto" (o RLS decide o que aparece). */
export function useNames(campaignId: string | null | undefined, adGroupId: string | null | undefined) {
  return useQuery({
    queryKey: ["structure", "names", campaignId, adGroupId],
    enabled: Boolean(campaignId || adGroupId),
    queryFn: async () => {
      const [c, g] = await Promise.all([
        campaignId ? supabase.from("campaigns").select("id, name").eq("id", campaignId).maybeSingle() : Promise.resolve({ data: null, error: null }),
        adGroupId ? supabase.from("ad_groups").select("id, name").eq("id", adGroupId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (c.error || g.error) throw new Error(friendlyDbError((c.error ?? g.error)!, "Não conseguimos carregar os nomes."));
      return { campaign: (c.data as { name: string } | null)?.name ?? null, adGroup: (g.data as { name: string } | null)?.name ?? null };
    },
  });
}

/** Últimas alterações registradas (status, orçamento, nome...). */
export function useEntityChanges(level: StructureLevel, id: string | undefined) {
  return useQuery({
    queryKey: ["structure", "changes", level, id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_changes")
        .select("id, field, old_value, new_value, source, changed_at, detected_at")
        .eq("entity_level", level)
        .eq("entity_id", id!)
        .order("detected_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar o histórico."));
      return data as EntityChange[];
    },
  });
}
