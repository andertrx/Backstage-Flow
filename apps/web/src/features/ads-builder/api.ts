import type { AdsBuilderForm } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// ---------------------------------------------------------------------------
// Etapa 42 — Criador de Anúncios. Só guarda modelos e o histórico dos pedidos;
// quem cria no Meta é o Claude. Permissão conferida no banco (admin, gestor, operador).
// ---------------------------------------------------------------------------

export interface AdsModelo {
  id: string;
  nome: string;
  dados: AdsBuilderForm;
  updated_at: string;
  atualizado_por_nome: string | null;
}

export interface AdsPedido {
  id: number;
  tipo: "anuncios";
  conta: string;
  campanha: string;
  conjunto: string;
  dados: AdsBuilderForm;
  texto: string;
  origem_pedido_id: number | null;
  criado_por_nome: string | null;
  created_at: string;
}

const KEY = ["ads-builder"] as const;

/** Mensagem do banco quando a regra é nossa (22023/42501); senão, a mensagem amigável. */
function dbError(error: { code?: string; message: string }, fallback: string) {
  return error.code === "22023" || error.code === "42501" ? error.message : friendlyDbError(error, fallback);
}

export function useAdsModelos() {
  return useQuery({
    queryKey: [...KEY, "modelos"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ads_builder_modelos");
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos carregar os modelos."));
      return (data as AdsModelo[] | null) ?? [];
    },
  });
}

export function useAdsPedidos(busca: string) {
  return useQuery({
    queryKey: [...KEY, "pedidos", busca],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ads_builder_pedidos", { f: { busca: busca || undefined, limite: 100 } });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos carregar o histórico."));
      return (data as AdsPedido[] | null) ?? [];
    },
  });
}

function useAdsMutation<T, R>(fn: (v: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export function useSaveAdsModelo() {
  return useAdsMutation(async (v: { id: string | null; nome: string; dados: AdsBuilderForm }) => {
    const { data, error } = await supabase.rpc("ads_builder_modelo_save", { p_id: v.id, p_nome: v.nome, p_dados: v.dados });
    if (error) throw new FriendlyError(dbError(error, "Não conseguimos salvar o modelo."));
    return data as string;
  });
}

export function useArchiveAdsModelo() {
  return useAdsMutation(async (id: string) => {
    const { error } = await supabase.rpc("ads_builder_modelo_archive", { p_id: id });
    if (error) throw new FriendlyError(dbError(error, "Não conseguimos arquivar o modelo."));
  });
}

export function useAddAdsPedido() {
  return useAdsMutation(async (v: { dados: AdsBuilderForm; texto: string; origem: number | null }) => {
    const { data, error } = await supabase.rpc("ads_builder_pedido_add", { p_dados: v.dados, p_texto: v.texto, p_origem: v.origem });
    if (error) throw new FriendlyError(dbError(error, "Não conseguimos guardar o pedido no histórico."));
    return data as number;
  });
}

// ---------------------------------------------------------------- listas do que o CRM já tem do Meta (42.1)

export interface Opcao {
  id: string;
  label: string;
}

export interface MetaConta {
  id: string;
  name: string;
  external_id: string;
  client_id: string;
  client_name: string;
  business_id: string | null;
  business_name: string | null;
}

export interface MetaItem {
  id: string;
  name: string;
  external_id: string;
  status: string;
}

/** Contas do Meta que você pode ver (o RLS limita aos clientes liberados), com o cliente e a BM. Só de clientes ativos. */
export function useMetaAccounts() {
  return useQuery({
    queryKey: [...KEY, "contas"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [a, c] = await Promise.all([
        supabase.from("ad_accounts").select("id, name, external_id, client_id, business_id, business_name").eq("platform_id", "meta").is("unlinked_at", null).order("name").limit(1000),
        // Só clientes ativos (encerrados não aparecem na lista)
        supabase.from("clients").select("id, name").is("excluded_at", null).eq("status", "ativo").order("name").limit(1000),
      ]);
      if (a.error || c.error) throw new FriendlyError(friendlyDbError((a.error ?? c.error)!, "Não conseguimos carregar as contas."));
      const names = new Map(((c.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
      return ((a.data ?? []) as Omit<MetaConta, "client_name">[])
        .filter((x) => names.has(x.client_id))
        .map((x) => ({ ...x, client_name: names.get(x.client_id) as string }));
    },
  });
}

/** Rótulo da conta no pedido: "Nome (act_123)". */
export const contaLabel = (a: Pick<MetaConta, "name" | "external_id">) => `${a.name} (act_${a.external_id})`;

const ativoPrimeiro = (rows: MetaItem[]) => [...rows].sort((x, y) => Number(y.status === "ativa") - Number(x.status === "ativa") || x.name.localeCompare(y.name));

export function useCampaignOptions(accountId: string | null) {
  return useQuery({
    queryKey: [...KEY, "campanhas", accountId],
    enabled: !!accountId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("id, name, external_id, status").eq("ad_account_id", accountId!).order("name").limit(1000);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as campanhas."));
      return ativoPrimeiro((data ?? []) as MetaItem[]);
    },
  });
}

export function useAdSetOptions(campaignId: string | null) {
  return useQuery({
    queryKey: [...KEY, "conjuntos", campaignId],
    enabled: !!campaignId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ad_groups").select("id, name, external_id, status").eq("campaign_id", campaignId!).order("name").limit(1000);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os conjuntos."));
      return ativoPrimeiro((data ?? []) as MetaItem[]);
    },
  });
}
