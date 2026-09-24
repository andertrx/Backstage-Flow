import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AlertSeverity, AlertStatus, AlertType } from "@backstage/shared";
import { friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

/** Um alerta, com os nomes do cliente, da conta e da campanha. */
export interface AlertRow {
  id: number;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  client_id: string;
  platform_id: string | null;
  ad_account_id: string | null;
  campaign_id: string | null;
  description: string;
  recommended_action: string | null;
  first_seen_at: string;
  last_seen_at: string;
  seen_at: string | null;
  resolved_at: string | null;
  resolution: "automatica" | "manual" | null;
  clients: { name: string } | null;
  ad_accounts: { name: string; external_id: string } | null;
  campaigns: { name: string } | null;
}

export type AlertSituation = "abertos" | "resolvidos" | "todos";

const ALERTS_KEY = ["alerts"] as const;
const COLUMNS =
  "id, type, severity, status, client_id, platform_id, ad_account_id, campaign_id, description, recommended_action, " +
  "first_seen_at, last_seen_at, seen_at, resolved_at, resolution, clients(name), ad_accounts(name, external_id), campaigns(name)";

/** Alertas que o usuário pode ver (o RLS decide), mais recentes primeiro. */
export function useAlerts(situation: AlertSituation) {
  return useQuery({
    queryKey: [...ALERTS_KEY, "list", situation],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let query = supabase.from("alerts").select(COLUMNS).order("first_seen_at", { ascending: false }).limit(500);
      if (situation === "abertos") query = query.in("status", ["aberto", "visto"]);
      if (situation === "resolvidos") query = query.eq("status", "resolvido");
      const { data, error } = await query;
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar os alertas."));
      return data as unknown as AlertRow[];
    },
  });
}

/** Quantos alertas ainda não foram vistos (número no menu). */
export function useUnseenAlertsCount(enabled: boolean) {
  return useQuery({
    queryKey: [...ALERTS_KEY, "unseen"],
    enabled,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("alerts").select("id").eq("status", "aberto").limit(1000);
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos contar os alertas."));
      return data.length;
    },
  });
}

export interface RefreshAlertsResult {
  created: number;
  updated: number;
  resolved: number;
  checked_at: string;
}

/** "Verificar agora": roda as regras no banco na hora. */
export function useRefreshAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("refresh_alerts");
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos verificar os alertas."));
      return data as RefreshAlertsResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ALERTS_KEY }),
  });
}

export function useSetAlertStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: AlertStatus }) => {
      const { error } = await supabase.rpc("set_alert_status", { p_id: id, p_status: status });
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos atualizar o alerta."));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ALERTS_KEY }),
  });
}
