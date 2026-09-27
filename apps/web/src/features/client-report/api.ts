import { type ClientReportSettings, type DateRange, type ReportTotals, toReportTotals } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntityStatus } from "@backstage/shared";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
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
const numericRow = <T,>(row: Record<string, unknown>): T => {
  const out: Record<string, unknown> = { ...row };
  for (const k of NUMERIC) out[k] = num(row[k]);
  out.actions = row.actions && typeof row.actions === "object"
    ? Object.fromEntries(Object.entries(row.actions as Record<string, unknown>).map(([k, v]) => [k, Number(v)]))
    : null;
  return out as T;
};

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
      return (data as Record<string, unknown>[]).map((r) => ({
        ...r,
        cur: toReportTotals(r.cur as Record<string, unknown> | null),
        prev: toReportTotals(r.prev as Record<string, unknown> | null),
      })) as ReportAccount[];
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
