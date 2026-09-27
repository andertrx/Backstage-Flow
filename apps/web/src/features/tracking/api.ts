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

export interface TouchSummary {
  channel: Channel;
  evidence: Evidence;
  paid: boolean | null;
  utm_campaign: string | null;
  ad_campaign_id: string | null;
}

export interface LeadRow {
  id: number;
  container_id: string;
  first_event_name: string;
  first_converted_at: string;
  last_converted_at: string;
  conversions: number;
  purchases: number;
  test: boolean;
  /** Só "tem ou não tem": o hash nunca aparece na tela. */
  has_email: boolean;
  has_phone: boolean;
  first_touch: TouchSummary | null;
  last_touch: TouchSummary | null;
}

const TOUCH_COLS = "channel, evidence, paid, utm_campaign, ad_campaign_id";

/** Últimos leads (quem converteu), com a primeira e a última origem. */
export function useRecentLeads(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "leads"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_leads")
        .select(
          `id, container_id, first_event_name, first_converted_at, last_converted_at, conversions, purchases, test, em_hash, ph_hash, ` +
            `first_touch:tracking_touchpoints!tracking_leads_first_touch_id_fkey(${TOUCH_COLS}), ` +
            `last_touch:tracking_touchpoints!tracking_leads_last_touch_id_fkey(${TOUCH_COLS})`,
        )
        .order("last_converted_at", { ascending: false })
        .limit(50);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os leads."));
      return (data as unknown as (Omit<LeadRow, "has_email" | "has_phone"> & { em_hash: string | null; ph_hash: string | null })[]).map(
        ({ em_hash, ph_hash, ...rest }) => ({ ...rest, has_email: em_hash != null, has_phone: ph_hash != null }),
      );
    },
  });
}

export interface JourneyItem {
  kind: "origem" | "evento" | "compra";
  occurred_at: string;
  name: string | null;
  channel: Channel | null;
  paid: boolean | null;
  evidence: Evidence | null;
  reason: string | null;
  campaign: string | null;
  page_path: string | null;
  value_micros: number | null;
  currency: string | null;
  transaction_id: string | null;
  visitor_id: string;
  test: boolean;
}

export function useLeadJourney(leadId: number | null) {
  return useQuery({
    queryKey: [...KEY, "journey", leadId],
    enabled: leadId != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tracking_lead_journey", { p_lead_id: leadId });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a jornada."));
      return (data ?? []) as JourneyItem[];
    },
  });
}

export interface ConversionRow {
  container_id: string;
  currency: string | null;
  leads: number;
  conversions: number;
  purchases: number;
  revenue_micros: number;
}

export function useConversionsSummary(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "conversions", from.slice(0, 13), to.slice(0, 13)],
    enabled,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tracking_conversions_summary", { p_from: from, p_to: to });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as conversões."));
      return ((data ?? []) as ConversionRow[]).map((r) => ({ ...r, revenue_micros: Number(r.revenue_micros) }));
    },
  });
}
