import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BadDirection, MonitorMetric, ScopeLevel } from "@backstage/shared";
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
