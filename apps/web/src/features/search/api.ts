import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { MIN_QUERY, type SearchRow } from "./logic.ts";

/** Busca global no banco (respeita as permissões de quem pergunta). */
export function useGlobalSearch(query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: ["busca-global", q],
    enabled: enabled && q.length >= MIN_QUERY,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("global_search", { p_query: q, p_limit: 5 });
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos buscar agora. Tente de novo."));
      return (data ?? []) as SearchRow[];
    },
  });
}
