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
