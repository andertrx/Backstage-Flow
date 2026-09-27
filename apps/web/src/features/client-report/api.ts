import { type ClientReportSettings, type DateRange, type ReportTotals, toReportTotals } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntityStatus } from "@backstage/shared";
import { FriendlyError, friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

export interface ReportAccount {
  ad_account_id: string;
  platform_id: string;
  name: string;
  external_id: string;
  currency: string;
  cur: ReportTotals | null;
  prev: ReportTotals | null;
  prev_from: string;
  prev_to: string;
  last_synced_at: string | null;
}

export interface ReportDailyRow {
  ad_account_id: string;
  date: string;
  spend_micros: number | null;
  impressions: number | null;
  clicks: number | null;
  link_clicks: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  actions: Record<string, number> | null;
}

export interface ReportCampaignRow extends Omit<ReportDailyRow, "date"> {
  campaign_id: string;
  name: string;
  status: EntityStatus;
  objective: string | null;
}

const num = (v: unknown) => (v == null ? null : Number(v));
const NUMERIC = ["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"] as const;
export const numericRow = <T,>(row: Record<string, unknown>): T => {
  const out: Record<string, unknown> = { ...row };
  for (const k of NUMERIC) out[k] = num(row[k]);
  out.actions = row.actions && typeof row.actions === "object"
    ? Object.fromEntries(Object.entries(row.actions as Record<string, unknown>).map(([k, v]) => [k, Number(v)]))
    : null;
  return out as T;
};

export const toReportAccount = (r: Record<string, unknown>) => ({
  ...r,
  cur: toReportTotals(r.cur as Record<string, unknown> | null),
  prev: toReportTotals(r.prev as Record<string, unknown> | null),
}) as ReportAccount;

const args = (clientId: string, range: DateRange) => ({ p_client_id: clientId, p_from: range.from, p_to: range.to });

/** Por conta de anúncio: totais do período e do período anterior (mesmo tamanho). */
export function useReportAccounts(clientId: string | undefined, range: DateRange, enabled = true) {
  return useQuery({
    queryKey: ["client-report", "accounts", clientId, range],
    enabled: Boolean(clientId) && enabled,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_report_accounts", args(clientId!, range));
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os números do cliente."));
      return (data as Record<string, unknown>[]).map(toReportAccount);
    },
  });
}

export function useReportDaily(clientId: string | undefined, range: DateRange) {
  return useQuery({
    queryKey: ["client-report", "daily", clientId, range],
    enabled: Boolean(clientId),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_report_daily", args(clientId!, range));
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o dia a dia."));
      return (data as Record<string, unknown>[]).map((r) => numericRow<ReportDailyRow>(r));
    },
  });
}

export function useReportCampaigns(clientId: string | undefined, range: DateRange) {
  return useQuery({
    queryKey: ["client-report", "campaigns", clientId, range],
    enabled: Boolean(clientId),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_report_campaigns", args(clientId!, range));
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as campanhas."));
      return (data as Record<string, unknown>[]).map((r) => numericRow<ReportCampaignRow>(r));
    },
  });
}

/** Modelo salvo do cliente (null = ainda não tem; a tela usa o padrão). */
export function useReportSettings(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-report", "settings", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.from("client_report_settings").select("*").eq("client_id", clientId!).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o modelo do relatório."));
      return data as (Partial<ClientReportSettings> & { updated_at?: string }) | null;
    },
  });
}

export function useSaveReportSettings(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (s: ClientReportSettings) => {
      const { data: auth } = await supabase.auth.getUser();
      const row = {
        client_id: clientId,
        title: s.title.trim(),
        subtitle: s.subtitle?.trim() || null,
        main_result: s.main_result.source === "action"
          ? { source: "action", label: s.main_result.label.trim(), action_type: s.main_result.action_type }
          : { source: s.main_result.source, label: s.main_result.label.trim() },
        kpis: s.kpis,
        sections: s.sections,
        default_period: s.default_period,
        agency_notes: s.agency_notes?.trim() || null,
        next_steps: s.next_steps?.trim() || null,
        updated_by: auth.user?.id ?? null,
      };
      const { error } = await supabase.from("client_report_settings").upsert(row, { onConflict: "client_id" });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos salvar o modelo do relatório."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-report", "settings", clientId] }),
  });
}

// ---------------------------------------------------------------------------
// Etapa 19.2 — acesso do cliente (login e link secreto)
// ---------------------------------------------------------------------------

export interface ClientPortal {
  client_id: string;
  login_enabled: boolean;
  link_enabled: boolean;
  link_created_at: string | null;
  link_expires_at: string | null;
  link_last_used_at: string | null;
  link_uses: number;
}

const PORTAL_COLUMNS = "client_id,login_enabled,link_enabled,link_created_at,link_expires_at,link_last_used_at,link_uses";

/** Como está o acesso do cliente (sem linha = tudo desligado). */
export function useClientPortal(clientId: string) {
  return useQuery({
    queryKey: ["client-portal", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_portal").select(PORTAL_COLUMNS).eq("client_id", clientId).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o acesso do cliente."));
      return (data as ClientPortal | null) ?? {
        client_id: clientId, login_enabled: false, link_enabled: false, link_created_at: null, link_expires_at: null, link_last_used_at: null, link_uses: 0,
      };
    },
  });
}

/** Liga/desliga o login ou o link (null = não mexe). */
export function useSetClientPortal(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { login?: boolean; link?: boolean }) => {
      const { error } = await supabase.rpc("client_portal_set", {
        p_client_id: clientId, p_login_enabled: v.login ?? null, p_link_enabled: v.link ?? null,
      });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos mudar o acesso do cliente."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-portal", clientId] }),
  });
}

/** Gera um código novo (o antigo para na hora). Devolve o código uma única vez. */
export function useNewClientLink(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (validDays: number | null) => {
      const { data, error } = await supabase.rpc("client_portal_new_link", { p_client_id: clientId, p_valid_days: validDays });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos gerar o link."));
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-portal", clientId] }),
  });
}

export interface PublicReport {
  client: { name: string; timezone: string };
  settings: Partial<ClientReportSettings> | null;
  period: string;
  from: string;
  to: string;
  today: string;
  accounts: ReportAccount[];
  daily: ReportDailyRow[];
  campaigns: ReportCampaignRow[];
}

export type PublicQuery = { period?: string; from?: string; to?: string };

/** Dashboard pelo link secreto (sem login), pela Edge Function client-report-link. */
export function usePublicReport(token: string | undefined, q: PublicQuery) {
  return useQuery({
    queryKey: ["public-report", token, q],
    enabled: Boolean(token),
    placeholderData: (prev) => prev,
    retry: false,
    queryFn: async () => {
      // Pelo servidor (Edge Function): o navegador não chama o banco direto.
      const { data, error } = await supabase.functions.invoke("client-report-link", {
        body: { token, ...(q.period ? { period: q.period } : {}), ...(q.from ? { from: q.from, to: q.to } : {}) },
      });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      const d = data as Record<string, unknown>;
      return {
        ...d,
        accounts: ((d.accounts as Record<string, unknown>[]) ?? []).map(toReportAccount),
        daily: ((d.daily as Record<string, unknown>[]) ?? []).map((r) => numericRow<ReportDailyRow>(r)),
        campaigns: ((d.campaigns as Record<string, unknown>[]) ?? []).map((r) => numericRow<ReportCampaignRow>(r)),
      } as PublicReport;
    },
  });
}
