import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BadDirection, CompareLevel, Coverage, DateRange, MonitorMetric, MonitorTotals, ScopeLevel } from "@backstage/shared";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

/** Uma regra de limite (public.monitor_rules_list). */
export interface MonitorRuleRow {
  id: string;
  scope: ScopeLevel;
  scope_id: string | null;
  scope_name: string | null;
  client_id: string | null;
  client_name: string | null;
  metric: MonitorMetric;
  direction: BadDirection;
  attention_pct: number;
  critical_pct: number;
  min_volume: number | null;
  active: boolean;
  note: string | null;
  replaces_id: string | null;
  archived_at: string | null;
  created_at: string;
  created_by_name: string | null;
}

const KEY = ["monitoring"] as const;

/**
 * Nossas funções do banco explicam o problema em português: 22023 (dado recusado) e
 * 40001 (outra pessoa alterou antes). Mostra essa explicação; o resto vira mensagem amigável.
 */
const monitorError = (error: { code?: string; message?: string }, fallback: string) =>
  (error.code === "22023" || error.code === "40001") && error.message ? error.message : friendlyDbError(error, fallback);

export function useMonitorRules(includeHistory = false) {
  return useQuery({
    queryKey: [...KEY, "rules", includeHistory],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_rules_list", { p_include_history: includeHistory });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as regras do monitoramento."));
      return ((data ?? []) as MonitorRuleRow[]).map((r) => ({ ...r, attention_pct: Number(r.attention_pct), critical_pct: Number(r.critical_pct) }));
    },
  });
}

export interface SaveRuleInput {
  replacesId: string | null;
  scope: ScopeLevel;
  scopeId: string | null;
  metric: MonitorMetric;
  direction: BadDirection;
  attention: number;
  critical: number;
  minVolume: number | null;
  active: boolean;
  note: string | null;
}

export function useSaveMonitorRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: SaveRuleInput) => {
      const { data, error } = await supabase.rpc("monitor_rule_save", {
        p_replaces_id: r.replacesId,
        p_scope: r.scope,
        p_scope_id: r.scopeId,
        p_metric: r.metric,
        p_direction: r.direction,
        p_attention: r.attention,
        p_critical: r.critical,
        p_min_volume: r.minVolume,
        p_active: r.active,
        p_note: r.note,
      });
      if (error) throw new FriendlyError(monitorError(error, "Não conseguimos salvar a regra."));
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useArchiveMonitorRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("monitor_rule_archive", { p_id: id });
      if (error) throw new FriendlyError(monitorError(error, "Não conseguimos remover a regra."));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface ScopeOption {
  id: string;
  name: string;
}

/** Contas, campanhas ou anúncios para escolher onde a regra vale (o RLS limita aos clientes visíveis). */
export function useScopeOptions(kind: "account" | "campaign" | "ad", parentId: string | null) {
  return useQuery({
    queryKey: [...KEY, "scope", kind, parentId],
    enabled: !!parentId,
    queryFn: async () => {
      const q =
        kind === "account"
          ? supabase.from("ad_accounts").select("id, name").eq("client_id", parentId!)
          : kind === "campaign"
            ? supabase.from("campaigns").select("id, name").eq("ad_account_id", parentId!)
            : supabase.from("ads").select("id, name").eq("campaign_id", parentId!);
      const { data, error } = await q.order("name").limit(500);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as opções."));
      return (data ?? []) as ScopeOption[];
    },
  });
}

// ---------------------------------------------------------------- comparação (37.2)

/** Uma linha de public.monitor_compare: a entidade e os totais dos dois períodos (na moeda da conta). */
export interface CompareRow {
  entity_key: string;
  level: CompareLevel;
  entity_id: string | null;
  name: string | null;
  status: string | null;
  client_id: string;
  client_name: string;
  platform_id: string;
  ad_account_id: string;
  account_name: string;
  currency: string;
  timezone: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  objective: string | null;
  ad_group_id: string | null;
  ad_group_name: string | null;
  thumbnail_url: string | null;
  creative_type: string | null;
  creative_external_id: string | null;
  preview_link: string | null;
  ads_count: number | null;
  first_seen_at: string | null;
  current: MonitorTotals;
  previous: MonitorTotals;
  cur_days: number;
  prev_days: number;
  coverage: Coverage;
  sync_status: string | null;
  last_success_at: string | null;
}

const num = (v: unknown) => (v == null ? null : Number(v));
const totals = (r: Record<string, unknown>, p: "cur" | "prev"): MonitorTotals => ({
  spend_micros: num(r[`${p}_spend_micros`]),
  impressions: num(r[`${p}_impressions`]),
  reach: null,
  clicks: num(r[`${p}_clicks`]),
  link_clicks: num(r[`${p}_link_clicks`]),
  leads: num(r[`${p}_leads`]),
  messages: num(r[`${p}_messages`]),
  conversions: num(r[`${p}_conversions`]),
  conversion_value_micros: num(r[`${p}_conversion_value_micros`]),
});

export interface CompareParams {
  level: CompareLevel;
  current: DateRange;
  previous: DateRange;
  clientId: string | null;
  platform: string | null;
  campaignId: string | null;
}

export function useMonitorCompare(p: CompareParams) {
  return useQuery({
    queryKey: [...KEY, "compare", p],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_compare", {
        p_level: p.level,
        p_from: p.current.from,
        p_to: p.current.to,
        p_prev_from: p.previous.from,
        p_prev_to: p.previous.to,
        p_client_id: p.clientId,
        p_platform: p.platform,
        p_campaign_id: p.campaignId,
        p_limit: 500,
      });
      if (error) throw new FriendlyError(monitorError(error, "Não conseguimos carregar a comparação."));
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...(r as unknown as CompareRow),
        ads_count: num(r.ads_count),
        cur_days: Number(r.cur_days ?? 0),
        prev_days: Number(r.prev_days ?? 0),
        current: totals(r, "cur"),
        previous: totals(r, "prev"),
      })) as CompareRow[];
    },
  });
}

