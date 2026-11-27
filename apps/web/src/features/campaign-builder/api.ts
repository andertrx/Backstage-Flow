import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// ---------------------------------------------------------------------------
// Fase 35.2 — Campaign Builder (passo 1): permissões por pessoa e rascunhos.
// Nada aqui publica no Meta. As regras vivem no banco (private.builder_*_impl).
// ---------------------------------------------------------------------------

export interface BuilderPermissions {
  ver: boolean;
  criar: boolean;
  editar: boolean;
  publicar: boolean;
}
export interface BuilderDraftRow {
  id: string;
  client_id: string;
  client_name: string;
  ad_account_id: string | null;
  ad_account_name: string | null;
  name: string;
  version: number;
  updated_at: string;
  updated_by_name: string | null;
}
export interface BuilderPersonPermission {
  user_id: string;
  nome: string;
  papel: string;
  criar: boolean;
  editar: boolean;
  publicar: boolean;
}

const KEY = ["campaign-builder"] as const;

/** Mensagem do banco quando a regra é nossa (22023/42501/40001); senão, a mensagem amigável. */
function dbError(error: { code?: string; message: string }, fallback: string) {
  return ["22023", "42501", "40001"].includes(error.code ?? "") ? error.message : friendlyDbError(error, fallback);
}

export function useBuilderPermissions() {
  return useQuery({
    queryKey: [...KEY, "minhas"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("builder_my_permissions");
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos carregar suas permissões."));
      return data as BuilderPermissions;
    },
  });
}

export function useBuilderDrafts() {
  return useQuery({
    queryKey: [...KEY, "rascunhos"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("builder_draft_list", { p_client: null });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos carregar os rascunhos."));
      return (data as BuilderDraftRow[] | null) ?? [];
    },
  });
}

export function useCreateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { name: string; clientId: string; adAccountId: string }) => {
      const { data, error } = await supabase.rpc("builder_draft_save", {
        p_id: null, p_version: null, p_client: v.clientId, p_account: v.adAccountId, p_name: v.name, p_data: {},
      });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos criar o rascunho."));
      return data as { id: string; version: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, "rascunhos"] }),
  });
}

export function useArchiveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("builder_draft_archive", { p_id: id });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos arquivar o rascunho."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, "rascunhos"] }),
  });
}

export function useUnarchiveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("builder_draft_unarchive", { p_id: id });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos desfazer o arquivamento."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, "rascunhos"] }),
  });
}

/** Só administrador. */
export function useBuilderPeople(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "pessoas"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("builder_permissions_list");
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos carregar as pessoas."));
      return (data as BuilderPersonPermission[] | null) ?? [];
    },
  });
}

export function useSaveBuilderPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: { user_id: string; criar: boolean; editar: boolean; publicar: boolean }) => {
      const { error } = await supabase.rpc("builder_permission_save", { p_user: p.user_id, p_create: p.criar, p_edit: p.editar, p_publish: p.publicar });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos salvar a permissão."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, "pessoas"] }),
  });
}

export interface BuilderDraftFull {
  id: string;
  client_id: string;
  ad_account_id: string | null;
  name: string;
  data: unknown;
  version: number;
  updated_at: string;
}

export function useBuilderDraft(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "rascunho", id],
    enabled: !!id,
    // O editor guarda a própria cópia; só carrega uma vez ao abrir.
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("builder_draft_get", { p_id: id });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos abrir o rascunho."));
      return data as BuilderDraftFull;
    },
  });
}

/** Salva o conteúdo do rascunho. Devolve a nova versão. Conflito (outra pessoa salvou antes) vira erro com a mensagem do banco. */
export async function saveDraftData(input: { id: string; version: number; name: string; data: unknown }) {
  const { data, error } = await supabase.rpc("builder_draft_save", {
    p_id: input.id, p_version: input.version, p_client: null, p_account: null, p_name: input.name, p_data: input.data,
  });
  if (error) {
    const e = new FriendlyError(dbError(error, "Não conseguimos salvar o rascunho."));
    (e as FriendlyError & { conflict?: boolean }).conflict = error.code === "40001";
    throw e;
  }
  return data as { id: string; version: number; updated_at: string };
}

/** Moeda e nome da conta do rascunho (para escrever o orçamento na moeda certa; nunca se soma moedas). */
export function useDraftAccount(accountId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "conta", accountId],
    enabled: !!accountId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ad_accounts").select("id, name, currency, external_id").eq("id", accountId!).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a conta."));
      return data as { id: string; name: string; currency: string; external_id: string } | null;
    },
  });
}
