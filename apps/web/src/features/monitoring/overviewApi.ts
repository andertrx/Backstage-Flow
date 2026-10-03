import { useQuery } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { AlertSeverity } from "./api.ts";

/** Etapa 37.6 — resumo dos alertas abertos (Visão geral, dashboard, ficha do cliente, Meta/Google) e histórico. */

/** Uma plataforma do catálogo (`PLATFORM_IDS`); o banco recusa as que o monitoramento ainda não cobre. */
export type MonitorPlatform = string;
type BySeverity = Record<AlertSeverity, number>;

export interface MonitorSummary {
  open: BySeverity;
  ignored: number;
  new: number;
  unassigned: number;
  mine: number;
  by_client: ({ client_id: string; client_name: string; unassigned: number } & BySeverity)[];
  top: {
    id: number;
    severity: AlertSeverity;
    status: string;
    metric: string;
    kind: string;
    variation_pct: number | null;
    client_name: string;
    platform_id: string;
    entity_name: string | null;
    level: string;
    last_detected_at: string;
    assignee_name: string | null;
  }[];
  last_run_at: string | null;
}

export interface MonitorHistory {
  from: string;
  to: string;
  days: { day: string; created: number; resolved: number }[];
  created: number;
  created_by_severity: BySeverity;
  still_open: number;
  recurrences: number;
  resolved: number;
  resolved_manual: number;
  resolved_auto: number;
  resolved_inactive: number;
  median_hours: number | null;
  followups: { melhorou: number; piorou: number; igual: number; sem_dados: number };
  by_metric: { metric: string; created: number }[];
}

const KEY = ["monitoring", "overview"] as const;

/** `objectives` = filtro de objetivo do Monitoramento; sem ele (faixa do dashboard, ficha do cliente), mostra tudo. */
export function useMonitorSummary(clientId: string | null = null, platform: MonitorPlatform | null = null, enabled = true, objectives?: readonly string[]) {
  return useQuery({
    queryKey: [...KEY, "summary", clientId, platform, objectives ?? null],
    enabled,
    queryFn: async () => {
      const { data, error } = objectives
        ? await supabase.rpc("monitor_summary", { p_client: clientId, p_platform: platform, p_objectives: [...objectives] })
        : await supabase.rpc("monitor_summary", { p_client: clientId, p_platform: platform });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o resumo do monitoramento."));
      return data as MonitorSummary;
    },
  });
}

export function useMonitorHistory(days: number, clientId: string | null, platform: MonitorPlatform | null, objectives: readonly string[]) {
  return useQuery({
    queryKey: [...KEY, "history", days, clientId, platform, objectives],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_history", { p_days: days, p_client: clientId, p_platform: platform, p_objectives: [...objectives] });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o histórico do monitoramento."));
      const h = data as MonitorHistory;
      return { ...h, median_hours: h.median_hours == null ? null : Number(h.median_hours) };
    },
  });
}