export interface DailyRow {
  date: string;
  totals: MonitorTotals;
}

export function useMonitorDaily(level: CompareLevel, key: string | null, range: DateRange | null) {
  return useQuery({
    queryKey: [...KEY, "daily", level, key, range],
    enabled: !!key && !!range,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_daily", { p_level: level, p_key: key, p_from: range!.from, p_to: range!.to });
      if (error) throw new FriendlyError(monitorError(error, "Não conseguimos carregar a série diária."));
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        date: String(r.date),
        totals: {
          spend_micros: num(r.spend_micros), impressions: num(r.impressions), reach: null, clicks: num(r.clicks), link_clicks: num(r.link_clicks),
          leads: num(r.leads), messages: num(r.messages), conversions: num(r.conversions), conversion_value_micros: num(r.conversion_value_micros),
        },
      })) as DailyRow[];
    },
  });
}

// ---------------------------------------------------------------- motor de alertas (37.3)

export type AlertKind = "limite" | "anomalia" | "sem_resultados";
export type AlertSeverity = "critico" | "atencao" | "informativo";

/** Uma mudança registrada na campanha/anúncio durante o período (status ou orçamento). */
export interface AlertContextChange {
  field: string;
  level: string;
  old: unknown;
  new: unknown;
  at: string;
}

/** Um alerta de desempenho (public.monitor_alerts_list). Valores na moeda da conta. */
export interface MonitorAlertRow {
  id: number;
  kind: AlertKind;
  level: "campaign" | "ad";
  metric: string;
  severity: AlertSeverity;
  status: string;
  client_id: string;
  client_name: string;
  platform_id: string;
  ad_account_id: string;
  account_name: string;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  thumbnail_url: string | null;
  currency: string;
  current_value: number | null;
  previous_value: number | null;
  variation_pct: number | null;
  period_from: string;
  period_to: string;
  prev_from: string | null;
  prev_to: string | null;
  attention_pct: number | null;
  critical_pct: number | null;
  explanation: string;
  context: AlertContextChange[];
  details: Record<string, unknown>;
  detections: number;
  first_detected_at: string;
  last_detected_at: string;
  recurrence_of: number | null;
  recurrence_count: number;
  resolved_at: string | null;
  resolution: "automatica" | "manual" | null;
}

export function useMonitorAlerts(open: boolean) {
  return useQuery({
    queryKey: [...KEY, "alerts", open],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_alerts_list", { p_open: open, p_limit: 500 });
      if (error) throw new FriendlyError(monitorError(error, "Não conseguimos carregar os alertas de desempenho."));
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...(r as unknown as MonitorAlertRow),
        id: Number(r.id),
        current_value: num(r.current_value),
        previous_value: num(r.previous_value),
        variation_pct: num(r.variation_pct),
        attention_pct: num(r.attention_pct),
        critical_pct: num(r.critical_pct),
        detections: Number(r.detections ?? 1),
        recurrence_count: Number(r.recurrence_count ?? 0),
        context: Array.isArray(r.context) ? (r.context as AlertContextChange[]) : [],
        details: (r.details ?? {}) as Record<string, unknown>,
      })) as MonitorAlertRow[];
    },
  });
}

/** Situação do motor (public.monitor_status). */
export interface MonitorStatus {
  enabled: boolean;
  eval_interval_minutes: number;
  stale_hours: number;
  last_run: {
    started_at: string;
    finished_at: string | null;
    trigger: "agendada" | "manual";
    evaluated: number;
    skipped: number;
    created: number;
    updated: number;
    resolved: number;
    error: string | null;
  } | null;
  last_evaluated_at: string | null;
  next_run_at: string | null;
  open: { critico: number; atencao: number; informativo: number };
}

export function useMonitorStatus() {
  return useQuery({
    queryKey: [...KEY, "status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_status");
      if (error) throw new FriendlyError(monitorError(error, "Não conseguimos carregar a situação do monitoramento."));
      return data as MonitorStatus;
    },
  });
}

export function useEvaluateNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("monitor_evaluate_now");
      if (error) throw new FriendlyError(monitorError(error, "Não conseguimos avaliar agora."));
      const r = (data ?? {}) as { error?: string | null; evaluated?: number; created?: number; updated?: number; resolved?: number };
      if (r.error) throw new FriendlyError("A avaliação parou por um erro e foi registrada. Nenhum alerta foi alterado.");
      return r;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSaveMonitorSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { enabled: boolean; interval: number; staleHours: number }) => {
      const { error } = await supabase.rpc("monitor_settings_save", { p_enabled: s.enabled, p_interval: s.interval, p_stale_hours: s.staleHours });
      if (error) throw new FriendlyError(monitorError(error, "Não conseguimos salvar a configuração."));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
