import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

/** Etapa 37.5 — avisos do monitoramento (ícone próprio no topo, preferências e histórico de envios). */

export type MonitorNotifyKind = "alerta.novo" | "alerta.piorou" | "alerta.atribuido" | "alerta.avaliacao" | "resumo.diario";
export type MonitorSeverity = "critico" | "atencao" | "informativo";
export type MonitorNotifyMode = "imediato" | "resumo" | "ambos";
export type DeliveryChannel = "interno" | "email" | "whatsapp";
export type DeliveryStatus = "pendente" | "enviado" | "falhou" | "preparado" | "pulado";

export interface MonitorNotification {
  id: number;
  kind: MonitorNotifyKind;
  title: string;
  body: string | null;
  link: string;
  alert_id: number | null;
  created_at: string;
  read_at: string | null;
}

export interface MonitorPrefs {
  user_id: string;
  user_name: string | null;
  is_default: boolean;
  has_email: boolean;
  email_ready: boolean;
  enabled: boolean;
  internal: boolean;
  email: boolean;
  whatsapp: boolean;
  min_severity: MonitorSeverity;
  client_ids: string[] | null;
  mode: MonitorNotifyMode;
  digest_hour: number;
  quiet_start: number | null;
  quiet_end: number | null;
  notify_assigned: boolean;
  notify_followups: boolean;
}

export type MonitorPrefsInput = Omit<MonitorPrefs, "user_id" | "user_name" | "is_default" | "has_email" | "email_ready">;

export interface MonitorDelivery {
  id: number;
  user_name: string | null;
  channel: DeliveryChannel;
  kind: MonitorNotifyKind;
  status: DeliveryStatus;
  reason: string | null;
  title: string | null;
  alert_id: number | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
}

const KEY = ["monitoring", "notify"] as const;
const dbMessage = (error: { code?: string; message?: string }, fallback: string) =>
  error.code === "22023" && error.message ? error.message : friendlyDbError(error, fallback);

export function useMonitorNotifications(limit: number, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "list", limit],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_notifications_list", { p_limit: limit });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os avisos do monitoramento."));
      const d = (data ?? { unread: 0, items: [] }) as { unread: number; items: MonitorNotification[] };
      return { unread: Number(d.unread ?? 0), items: d.items ?? [] };
    },
  });
}

/** Marca como lidos (sem lista = todos os meus). */
export function useMarkMonitorRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[] | null) => {
      const { error } = await supabase.rpc("monitor_notifications_read", { p_ids: ids });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos marcar os avisos como lidos."));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [...KEY, "list"] }),
  });
}

export function useMonitorPrefs(userId: string | null) {
  return useQuery({
    queryKey: [...KEY, "prefs", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_prefs_get", { p_user: userId });
      if (error) throw new FriendlyError(dbMessage(error, "Não conseguimos carregar as preferências de aviso."));
      return data as MonitorPrefs;
    },
  });
}

export function useSaveMonitorPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, prefs }: { userId: string | null; prefs: MonitorPrefsInput }) => {
      const { error } = await supabase.rpc("monitor_prefs_save", { p_user: userId, p: prefs });
      if (error) throw new FriendlyError(dbMessage(error, "Não conseguimos salvar as preferências de aviso."));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [...KEY, "prefs"] }),
  });
}

/** Pessoas que recebem avisos (só o administrador, para mexer nas preferências de outra pessoa). */
export function useMonitorNotifyPeople(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "people"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_notify_people");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a lista de pessoas."));
      return (data ?? []) as { id: string; name: string; role: string }[];
    },
  });
}

export function useMonitorDeliveries(limit = 100) {
  return useQuery({
    queryKey: [...KEY, "deliveries", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_deliveries_list", { p_limit: limit });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o histórico de envios."));
      return (data ?? []) as MonitorDelivery[];
    },
  });
}
