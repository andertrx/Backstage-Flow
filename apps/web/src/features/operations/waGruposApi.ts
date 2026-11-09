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

// ---------------------------------------------------------------- T5.20: marcar pessoas (@) nos envios

export interface WaParticipante {
  /** Só dígitos, com DDI. */
  numero: string;
  admin: boolean;
}

export interface WaMarcacao {
  cliente_id: string;
  nome: string;
  numero: string;
  /** T5.22: desligada = fica guardada, mas não é marcada. */
  ativo: boolean;
}

const KEY_MARC = ["wa-marcacoes"] as const;

/** Lê, no WhatsApp conectado, quem está num grupo (só o número de cada pessoa). Só administrador. */
export function useParticipantesGrupo() {
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { data, error } = await supabase.functions.invoke("wa-gateway", { body: { action: "participants", groupId } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return ((data as { data: { participants: WaParticipante[] } }).data.participants) ?? [];
    },
  });
}

/** Números já ligados às pessoas a marcar. O banco só devolve isto ao administrador (para os demais vem vazio). */
export function useWaMarcacoes(enabled: boolean) {
  return useQuery({
    queryKey: KEY_MARC,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_marcacoes").select("cliente_id,nome,numero,ativo").order("id");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as pessoas a marcar."));
      return (data as WaMarcacao[] | null) ?? [];
    },
  });
}

export function useSalvarMarcacoes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: { cliente_id: string; nome: string; numero: string | null }[]) => {
      for (const c of changes) {
        const { error } = c.numero
          ? await supabase.rpc("wa_marcacao_salvar", { p_cliente: c.cliente_id, p_nome: c.nome, p_numero: c.numero })
          : await supabase.rpc("wa_marcacao_remover", { p_cliente: c.cliente_id, p_nome: c.nome });
        if (error) throw new FriendlyError(dbError(error, "Não conseguimos salvar quem marcar."));
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY_MARC }),
  });
}

/** T5.22: liga/desliga a marcação de uma pessoa sem apagar o número. */
export function useAtivarMarcacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { cliente_id: string; nome: string; ativo: boolean }) => {
      const { error } = await supabase.rpc("wa_marcacao_ativar", { p_cliente: v.cliente_id, p_nome: v.nome, p_ativo: v.ativo });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos mudar a marcação."));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY_MARC }),
  });
}

/** 5545999991111 → +55 45 99999-1111 (só para mostrar). */
export function formatarNumero(n: string): string {
  const m = /^(\d{2})(\d{2})(\d{4,5})(\d{4})$/.exec(n);
  return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : `+${n}`;
}
