import { useQuery } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { CoverageRow } from "./logic.ts";

/** Até onde vai o histórico de cada conta do filtro (atualiza enquanto importa). */
export function useHistoryCoverage(clientId: string | null, platform: string | null, accountId: string | null) {
  return useQuery({
    queryKey: ["historico", "cobertura", clientId, platform, accountId],
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.history_from && r.history_from > r.target) ? 60_000 : false),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("history_coverage", {
        p_client_ids: clientId ? [clientId] : null,
        p_platforms: platform ? [platform] : null,
        p_ad_account_ids: accountId ? [accountId] : null,
      });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos ver até onde vai o histórico."));
      return (data ?? []) as CoverageRow[];
    },
  });
}
