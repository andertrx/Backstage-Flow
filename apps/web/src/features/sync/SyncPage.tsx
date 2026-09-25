import { can, formatAccountId, PLATFORM_LABELS } from "@backstage/shared";
import { CloudOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { RUN_LABEL, RunsTable } from "./RunsTable.tsx";
import { type SyncOverviewRow, useRunSync, useSyncOverview, useSyncRuns } from "./api.ts";
import { type AccountSyncState, accountState, describeRun, formatDuration, formatNext, isScheduled, STATE_LABELS, summarize } from "./logic.ts";

const STATE_TONE: Record<AccountSyncState, "success" | "danger" | "brand" | "neutral" | "warning"> = {
  sucesso: "success",
  erro: "danger",
  executando: "brand",
  pendente: "neutral",
  sem_conexao: "warning",
  teste: "neutral",
};

const when = (iso: string | null) => (iso ? <span title={formatDateTime(iso)}>{formatRelative(iso)}</span> : "—");

export function SyncPage() {
  const { profile } = useAuth();
  const canRun = can(profile?.role, "sync.run");
  const canConfigure = can(profile?.role, "settings.manage");
  const overview = useSyncOverview();
  const runs = useSyncRuns();
  const run = useRunSync();
  const [message, setMessage] = useState<string | null>(null);
  const rows = overview.data ?? [];
  const s = summarize(rows);
  const runningAll = run.isPending && !run.variables;

  const start = (ids?: string[]) => {
    setMessage(null);
    run.mutate(ids, { onSuccess: (r) => setMessage(describeRun(r)) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sincronização</h1>
          <p className="mt-1 text-sm text-slate-500">
            Os dados das contas são buscados sozinhos, a cada 1 hora, nas APIs oficiais do Meta e do Google.
          </p>
        </div>
        {canRun && (
          <Button loading={runningAll} disabled={run.isPending || s.scheduled === 0} onClick={() => start()}>
            {!runningAll && <RefreshCw className="size-4" aria-hidden />} Sincronizar agora
          </Button>
        )}
      </div>

      {runningAll && (
        <Alert tone="info">Sincronizando todas as contas. Pode levar alguns minutos — não precisa ficar nesta tela.</Alert>
      )}
      {run.error && <Alert tone="error">{run.error.message}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      {overview.error && <Alert tone="error">{overview.error.message}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="sync-summary">
        <SummaryCard label="Última sincronização" testId="summary-last">
          {s.lastFinishedAt ? (
            <>
              <span className="block">{formatRelative(s.lastFinishedAt)}</span>
              <span className="text-xs font-normal text-slate-500">
                {formatDateTime(s.lastFinishedAt)}
                {s.lastStatus && ` · ${RUN_LABEL[s.lastStatus]}`}
              </span>
            </>
          ) : (
            "Ainda não houve"
          )}
        </SummaryCard>
        <SummaryCard label="Próxima sincronização" testId="summary-next">
          {s.running > 0 ? "Sincronizando agora…" : s.nextRunAt === undefined ? "Nenhuma conta para sincronizar" : formatNext(s.nextRunAt)}
        </SummaryCard>
        <SummaryCard label="Contas com sucesso" testId="summary-success">
          {s.success} <span className="text-sm font-normal text-slate-500">de {s.scheduled}</span>
        </SummaryCard>
        <SummaryCard label="Contas com erro" testId="summary-errors" danger={s.errors > 0}>
          {s.errors}
        </SummaryCard>
      </div>

      <section className="space-y-3" aria-labelledby="sync-accounts-title">
        <h2 id="sync-accounts-title" className="text-lg font-semibold">Contas</h2>
        {overview.isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
        ) : rows.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center" data-testid="sync-empty">
            <CloudOff className="size-8 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-900">Nenhuma conta de anúncio vinculada ainda.</p>
            <p className="max-w-md text-sm text-slate-500">
              Conecte o Meta Ads ou o Google Ads e vincule as contas aos clientes. Depois disso, a sincronização começa sozinha em até 5 minutos.
            </p>
            {canConfigure && (
              <Link to="/configuracoes/integracoes" className="mt-1 text-sm font-medium text-brand-700 hover:underline">
                Ir para Configurações → Integrações
              </Link>
            )}
          </Card>
        ) : (
          <ul className="space-y-3" aria-label="Contas e sincronização">
            {rows.map((r) => (
              <AccountRow
                key={r.ad_account_id}
                row={r}
                canRun={canRun}
                busy={run.isPending}
                pending={run.isPending && Array.isArray(run.variables) && run.variables.includes(r.ad_account_id)}
                onRun={() => start([r.ad_account_id])}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="sync-log-title">
        <div>
          <h2 id="sync-log-title" className="text-lg font-semibold">Histórico de sincronizações</h2>
          <p className="text-sm text-slate-500">As 50 mais recentes. O histórico completo fica guardado.</p>
        </div>
        {runs.error && <Alert tone="error">{runs.error.message}</Alert>}
        <RunsTable runs={runs.data ?? []} loading={runs.isLoading} />
      </section>
    </div>
  );
}

function SummaryCard({ label, testId, danger, children }: { label: string; testId: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-4" data-testid={testId}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className={danger ? "mt-1 text-lg font-semibold text-red-700" : "mt-1 text-lg font-semibold text-slate-900"}>{children}</div>
    </Card>
  );
}

function AccountRow({ row: r, canRun, busy, pending, onRun }: { row: SyncOverviewRow; canRun: boolean; busy: boolean; pending: boolean; onRun: () => void }) {
  const state = accountState(r);
  const note =
    state === "sem_conexao"
      ? "Esta conta está sem conexão com a plataforma. Conecte novamente em Configurações → Integrações."
      : state === "teste"
        ? "Conta de teste: não entra na sincronização automática (dá para sincronizar manualmente)."
        : null;
  return (
    <li>
      <Card className="p-4" data-testid="sync-account" data-state={state}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{r.name}</p>
            <p className="text-xs text-slate-500">
              {r.client_name} · {PLATFORM_LABELS[r.platform_id] ?? r.platform_id} · {formatAccountId(r.platform_id, r.external_id)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span data-testid="sync-state"><Badge tone={STATE_TONE[state]}>{STATE_LABELS[state]}</Badge></span>
            {canRun && r.has_connection && (
              <Button variant="secondary" className="px-2.5 py-1 text-xs" loading={pending} disabled={busy || r.running} onClick={onRun}>
                {!pending && <RefreshCw className="size-3.5" aria-hidden />} Sincronizar
              </Button>
            )}
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500 lg:grid-cols-5" data-testid="sync-account-meta">
          <div><dt>Última tentativa</dt><dd className="text-slate-700">{when(r.last_attempt_at)}</dd></div>
          <div><dt>Último sucesso</dt><dd className="text-slate-700">{when(r.last_success_at)}</dd></div>
          <div>
            <dt>Próxima</dt>
            <dd className="text-slate-700">{isScheduled(r) ? (r.running ? "—" : formatNext(r.next_run_at)) : "Não agendada"}</dd>
          </div>
          <div><dt>Registros atualizados</dt><dd className="text-slate-700">{r.run_records === null ? "—" : r.run_records.toLocaleString("pt-BR")}</dd></div>
          <div><dt>Duração</dt><dd className="text-slate-700">{formatDuration(r.run_duration_ms)}</dd></div>
        </dl>

        {state === "erro" && (r.last_error_message ?? r.run_error) && (
          <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-800" data-testid="sync-error">
            <strong className="font-medium">Erro:</strong> {r.last_error_message ?? r.run_error} Uma nova tentativa acontece sozinha em 30 minutos.
          </p>
        )}
        {note && <p className="mt-3 text-xs text-slate-500">{note}</p>}
      </Card>
    </li>
  );
}
