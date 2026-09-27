import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// ---------------------------------------------------------------------------
// Etapa 19.4 — e-mail semanal do relatório (envio pelo Resend, no servidor)
// ---------------------------------------------------------------------------

export type EmailButton = "login" | "link" | "none";

export interface ClientEmail {
  client_id: string;
  enabled: boolean;
  recipients: string[];
  /** 1 = segunda … 7 = domingo (fuso do cliente) */
  weekday: number;
  send_hour: number;
  button: EmailButton;
  last_sent_at: string | null;
}

export interface ClientEmailLog {
  id: number;
  created_at: string;
  trigger: "agendado" | "manual" | "teste";
  status: "enviado" | "erro" | "pulado";
  recipients: number;
  period_from: string | null;
  period_to: string | null;
  detail: string | null;
}

export interface EmailSettings {
  from_name: string;
  from_email: string;
  reply_to: string | null;
  has_key: boolean;
  key_updated_at: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
}

export const WEEKDAYS = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const isEmail = (s: string) => EMAIL_RE.test(s) && s.length <= 254;

/** "a@x.com, b@y.com" ou um por linha → lista limpa (sem repetidos) e os inválidos. */
export function parseRecipients(text: string): { list: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const list = [...new Set(parts.filter(isEmail))];
  return { list, invalid: parts.filter((p) => !isEmail(p)) };
}

/** Nossas funções do banco explicam o problema (código 22023) em português: mostra a explicação. */
const ownDbError = (error: { code?: string; message?: string }, fallback: string) =>
  error.code === "22023" && error.message ? error.message : friendlyDbError(error, fallback);

const KEY = (clientId: string) => ["client-email", clientId];

export function useClientEmail(clientId: string) {
  return useQuery({
    queryKey: [...KEY(clientId), "config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_report_email")
        .select("client_id,enabled,recipients,weekday,send_hour,button,last_sent_at").eq("client_id", clientId).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o e-mail semanal."));
      return { row: data as ClientEmail | null };
    },
  });
}

export function useSaveClientEmail(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ value, exists }: { value: Omit<ClientEmail, "client_id" | "last_sent_at">; exists: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const row = { ...value, updated_by: auth.user?.id ?? null };
      const { error } = exists
        ? await supabase.from("client_report_email").update(row).eq("client_id", clientId)
        : await supabase.from("client_report_email").insert({ client_id: clientId, ...row });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos salvar o e-mail semanal."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY(clientId) }),
  });
}

/** Só diz SE há link guardado para o botão e se ele ainda é o atual (o código nunca volta para a tela). */
export function useEmailLinkStatus(clientId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY(clientId), "link-status"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_report_email_link_status", { p_client_id: clientId });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos conferir o link do e-mail."));
      return data as "sem_link" | "ok" | "desatualizado" | null;
    },
  });
}

export function useSetEmailLink(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (link: string) => {
      const { error } = await supabase.rpc("client_report_email_set_link", { p_client_id: clientId, p_link: link.trim() });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos guardar o link."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY(clientId), "link-status"] }),
  });
}

export function useClientEmailLog(clientId: string) {
  return useQuery({
    queryKey: [...KEY(clientId), "log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_report_email_log")
        .select("id,created_at,trigger,status,recipients,period_from,period_to,detail").eq("client_id", clientId)
        .order("created_at", { ascending: false }).limit(10);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os envios."));
      return data as ClientEmailLog[];
    },
  });
}

async function invokeEmail(body: Record<string, unknown>, fallback: string) {
  const { data, error } = await supabase.functions.invoke("client-report-email", { body });
  if (error) throw new FriendlyError(await friendlyFunctionError(error));
  if (!data) throw new FriendlyError(fallback);
  return (data as { data: Record<string, unknown> }).data;
}

/** "test" = só para quem pediu; "send_now" = para os destinatários do cliente. */
export function useSendClientEmail(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: "test" | "send_now") =>
      invokeEmail({ action, clientId }, "Não conseguimos enviar o e-mail.") as Promise<{ status: string; detail: string; sent?: number }>,
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY(clientId) }),
  });
}

// --- Remetente e chave (só admin) -------------------------------------------

export function useEmailSettings(enabled: boolean) {
  return useQuery({
    queryKey: ["email-settings"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_settings")
        .select("from_name,from_email,reply_to,has_key,key_updated_at,last_test_at,last_test_ok,last_test_error").eq("id", true).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a configuração de e-mail."));
      return data as EmailSettings | null;
    },
  });
}

export function useSaveEmailSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { fromName: string; fromEmail: string; replyTo: string; apiKey: string }) => {
      const { error } = await supabase.rpc("email_settings_save", {
        p_from_name: v.fromName.trim(), p_from_email: v.fromEmail.trim(), p_reply_to: v.replyTo.trim() || null, p_api_key: v.apiKey.trim() || null,
      });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a configuração de e-mail."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-settings"] }),
  });
}

export function useRemoveEmailKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("email_settings_remove_key");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos remover a chave."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-settings"] }),
  });
}

export function useTestEmailSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invokeEmail({ action: "test_settings" }, "Não conseguimos enviar o teste.") as Promise<{ sentTo: string }>,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["email-settings"] }),
  });
}
