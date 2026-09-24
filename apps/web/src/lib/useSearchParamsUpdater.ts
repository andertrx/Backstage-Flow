import { useCallback, useLayoutEffect } from "react";
import { useSearchParams } from "react-router";

// O `setSearchParams(prev => ...)` do React Router recebe o endereço da ÚLTIMA
// TELA desenhada. Se duas mudanças chegam antes de a tela atualizar (ex.: trocar
// a comparação e logo depois o período), a segunda apagaria a primeira.
// Aqui cada mudança parte sempre do endereço mais recente, inclusive o que
// ainda está a caminho (compartilhado entre todos os componentes da página).
let pending: { path: string; search: string } | null = null;

export function useSearchParamsUpdater() {
  const [params, setParams] = useSearchParams();
  const current = params.toString();

  useLayoutEffect(() => {
    if (pending && pending.search === current) pending = null;
  }, [current]);

  const update = useCallback(
    (change: (latest: URLSearchParams) => URLSearchParams) => {
      const path = window.location.pathname;
      const base = pending && pending.path === path ? pending.search : window.location.search;
      const next = change(new URLSearchParams(base));
      pending = { path, search: next.toString() };
      setParams(next, { replace: true });
    },
    [setParams],
  );

  return [params, update] as const;
}
