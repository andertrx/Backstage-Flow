import type { OpsNotificationKind, OpsRecurrenceFrequency } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";

// ---------------------------------------------------------------------------
// Etapa 36.6 — sino da Central e repetição de tarefas/reuniões. Cada pessoa só
// lê as próprias notificações (o banco confere).
// ---------------------------------------------------------------------------

export interface OpsNotification {
  id: number;
  kind: OpsNotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  actor: string | null;
  created_at: string;
  read_at: string | null;
}

export interface OpsRecurrence {
  id: string;
  kind: "tarefa" | "reuniao";
  frequency: OpsRecurrenceFrequency;
  weekdays: number[] | null;
  month_day: number | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  stop_reason: string | null;
  last_date: string | null;
  is_source: boolean;
  source_id: string;
  source_number: number;
  occurrences: number;
  created_by_name: string;
  can_stop: boolean;
}

const KEY = ["ops"] as const;
const NOTIF_KEY = [...KEY, "notifications"] as const;

export function useUnreadNotifications(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIF_KEY, "unread"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_notifications_unread");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos contar as notificações."));
      return (data as number | null) ?? 0;
    },
  });
}

export function useNotifications(f: { unread?: boolean; kind?: string; limit?: number }, enabled = true) {
  return useQuery({
    queryKey: [...NOTIF_KEY, "list", f],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_notifications_list", { p_unread: f.unread ?? false, p_kind: f.kind || null, p_limit: f.limit ?? 30 });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as notificações."));
      return (data as { items: OpsNotification[]; unread: number } | null) ?? { items: [], unread: 0 };
    },
  });
}

/** Marca como lidas (ids) ou todas (sem ids). */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[] | null) => {
      const { error } = await supabase.rpc("ops_notifications_read", { p_ids: ids });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos marcar como lida."));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIF_KEY }),
  });
}

export function useNotificationPrefs() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: [...NOTIF_KEY, "prefs", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_notification_prefs").select("muted").eq("user_id", profile!.id).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as preferências."));
      return ((data as { muted: string[] } | null)?.muted ?? []) as OpsNotificationKind[];
    },
  });
}

export function useSaveNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (muted: OpsNotificationKind[]) => {
      const { error } = await supabase.rpc("ops_notification_prefs_save", { p_muted: muted });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar as preferências."));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIF_KEY }),
  });
}

export function useRecurrence(kind: "tarefa" | "reuniao", id: string | null) {
  return useQuery({
    queryKey: [...KEY, "recurrence", kind, id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_recurrence_for", { p_kind: kind, p_id: id });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a repetição."));
      return (data as OpsRecurrence | null) ?? null;
    },
  });
}

export function useSaveRecurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: { kind: "tarefa" | "reuniao"; source_id: string; frequency: OpsRecurrenceFrequency; weekdays: number[]; month_day: string;
      start_date: string; end_date: string }) => {
      const { data, error } = await supabase.rpc("ops_recurrence_save", { p });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos criar a repetição."));
      return data as string;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useStopRecurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("ops_recurrence_stop", { p_id: id });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos parar a repetição."));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
