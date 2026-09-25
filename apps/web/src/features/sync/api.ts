import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

/** Uma conta vinculada com o estado da sincronização e o último resultado. */
export interface SyncOverviewRow {
  ad_account_id: string;
  client_id: string;
  client_name: string;
  platform_id: string;
  external_id: string;
  name: string;
  is_test_account: boolean;
  has_connection: boolean;
  status: "pendente" | "executando" | "sucesso" | "erro";
  last_attempt_at: string | null;
  last_success_at: string | null;
  next_run_at: string | null;
  last_error_message: string | null;
  running: boolean;
  run_status: "executando" | "sucesso" | "erro" | null;
  run_started_at: string | null;
  run_finished_at: string | null;
  run_duration_ms: number | null;
  run_records: number | null;
  run_trigger: "agendada" | "manual" | "historico" | null;
  run_error: string | null;
}

/** Uma linha do log de sincronização. */
export interface SyncRunRow {
  id: number;
  ad_account_id: string;
  client_id: string;
  platform_id: string;
  trigger: "agendada" | "manual" | "historico";
  status: "executando" | "sucesso" | "erro";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  records_updated: number;
  error_message: string | null;
  ad_accounts: { name: string; external_id: string } | null;
  clients: { name: string } | null;
}

export interface SyncRunResult {
  results: { adAccountId: string; status: "sucesso" | "erro"; records: number; durationMs: number; error: string | null }[];
  queued: number;
  alreadyRunning?: number;
}

const SYNC_KEY = ["sync"] as const;
const RUN_COLUMNS =
  "id, ad_account_id, client_id, platform_id, trigger, status, started_at, finished_at, duration_ms, records_updated, error_message, " +
  "ad_accounts(name, external_id), clients(name)";

/** Enquanto alguma conta estiver sincronizando, atualiza a tela a cada 10 s. */
const refetchWhileRunning = (running: boolean) => (running ? 10_000 : 60_000);

export function useSyncOverview() {
  return useQuery({
    queryKey: [...SYNC_KEY, "overview"],
    refetchInterval: (q) => refetchWhileRunning((q.state.data ?? []).some((r) => r.running)),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sync_overview");
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar a sincronização."));
      return (data ?? []) as SyncOverviewRow[];
    },
  });
}

export function useSyncRuns(limit = 50) {
  return useQuery({
    queryKey: [...SYNC_KEY, "runs", limit],
    refetchInterval: (q) => refetchWhileRunning((q.state.data ?? []).some((r) => r.status === "executando")),
    queryFn: async () => {
      const { data, error } = await supabase.from("sync_runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(limit);
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar o histórico de sincronizações."));
      return data as unknown as SyncRunRow[];
    },
  });
}

/** "Sincronizar agora": sem ids = todas as contas que o usuário enxerga. */
export function useRunSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adAccountIds?: string[]) => {
      const body = adAccountIds?.length ? { action: "run", adAccountIds } : { action: "run" };
      const { data, error } = await supabase.functions.invoke("sync", { body });
      if (error) throw new Error(await friendlyFunctionError(error));
      return (data as { data: SyncRunResult }).data;
    },
    onSettled: () => qc.invalidateQueries(),
  });
}
