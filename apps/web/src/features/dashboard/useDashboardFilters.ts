import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { type DashboardFilters, parseFilters, serializeFilters, updateFilters } from "./filters.ts";

/** Filtros globais guardados no endereço da página. */
export function useDashboardFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);

  // A troca do endereço não é instantânea: duas mudanças seguidas precisam
  // partir sempre do filtro mais recente, e não do que está na tela.
  const latest = useRef(filters);
  useLayoutEffect(() => {
    latest.current = filters;
  }, [filters]);

  const apply = useCallback(
    (next: DashboardFilters) => {
      latest.current = next;
      setParams(serializeFilters(next), { replace: true });
    },
    [setParams],
  );

  const setFilters = useCallback((patch: Partial<DashboardFilters>) => apply(updateFilters(latest.current, patch)), [apply]);

  /** Limpa cliente, plataforma, conta, campanha e status (mantém o período). */
  const clear = useCallback(
    () => apply({ ...latest.current, clientId: null, platform: null, accountId: null, campaignId: null, status: null, currency: null }),
    [apply],
  );

  return { filters, setFilters, clear };
}
