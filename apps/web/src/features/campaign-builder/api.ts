import type { AutomationsCheck } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
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

export interface AccountListItem { id: string; name: string; detail?: string }
export interface AccountLists {
  pixels: AccountListItem[];
  customAudiences: AccountListItem[];
  savedAudiences: AccountListItem[];
  /** Listas que o Meta não devolveu (ex.: falta de permissão): a tela avisa em vez de mostrar "vazio". */
  failed: ("pixels" | "customAudiences" | "savedAudiences")[];
}

/** Pixels e públicos da conta de anúncio, lidos do Meta pelo servidor (só leitura). */
export function useAccountLists(adAccountId: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, "listas", adAccountId],
    enabled: !!adAccountId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-builder", { body: { action: "account_lists", adAccountId } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: AccountLists }).data;
    },
  });
}

export interface DraftValidation {
  ok: boolean;
  message: string | null;
  code: number | null;
  subcode: number | null;
  permission: boolean;
  scope: "campaign";
}

/** Pergunta ao Meta se a campanha do rascunho seria aceita (sem criar nada). O rascunho precisa estar salvo. */
export function useValidateDraft() {
  return useMutation({
    mutationFn: async (draftId: string) => {
      const { data, error } = await supabase.functions.invoke("meta-builder", { body: { action: "validate", draftId } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: DraftValidation }).data;
    },
  });
}

export interface PublishItemRow {
  kind: "campanha" | "conjunto" | "criativo" | "anuncio";
  local_id: string;
  name: string;
  position: number;
  status: "pendente" | "criado" | "falhou" | "pulado";
  meta_id: string | null;
  confirmed: boolean;
  effective_status: string | null;
  error_code: number | null;
  error_message: string | null;
  /** Leitura de volta das automações do Meta (Fase J.1). */
  automations_check?: AutomationsCheck | null;
}
export interface PublishOperationRow {
  id: string;
  status: "processando" | "concluida" | "parcial" | "falhou";
  summary: { campanhas?: number; conjuntos?: number; anuncios?: number };
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
  publish_items: PublishItemRow[];
}

/** Publicações deste rascunho (a mais recente primeiro), com cada objeto criado no Meta. */
export function usePublishHistory(draftId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "publicacoes", draftId],
    enabled: !!draftId,
    queryFn: async () => {
      const { data, error } = await supabase.from("publish_operations")
        .select("id, status, summary, error_message, created_at, finished_at, publish_items(kind, local_id, name, position, status, meta_id, confirmed, effective_status, error_code, error_message, automations_check)")
        .eq("draft_id", draftId!).order("created_at", { ascending: false });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos ler as publicações."));
      return ((data ?? []) as unknown as PublishOperationRow[]).map((o) => ({ ...o, publish_items: [...o.publish_items].sort((x, y) => x.position - y.position) }));
    },
  });
}

/** Cria a campanha no Meta (tudo PAUSADO). `operationKey` repetido devolve a mesma publicação (nunca cria duas vezes). */
export function usePublishDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { draftId: string; operationKey: string }) => {
      const { data, error } = await supabase.functions.invoke("meta-builder", { body: { action: "publish", ...input } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: { operation: { id: string; status: string } | null; repeated: boolean } }).data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...KEY, "publicacoes"] }),
  });
}

export interface DriveListing {
  folder: { id: string; name: string };
  folders: { id: string; name: string }[];
  images: { id: string; name: string; mimeType: string; size: number | null }[];
  /** Vídeos MP4/MOV (até 30 MB). Pode faltar em respostas antigas. */
  videos?: { id: string; name: string; mimeType: string; size: number | null }[];
  /** Arquivos de outros tipos que não aparecem. */
  others: number;
}

/** Lista uma pasta do Google Drive (link ou ID). Só enxerga o que foi compartilhado com a conta de serviço do CRM. */
export function useDriveList() {
  return useMutation({
    mutationFn: async (folder: string) => {
      const { data, error } = await supabase.functions.invoke("meta-builder", { body: { action: "drive_list", folder } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: DriveListing }).data;
    },
  });
}

/** Miniatura da imagem escolhida (null se o Drive não tiver). */
export function useDriveThumb(fileId: string | null) {
  return useQuery({
    queryKey: [...KEY, "miniatura", fileId],
    enabled: !!fileId,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-builder", { body: { action: "drive_thumb", fileId } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: { thumbnail: string | null } }).data.thumbnail;
    },
  });
}

export interface TargetingHit { id: string; label: string; detail?: string }

/** Busca interesses ou cidades no próprio Meta (só leitura). */
export function useTargetingSearch(adAccountId: string | null | undefined, kind: "interest" | "city") {
  return useMutation({
    mutationFn: async (q: string): Promise<TargetingHit[]> => {
      const { data, error } = await supabase.functions.invoke("meta-builder", { body: { action: "targeting_search", adAccountId, kind, q } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      const rows = (data as { data: { results: { id?: string; key?: string; name: string; detail?: string }[] } }).data.results;
      return rows.map((r) => ({ id: String(r.id ?? r.key), label: r.name, detail: r.detail }));
    },
  });
}

export interface LeadFormOption { id: string; name: string; status: string }

/** Formulários de cadastro de uma página. Se o Meta não liberar, a tela cai para o campo manual. */
export function useLeadForms(adAccountId: string | null | undefined, pageId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "formularios", adAccountId, pageId],
    enabled: enabled && !!adAccountId && /^\d{5,30}$/.test(pageId),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-builder", { body: { action: "lead_forms", adAccountId, pageId } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: { forms: LeadFormOption[] } }).data.forms;
    },
  });
}

export interface IgMediaItem { id: string; caption: string; type: string; permalink: string; date: string; thumbnail: string }

/** Posts recentes do Instagram vinculado (para promover um post que já existe). Se o Meta não liberar, a mensagem explica. */
export function useIgMedia(adAccountId: string | null | undefined, igUserId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "posts-instagram", adAccountId, igUserId],
    enabled: enabled && !!adAccountId && /^\d{5,30}$/.test(igUserId),
    staleTime: 2 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-builder", { body: { action: "ig_media", adAccountId, igUserId } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: { media: IgMediaItem[] } }).data.media;
    },
  });
}
