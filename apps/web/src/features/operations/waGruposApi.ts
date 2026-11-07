import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { WaGrupoOpt } from "./waGruposLogic.ts";

// Etapa 44.2 — grupos do WhatsApp ligados a cada cliente (só identificador @g.us e nome do grupo; nunca telefone).

export interface WaGrupoLigado {
  cliente_id: string;
  grupo_id: string;
  grupo_nome: string | null;
}

const KEY = ["wa-grupos"] as const;

function dbError(error: { code?: string; message: string }, fallback: string) {
  return error.code === "22023" || error.code === "42501" ? error.message : friendlyDbError(error, fallback);
}

export function useWaGruposLigados(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_grupos").select("cliente_id,grupo_id,grupo_nome").is("desvinculado_em", null);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os grupos ligados."));
      return (data as WaGrupoLigado[] | null) ?? [];
    },
  });
}

/** Busca agora, no WhatsApp conectado, a lista de grupos (só id e nome). Só administrador. */
export function useBuscarGruposWa() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("wa-gateway", { body: { action: "groups" } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return ((data as { data: { groups: (WaGrupoOpt & { size: number | null })[] } }).data.groups) ?? [];
    },
  });
}

export function useSalvarGrupos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: { cliente_id: string; grupo: WaGrupoOpt | null }[]) => {
      for (const c of changes) {
        const { error } = c.grupo
          ? await supabase.rpc("wa_grupo_vincular", { p_cliente: c.cliente_id, p_grupo_id: c.grupo.id, p_grupo_nome: c.grupo.name })
          : await supabase.rpc("wa_grupo_desvincular", { p_cliente: c.cliente_id });
        if (error) throw new FriendlyError(dbError(error, "Não conseguimos salvar a ligação do grupo."));
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
