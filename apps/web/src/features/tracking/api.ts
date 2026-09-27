import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, Evidence } from "@backstage/shared";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { ConsentMode, ContainerInput, ContainerStatus } from "./logic.ts";

export interface TrackingContainer {
  id: string;
  client_id: string;
  name: string;
  public_key: string;
  allowed_domains: string[];
  status: ContainerStatus;
  test_mode: boolean;
  consent_mode: ConsentMode;
  retention_days: number;
  created_at: string;
  clients: { name: string } | null;
}

export interface OverviewRow {
  container_id: string;
  sessions: number;
  visitors: number;
  pageviews: number;
  events: number;
  paid_sessions: number;
  unknown_origin_sessions: number;
  last_event_at: string | null;
}

export interface TouchpointRow {
  id: number;
  container_id: string;
  occurred_at: string;
  channel: Channel;
  paid: boolean | null;
  evidence: Evidence;
  reason: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  fbclid: string | null;
  gclid: string | null;
  ad_campaign_id: string | null;
  landing_url: string | null;
}

export interface EventRow {
  event_id: string;
  container_id: string;
  event_name: string;
  occurred_at: string;
  page_path: string | null;
  test: boolean;
  touchpoint_id: number | null;
}

const KEY = ["tracking"] as const;

export function useTrackingContainers() {
  return useQuery({
    queryKey: [...KEY, "containers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_containers")
        .select("id, client_id, name, public_key, allowed_domains, status, test_mode, consent_mode, retention_days, created_at, clients(name)")
        .order("created_at", { ascending: true });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os containers de tracking."));
      return data as unknown as TrackingContainer[];
    },
  });
}

export function useTrackingOverview(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "overview", from.slice(0, 13), to.slice(0, 13)],
    enabled,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tracking_overview", { p_from: from, p_to: to });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o resumo do tracking."));
      return (data ?? []) as OverviewRow[];
    },
  });
}

/** Últimas chegadas com origem (as mais recentes primeiro). */
export function useRecentTouchpoints(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "touchpoints"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_touchpoints")
        .select("id, container_id, occurred_at, channel, paid, evidence, reason, utm_source, utm_medium, utm_campaign, fbclid, gclid, ad_campaign_id, landing_url")
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as origens."));
      return data as TouchpointRow[];
    },
  });
}

/** Últimos eventos recebidos (os mais recentes primeiro). */
export function useRecentEvents(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "events"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("tracking_events")
        .select("event_id, container_id, event_name, occurred_at, page_path, test, touchpoint_id")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os eventos."));
      return data as EventRow[];
    },
  });
}

export function useSaveContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ContainerInput }) => {
      if (id) {
        const { client_id: _ignored, ...changes } = input;
        const { error } = await supabase.from("tracking_containers").update(changes).eq("id", id);
        if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos salvar o container."));
        return id;
      }
      const { data, error } = await supabase.from("tracking_containers").insert(input).select("id").single();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos criar o container."));
      return (data as { id: string }).id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
