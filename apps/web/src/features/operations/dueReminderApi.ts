import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

/** Central 36.17: lembrete de tarefa vencida (8h, 12h e 17h) para o responsável, no CRM e no aparelho. */
export interface DueTask {
  id: string;
  number: number;
  title: string;
  client: string | null;
  due_date: string;
  days_late: number;
  version: number;
  status_id: string;
}

export interface DueReminder {
  day?: string;
  slot: 8 | 12 | 17 | null;
  seen: boolean;
  tasks: DueTask[];
}

const KEY = ["ops", "due-reminder"] as const;

export function useDueReminder(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    enabled,
    // Confere a cada minuto: o pop-up abre sozinho quando chega 8h, 12h ou 17h com o CRM aberto.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_due_reminder");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos ver as tarefas vencidas."));
      return data as DueReminder;
    },
  });
}

export function useMarkReminderSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { day: string; slot: number }) => {
      const { error } = await supabase.rpc("ops_due_reminder_seen", { p_day: v.day, p_slot: v.slot });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos registrar."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/* ---------------- Notificação no aparelho (Web Push) ---------------- */

export type PushState = "sem_suporte" | "bloqueado" | "desligado" | "ligado";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const fromB64u = (s: string) => {
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** "Chrome no Windows", "Chrome no Android"... (só para a pessoa reconhecer o aparelho na lista). */
export function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : null;
  return os ? `${browser} no ${os}` : browser;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return "sem_suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "ligado" : "desligado";
}

export function usePushState() {
  return useQuery({ queryKey: ["ops", "push-state"], queryFn: currentPushState, staleTime: 0 });
}

export function usePushDevices(enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "push-devices"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_push_subscriptions")
        .select("id, device, created_at, last_sent_at, last_error, disabled_at").order("created_at", { ascending: false });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os aparelhos."));
      return data as { id: string; device: string | null; created_at: string; last_sent_at: string | null; last_error: string | null; disabled_at: string | null }[];
    },
  });
}

/** Pede a autorização do navegador e cadastra este aparelho. */
export function useEnablePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!pushSupported()) throw new FriendlyError("Este navegador não recebe notificações. No iPhone, adicione o Backstage Flow à Tela de Início e abra por lá.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new FriendlyError("As notificações foram bloqueadas. Clique no cadeado ao lado do endereço do site → Notificações → Permitir, e tente de novo.");
      const { data, error } = await supabase.functions.invoke("ops-push", { body: { action: "public_key" } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      const publicKey = (data as { data: { publicKey: string } }).data.publicKey;
      const reg = await registration();
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const { error: e2 } = await supabase.rpc("ops_push_subscribe", {
        p_endpoint: json.endpoint ?? "", p_p256dh: json.keys?.p256dh ?? "", p_auth: json.keys?.auth ?? "", p_device: deviceLabel(navigator.userAgent),
      });
      if (e2) throw new FriendlyError(friendlyDbError(e2, "Não conseguimos cadastrar este aparelho."));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["ops"] }),
  });
}

export function useDisablePush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.rpc("ops_push_unsubscribe", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["ops"] }),
  });
}

export function useTestPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ops-push", { body: { action: "test" } });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: { sent: number; failed: number } }).data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["ops", "push-devices"] }),
  });
}
