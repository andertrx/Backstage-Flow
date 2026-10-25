import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SalesMapping } from "@backstage/shared";
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
  origin: "site" | "whatsapp" | "manual" | "sistema";
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

/* ------------------------------------------------------------------ */
/* Sistemas de venda (Tracking T3.2): a venda chega pelo aviso (webhook) do sistema do cliente. */

export interface SalesWebhook {
  id: string;
  client_id: string;
  name: string;
  key_hint: string;
  enabled: boolean;
  test_mode: boolean;
  mapping: SalesMapping;
  last_received_at: string | null;
  last_result: SalesLogRow["result"] | null;
  last_reason: string | null;
  last_keys: string[];
  created_at: string;
}

export interface SalesLogRow {
  id: number;
  received_at: string;
  result: "aceito" | "repetido" | "ignorado" | "recusado" | "teste";
  reason: string | null;
  order_id: string | null;
  value_micros: number | null;
  currency: string | null;
  contact_found: boolean | null;
}

/** Endereço que o sistema de vendas chama (a chave vai no cabeçalho x-webhook-key ou em &k=). */
export function salesWebhookUrl(id: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://demonstracao.supabase.co";
  return `${base.replace(/\/$/, "")}/functions/v1/sales-webhook?w=${id}`;
}

export function useSalesWebhooks(clientId: string | null) {
  return useQuery({
    queryKey: [...KEY, "sales-webhooks", clientId],
    enabled: Boolean(clientId),
    // Janela aberta: confere a cada 15 s se chegou aviso novo (campos recebidos e último resultado).
    staleTime: 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("tracking_sales_webhooks")
        .select("id, client_id, name, key_hint, enabled, test_mode, mapping, last_received_at, last_result, last_reason, last_keys, created_at")
        .eq("client_id", clientId!).is("archived_at", null).order("created_at");
      if (error) throw ruleError(error, "Não conseguimos carregar os sistemas de venda.");
      return data as SalesWebhook[];
    },
  });
}

export function useSalesWebhookLog(webhookId: string | null) {
  return useQuery({
    queryKey: [...KEY, "sales-log", webhookId],
    enabled: Boolean(webhookId),
    staleTime: 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("tracking_sales_webhook_log")
        .select("id, received_at, result, reason, order_id, value_micros, currency, contact_found")
        .eq("webhook_id", webhookId!).order("received_at", { ascending: false }).order("id", { ascending: false }).limit(20);
      if (error) throw ruleError(error, "Não conseguimos carregar os avisos recebidos.");
      return data as SalesLogRow[];
    },
  });
}

/** Cria o endereço; a chave volta UMA vez (o banco guarda só o hash). */
export function useCreateSalesWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { clientId: string; name: string }) => {
      const { data, error } = await supabase.rpc("sales_webhook_create", { p_client: input.clientId, p_name: input.name });
      if (error) throw ruleError(error, "Não conseguimos criar o endereço.");
      return data as { id: string; key: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useNewSalesWebhookKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("sales_webhook_new_key", { p_id: id });
      if (error) throw ruleError(error, "Não conseguimos trocar a chave.");
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSalesWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; values: Partial<Pick<SalesWebhook, "name" | "enabled" | "test_mode" | "mapping">> & { archived_at?: string } }) => {
      const { error } = await supabase.from("tracking_sales_webhooks").update(input.values).eq("id", input.id);
      if (error) throw ruleError(error, "Não conseguimos salvar.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/* ------------------------------------------------------------------ */
/* Frases do WhatsApp (Tracking T4.1): o atendente manda a frase no chat e o CRM marca o contato. */

export interface WaTriggerRow {
  id: string;
  client_id: string;
  phrase: string;
  stage_id: string | null;
  profile_id: string | null;
  default_value: number | null;
  currency: string;
  position: number;
  enabled: boolean;
  archived_at: string | null;
}

export interface WaTriggerLogRow {
  id: number;
  at: string;
  trigger_id: string;
  contact_id: number | null;
  result: "aplicado" | "repetido" | "sem_valor" | "ignorado";
  reason: string | null;
  value_micros: number | null;
  currency: string | null;
}

export function useWaTriggers(clientId: string | null) {
  return useQuery({
    queryKey: [...KEY, "wa-triggers", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const [triggers, log, conn] = await Promise.all([
        supabase.from("tracking_wa_triggers")
          .select("id, client_id, phrase, stage_id, profile_id, default_value, currency, position, enabled, archived_at")
          .eq("client_id", clientId!).is("archived_at", null).order("position").order("created_at"),
        supabase.from("tracking_wa_trigger_log")
          .select("id, at, trigger_id, contact_id, result, reason, value_micros, currency")
          .eq("client_id", clientId!).order("at", { ascending: false }).order("id", { ascending: false }).limit(20),
        supabase.from("tracking_whatsapp_connections").select("id, enabled").eq("client_id", clientId!),
      ]);
      if (triggers.error) throw ruleError(triggers.error, "Não conseguimos carregar as frases.");
      if (log.error) throw ruleError(log.error, "Não conseguimos carregar as frases reconhecidas.");
      if (conn.error) throw ruleError(conn.error, "Não conseguimos ver a ligação do WhatsApp.");
      return {
        triggers: triggers.data as WaTriggerRow[],
        log: log.data as WaTriggerLogRow[],
        whatsappOn: (conn.data as { enabled: boolean }[]).some((c) => c.enabled),
      };
    },
    staleTime: 0,
    refetchInterval: 15_000,
  });
}

export function useSaveWaTrigger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; values: Partial<Omit<WaTriggerRow, "id">> }) => {
      const { error } = input.id
        ? await supabase.from("tracking_wa_triggers").update(input.values).eq("id", input.id)
        : await supabase.from("tracking_wa_triggers").insert(input.values);
      if (error) {
        throw ruleError(error.code === "23505" ? { ...error, message: "Já existe uma frase igual neste cliente." } : error, "Não conseguimos salvar a frase.");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
