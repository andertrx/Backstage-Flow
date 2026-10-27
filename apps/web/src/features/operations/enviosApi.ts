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
  /** Só os ligados, na ordem (quem será marcado). */
  contatos_marcar: string[];
  /** 41.3: todos os nomes, com ligado/desligado. */
  contatos?: OpsEnvioContato[];
  ativo: boolean;
  observacao: string | null;
  ultima_execucao: { executado_em: string; status: EnvioStatus; detalhe: string | null } | null;
  ja_enviado_nesta_semana: boolean;
}

export interface OpsEnvioContato {
  nome: string;
  ativo: boolean;
}

/** 41.3: grupo e @ padrão de um cliente (preenche os envios novos). */
export interface OpsEnvioPadrao {
  cliente_id: string;
  cliente_nome: string;
  nome_grupo: string;
  contatos: OpsEnvioContato[];
  updated_at: string;
  atualizado_por_nome: string | null;
  envios: { id: string; nome: string }[];
}

export type EnvioSituacaoHoje = "nao_hoje" | "antes_da_janela" | "aguardando_aprovacao" | "aprovado" | "recusado" | "nao_aprovado_a_tempo";

export interface OpsEnvioAprovacao {
  decisao: "aprovado" | "recusado" | "sem_resposta";
  versao_envio: number;
  decidido_em: string;
  decidido_por_nome: string | null;
  origem: "manual" | "mcp" | "sistema";
  valida: boolean;
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
  /** 41.2: aprovação desta semana (segunda-feira, Brasília). */
  semana: string;
  aprovacao: OpsEnvioAprovacao | null;
  situacao_hoje: EnvioSituacaoHoje;
  pode_enviar_agora: boolean;
}

export interface OpsEnvioDecisao {
  id: number;
  envio_id: string;
  envio_nome: string;
  semana: string;
  decisao: "aprovado" | "recusado" | "sem_resposta";
  versao_envio: number;
  decidido_em: string;
  decidido_por_nome: string | null;
  origem: "manual" | "mcp" | "sistema";
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

// ---------------------------------------------------------------- 41.2: aprovação semanal

/** Envios de hoje esperando aprovação (das 7h até o horário). Confere a cada minuto, como o lembrete de tarefas. */
export function useEnviosPendentes(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "pendentes"],
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_envio_pendentes");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos ver os envios para aprovar."));
      return (data as OpsEnvio[] | null) ?? [];
    },
  });
}

export function useDecidirEnvio() {
  return useEnviosMutation(async (v: { id: string; versao: number; aprovar: boolean }) => {
    const { data, error } = await supabase.rpc("ops_envio_decidir", { p_id: v.id, p_versao: v.versao, p_aprovar: v.aprovar });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos registrar a decisão."));
    return data as { situacao_hoje: EnvioSituacaoHoje };
  });
}

export function useEnvioAprovacoes(envioId?: string) {
  return useQuery({
    queryKey: [...KEY, "aprovacoes", envioId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_envio_aprovacoes", { f: envioId ? { envio_id: envioId } : {} });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as aprovações."));
      return (data as OpsEnvioDecisao[] | null) ?? [];
    },
  });
}

// ---------------------------------------------------------------- 41.3: grupo e @ padrão de cada cliente

export function useEnvioPadroes() {
  return useQuery({
    queryKey: [...KEY, "padroes"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_envio_padroes");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os grupos e @ dos clientes."));
      return (data as OpsEnvioPadrao[] | null) ?? [];
    },
  });
}

/** Salva o padrão do cliente; vale também para os envios (não arquivados) em que ele está. */
export function useSaveEnvioPadrao() {
  return useEnviosMutation(async (v: { cliente_id: string; nome_grupo: string; contatos_marcar: string[]; contatos_desligados: string[] }) => {
    const { data, error } = await supabase.rpc("ops_envio_padrao_save", { p_cliente: v.cliente_id,
      p: { nome_grupo: v.nome_grupo, contatos_marcar: v.contatos_marcar, contatos_desligados: v.contatos_desligados } });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar o grupo e os @ do cliente."));
    return data as { envios_atualizados: number };
  });
}
