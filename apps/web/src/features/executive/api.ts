import { useQuery } from "@tanstack/react-query";
import type { DateRange, ExecutiveRow } from "@backstage/shared";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

interface Scope {
  clientId: string | null;
  platform: string | null;
}

async function fetchBreakdown(range: DateRange, scope: Scope): Promise<ExecutiveRow[]> {
  const { data, error } = await supabase.rpc("executive_breakdown", {
    p_from: range.from,
    p_to: range.to,
    p_client_ids: scope.clientId ? [scope.clientId] : null,
    p_platforms: scope.platform ? [scope.platform] : null,
  });
  if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a visão executiva."));
  // bigint chega como número ou texto, dependendo do tamanho: normaliza para número.
  const n = (v: unknown) => (v == null ? null : Number(v));
  return (data as Record<string, unknown>[]).map((r) => ({
    client_id: String(r.client_id),
    client_name: String(r.client_name ?? ""),
    platform_id: String(r.platform_id),
    currency: String(r.currency),
    spend_micros: n(r.spend_micros),
    leads: n(r.leads),
    messages: n(r.messages),
    conversions: n(r.conversions),
    conversion_value_micros: n(r.conversion_value_micros),
    accounts: Number(r.accounts ?? 0),
  }));
}

/** Totais por cliente × plataforma × moeda no período e no período de comparação. */
export function useExecutiveBreakdown(current: DateRange, previous: DateRange, scope: Scope) {
  return useQuery({
    queryKey: ["executive", current, previous, scope.clientId, scope.platform],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const [now, before] = await Promise.all([fetchBreakdown(current, scope), fetchBreakdown(previous, scope)]);
      return { current: now, previous: before };
    },
  });
}
