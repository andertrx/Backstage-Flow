import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

/** Contatos dos clientes (Tracking T3.1). O banco confere quem vê e quem marca. */
export interface ContactClient {
  id: string;
  name: string;
  has_site: boolean;
}

export interface ContactRow {
  id: number;
  origin: "site" | "whatsapp" | "manual";
  created_at: string;
  last_change_at: string;
  ref_code: string | null;
  stage_id: string;
  profile_id: string | null;
  sales: number;
  has_phone: boolean;
  has_email: boolean;
  channel: string | null;
  campaign: string | null;
  site: string | null;
  archived: boolean;
}

export interface ContactProfile {
  id: string;
  client_id: string;
  name: string;
  position: number;
  meta_event: string | null;
  archived_at: string | null;
}

export interface ContactStage extends ContactProfile {
  kind: "aberta" | "ganha" | "perdida";
}

export interface ContactHistoryRow {
  id: number;
  at: string;
  kind: "criado" | "etapa" | "perfil" | "venda" | "arquivado";
  stage_id: string | null;
  profile_id: string | null;
  value_micros: number | null;
  currency: string | null;
  order_id: string | null;
  meta_event: string | null;
  meta_note: string | null;
}

const KEY = ["contacts"] as const;
// Regras do banco que já vêm em português (código 22023 = dado inválido; P0002 = não encontrado; 23505 = repetido).
const ruleError = (error: { code?: string; message: string }, fallback: string) =>
  new FriendlyError(["22023", "P0002", "23505"].includes(error.code ?? "") ? error.message : friendlyDbError(error, fallback));

export function useContactClients() {
  return useQuery({
    queryKey: [...KEY, "clients"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contacts_clients");
      if (error) throw ruleError(error, "Não conseguimos carregar os clientes.");
      return (data ?? []) as ContactClient[];
    },
  });
}

export function useContactSetup(clientId: string | null) {
  return useQuery({
    queryKey: [...KEY, "setup", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const [profiles, stages] = await Promise.all([
        supabase.from("tracking_contact_profiles").select("id, client_id, name, position, meta_event, archived_at").eq("client_id", clientId!).order("position"),
        supabase.from("tracking_contact_stages").select("id, client_id, name, position, kind, meta_event, archived_at").eq("client_id", clientId!).order("position"),
      ]);
      if (profiles.error) throw ruleError(profiles.error, "Não conseguimos carregar os perfis.");
      if (stages.error) throw ruleError(stages.error, "Não conseguimos carregar as etapas.");
      return { profiles: profiles.data as ContactProfile[], stages: stages.data as ContactStage[] };
    },
  });
}

export function useContacts(clientId: string | null, filter: { stageId?: string | null }) {
  return useQuery({
    queryKey: [...KEY, "list", clientId, filter.stageId ?? null],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contacts_list", { p_client: clientId, p_stage: filter.stageId ?? null });
      if (error) throw ruleError(error, "Não conseguimos carregar os contatos.");
      return (data ?? []) as ContactRow[];
    },
  });
}

/** Busca pelo código "ref." da mensagem ou pelo telefone já cifrado na tela. */
export async function findContacts(clientId: string, by: { code?: string; phHash?: string }): Promise<ContactRow[]> {
  const { data, error } = await supabase.rpc("contacts_list", { p_client: clientId, p_code: by.code ?? null, p_ph_hash: by.phHash ?? null });
  if (error) throw ruleError(error, "Não conseguimos buscar o contato.");
  return (data ?? []) as ContactRow[];
}

export function useContactHistory(contactId: number | null) {
  return useQuery({
    queryKey: [...KEY, "history", contactId],
    enabled: contactId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("tracking_contact_history")
        .select("id, at, kind, stage_id, profile_id, value_micros, currency, order_id, meta_event, meta_note")
        .eq("contact_id", contactId!).order("at", { ascending: false }).order("id", { ascending: false });
      if (error) throw ruleError(error, "Não conseguimos carregar o histórico.");
      return data as ContactHistoryRow[];
    },
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientId: string; code?: string; phHash?: string; emHash?: string }) => {
      const { data, error } = await supabase.rpc("contact_create", {
        p_client: input.clientId, p_code: input.code ?? null, p_ph_hash: input.phHash ?? null, p_em_hash: input.emHash ?? null,
      });
      if (error) throw ruleError(error, "Não conseguimos criar o contato.");
      return data as number;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export interface UpdateResult {
  perfil?: string;
  perfil_meta?: string | null;
  etapa?: string;
  venda_meta?: string | null;
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: number; stageId?: string; profileId?: string; value?: number; currency?: string; orderId?: string }) => {
      const { data, error } = await supabase.rpc("contact_update", {
        p_id: input.id, p_stage: input.stageId ?? null, p_profile: input.profileId ?? null, p_value: input.value ?? null,
        p_currency: input.currency ?? null, p_order: input.orderId || null,
      });
      if (error) throw ruleError(error, "Não conseguimos salvar a marcação.");
      return (data ?? {}) as UpdateResult;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useArchiveContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc("contact_archive", { p_id: id });
      if (error) throw ruleError(error, "Não conseguimos arquivar o contato.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** Perfis e etapas: admin e gestor (o banco confere). Nada é apagado: "arquivar". */
export function useSaveSetupItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { table: "profiles" | "stages"; id?: string; values: Record<string, unknown> }) => {
      const table = input.table === "profiles" ? "tracking_contact_profiles" : "tracking_contact_stages";
      const { error } = input.id
        ? await supabase.from(table).update(input.values).eq("id", input.id)
        : await supabase.from(table).insert(input.values);
      if (error) throw ruleError(error, "Não conseguimos salvar.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
