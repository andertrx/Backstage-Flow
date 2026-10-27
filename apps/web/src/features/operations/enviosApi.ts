import type { EnvioClienteInput, EnvioStatus } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";

// ---------------------------------------------------------------------------
// Etapa 41 — Envios semanais. O CRM só guarda a configuração e o histórico;
// quem envia é um agente externo (MCP). Permissão "ops.envios", conferida no banco.
// ---------------------------------------------------------------------------

export interface OpsEnvioCliente {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  nome_grupo: string;
  contatos_marcar: string[];
  ativo: boolean;
  observacao: string | null;
  ultima_execucao: { executado_em: string; status: EnvioStatus; detalhe: string | null } | null;
  ja_enviado_nesta_semana: boolean;
}

export interface OpsEnvio {
  id: string;
  nome: string;
  mensagem: string;
  dia_semana: number;
  horario: string;
  ativo: boolean;
  arquivado_em: string | null;
  versao: number;
  created_at: string;
  updated_at: string;
  criado_por_nome: string | null;
  atualizado_por_nome: string | null;
  toca_hoje: boolean;
  clientes: OpsEnvioCliente[];
}

export interface OpsEnvioExecucao {
  id: number;
  envio_id: string;
  envio_nome: string;
  cliente_id: string;
  cliente_nome: string;
  nome_grupo: string | null;
  executado_em: string;
  status: EnvioStatus;
  detalhe: string | null;
  registrado_por_nome: string | null;
  origem: "manual" | "mcp";
}

export interface OpsEnvioHistoricoFilters {
  envio_id?: string;
  cliente_id?: string;
  status?: string;
  de?: string;
  ate?: string;
}

export interface OpsEnvioSaveInput {
  nome: string;
  mensagem: string;
  dia_semana: number;
  horario: string;
  ativo: boolean;
  clientes: EnvioClienteInput[];
}

const KEY = ["ops", "envios"] as const;

function useEnviosMutation<T, R = unknown>(fn: (v: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export function useEnvios(arquivados: boolean) {
  return useQuery({
    queryKey: [...KEY, "list", arquivados],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_envio_list", { f: { arquivados } });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os envios semanais."));
      return ((data as { envios: OpsEnvio[] } | null)?.envios ?? []);
    },
  });
}

export function useEnvioHistorico(f: OpsEnvioHistoricoFilters) {
  return useQuery({
    queryKey: [...KEY, "historico", f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_envio_historico", { f: { ...f, limite: 300 } });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o histórico."));
      return (data as OpsEnvioExecucao[] | null) ?? [];
    },
  });
}

export function useSaveEnvio() {
  return useEnviosMutation(async (v: { id: string | null; versao: number | null; input: OpsEnvioSaveInput }) => {
    const { data, error } = await supabase.rpc("ops_envio_save", { p_id: v.id, p_versao: v.versao, p: v.input });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar o envio."));
    return data as string;
  });
}

export function useArchiveEnvio() {
  return useEnviosMutation(async (v: { id: string; arquivar: boolean }) => {
    const { error } = await supabase.rpc("ops_envio_archive", { p_id: v.id, p_arquivar: v.arquivar });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos arquivar o envio."));
  });
}
