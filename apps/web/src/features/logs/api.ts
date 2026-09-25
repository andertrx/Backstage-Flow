import type { AuditCategory } from "@backstage/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SyncRunRow } from "@/features/sync/api.ts";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

export const PAGE_SIZE = 100;

/** Uma linha da auditoria (quem fez o quê), já com nomes. */
export interface AuditRow {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  details: Record<string, unknown>;
}

export interface AuditFilters {
  from: string | null;
  actor: string | null;
  category: AuditCategory | null;
}

/** Auditoria (só o administrador recebe linhas). "Carregar mais" continua do último id. */
export function useAuditLog(filters: AuditFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["logs", "audit", filters],
    enabled,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("audit_log_list", {
        p_from: filters.from,
        p_actor: filters.actor,
        p_category: filters.category,
        p_before_id: pageParam,
        p_limit: PAGE_SIZE,
      });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os registros."));
      return (data ?? []) as AuditRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].id : undefined),
  });
}

export interface SyncLogFilters {
  from: string | null;
  status: "sucesso" | "erro" | null;
  clientId: string | null;
}

const RUN_COLUMNS =
  "id, ad_account_id, client_id, platform_id, trigger, status, started_at, finished_at, duration_ms, records_updated, error_message, " +
  "ad_accounts(name, external_id), clients(name)";

/** Histórico de sincronizações com filtros (o RLS limita aos clientes liberados). */
export function useSyncLog(filters: SyncLogFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["logs", "sync", filters],
    enabled,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase.from("sync_runs").select(RUN_COLUMNS).order("id", { ascending: false }).limit(PAGE_SIZE);
      if (filters.from) query = query.gte("started_at", filters.from);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.clientId) query = query.eq("client_id", filters.clientId);
      if (pageParam) query = query.lt("id", pageParam);
      const { data, error } = await query;
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o histórico de sincronizações."));
      return data as unknown as SyncRunRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].id : undefined),
  });
}

/** Um erro técnico (Etapa 25): o que a pessoa viu e o detalhe para análise. */
export interface ErrorLogRow {
  id: number;
  occurred_at: string;
  source: string;
  code: string;
  user_message: string | null;
  technical: string | null;
  context: Record<string, string>;
  user_id: string | null;
  user_name: string | null;
  ad_account_id: string | null;
  account_name: string | null;
  client_id: string | null;
  client_name: string | null;
}

export interface ErrorLogFilters {
  from: string | null;
  source: string | null;
}

/** Erros técnicos (só o administrador recebe linhas). */
export function useErrorLog(filters: ErrorLogFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["logs", "errors", filters],
    enabled,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("error_log_list", {
        p_from: filters.from,
        p_source: filters.source,
        p_before_id: pageParam,
        p_limit: PAGE_SIZE,
      });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os erros técnicos."));
      return (data ?? []) as ErrorLogRow[];
    },
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].id : undefined),
  });
}
