import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, Evidence } from "@backstage/shared";
import { FriendlyError, friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
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

// -----------------------------------------------------------------------------
// Meta CAPI (34.3)
// -----------------------------------------------------------------------------

export interface Destination {
  id: string;
  container_id: string;
  pixel_id: string;
  has_token: boolean;
  enabled: boolean;
  test_event_code: string | null;
  send_events: string[];
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
}

export interface CapiOverview {
  destination_id: string;
  pending: number;
  sent_24h: number;
  errors_24h: number;
  discarded_24h: number;
  last_sent_at: string | null;
}

export interface CapiLogRow {
  id: number;
  requested_at: string;
  kind: "envio" | "teste";
  events_count: number;
  test: boolean;
  http_status: number | null;
  events_received: number | null;
  error_message: string | null;
}

/** Configuração do Meta de cada site. O token nunca vem: só "tem token". */
export function useDestinations(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "destinations"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_destinations")
        .select("id, container_id, pixel_id, has_token, enabled, test_event_code, send_events, last_success_at, last_error_at, last_error_message");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a configuração do Meta."));
      return data as Destination[];
    },
  });
}

export function useCapiOverview(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "capi-overview"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tracking_capi_overview");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o envio ao Meta."));
      return (data ?? []) as CapiOverview[];
    },
  });
}

export function useCapiLog(destinationId: string | null) {
  return useQuery({
    queryKey: [...KEY, "capi-log", destinationId],
    enabled: destinationId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_capi_log")
        .select("id, requested_at, kind, events_count, test, http_status, events_received, error_message")
        .eq("destination_id", destinationId!)
        .order("requested_at", { ascending: false })
        .limit(10);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o registro de envios."));
      return data as CapiLogRow[];
    },
  });
}

export type DestinationAction =
  | { action: "save"; containerId: string; pixelId: string; token?: string; testEventCode: string | null; sendEvents: string[]; enabled: boolean }
  | { action: "remove_token"; containerId: string }
  | { action: "test"; containerId: string };

/** Tudo que mexe no token passa pelo servidor (Edge Function tracking-destinations). */
export function useDestinationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: DestinationAction) => {
      const { data, error } = await supabase.functions.invoke("tracking-destinations", { body });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: Record<string, unknown> }).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

// -----------------------------------------------------------------------------
// WhatsApp (34.5-W): cliques com código de rastreio
// -----------------------------------------------------------------------------

export interface WhatsAppClick {
  id: number;
  container_id: string;
  code: string;
  clicked_at: string;
  status: "clicado" | "lead" | "venda";
  sales: number;
  test: boolean;
  touch: { channel: Channel; evidence: Evidence; utm_campaign: string | null; ad_campaign_id: string | null } | null;
}

export interface WhatsAppLookup {
  id: number;
  code: string;
  container_id: string;
  container_name: string;
  clicked_at: string;
  page_url: string | null;
  status: "clicado" | "lead" | "venda";
  sales: number;
  test: boolean;
  channel: Channel | null;
  paid: boolean | null;
  evidence: Evidence | null;
  reason: string | null;
  campaign: string | null;
}

export function useWhatsAppClicks(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "whatsapp"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_whatsapp_clicks")
        .select("id, container_id, code, clicked_at, status, sales, test, touch:tracking_touchpoints!tracking_whatsapp_clicks_touchpoint_id_fkey(channel, evidence, utm_campaign, ad_campaign_id)")
        .order("clicked_at", { ascending: false })
        .limit(50);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os cliques no WhatsApp."));
      return data as unknown as WhatsAppClick[];
    },
  });
}

export function useWhatsAppLookup(code: string | null) {
  return useQuery({
    queryKey: [...KEY, "whatsapp-lookup", code],
    enabled: code != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tracking_whatsapp_lookup", { p_code: code });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos buscar o código."));
      return ((data ?? []) as WhatsAppLookup[])[0] ?? null;
    },
  });
}

export interface WhatsAppMark {
  action: "mark";
  /** App comum: código da mensagem. API oficial: id da conversa. Um OU outro. */
  code?: string;
  conversationId?: number;
  kind: "lead" | "venda";
  value?: number;
  currency?: string;
  orderId?: string;
  /** Contato do cliente já cifrado aqui na tela (SHA-256). */
  ud?: { em?: string; ph?: string; fn?: string; ln?: string };
}

export function useWhatsAppMark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: WhatsAppMark) => {
      const { data, error } = await supabase.functions.invoke("tracking-whatsapp", { body });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: { status: "ok" | "ja_marcado" } }).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

// -----------------------------------------------------------------------------
// WhatsApp pela API oficial (34.5-W2): conexão por site e conversas recebidas
// -----------------------------------------------------------------------------

export interface WhatsAppConnection {
  id: string;
  container_id: string;
  phone_number_id: string;
  waba_id: string;
  has_app_secret: boolean;
  enabled: boolean;
  last_webhook_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
}

export function useWhatsAppConnections(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "whatsapp-connections"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_whatsapp_connections")
        .select("id, container_id, phone_number_id, waba_id, has_app_secret, enabled, last_webhook_at, last_error_at, last_error_message");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as conexões do WhatsApp."));
      return data as WhatsAppConnection[];
    },
  });
}

export interface WhatsAppConversation {
  id: number;
  container_id: string;
  origin: "anuncio_whatsapp" | "site" | "desconhecida";
  ad_id: string | null;
  click_code: string | null;
  first_message_at: string;
  last_message_at: string;
  messages: number;
  status: "conversa" | "lead" | "venda";
  sales: number;
  test: boolean;
  touch: { channel: Channel; evidence: Evidence; utm_campaign: string | null } | null;
}

export function useWhatsAppConversations(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "whatsapp-conversations"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_whatsapp_conversations")
        .select("id, container_id, origin, ad_id, click_code, first_message_at, last_message_at, messages, status, sales, test, touch:tracking_touchpoints!tracking_whatsapp_conversations_touchpoint_id_fkey(channel, evidence, utm_campaign)")
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as conversas do WhatsApp."));
      return data as unknown as WhatsAppConversation[];
    },
  });
}

export type WhatsAppConnectionAction =
  | { action: "connection_save"; containerId: string; phoneNumberId: string; wabaId: string; appSecret?: string; enabled: boolean }
  | { action: "connection_reveal"; containerId: string }
  | { action: "connection_remove"; containerId: string };

/** Segredo do app e token de verificação só passam pelo servidor (Edge Function tracking-whatsapp → Vault). */
export function useWhatsAppConnectionAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: WhatsAppConnectionAction) => {
      const { data, error } = await supabase.functions.invoke("tracking-whatsapp", { body });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return (data as { data: { webhookUrl?: string; verifyToken?: string | null; removed?: boolean } }).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
