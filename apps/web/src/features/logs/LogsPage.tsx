import { AUDIT_CATEGORIES, type AuditCategory, auditActionLabel, can, describeAuditDetails } from "@backstage/shared";
import { Download, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { RUN_LABEL, RunsTable, TRIGGER_LABEL } from "@/features/sync/RunsTable.tsx";
import { formatDuration } from "@/features/sync/logic.ts";
import { useUsers } from "@/features/users/api.ts";
import { cn } from "@/lib/cn.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { type AuditRow, useAuditLog, useSyncLog } from "./api.ts";
import { actorLabel, auditCsvRows, downloadCsv, LOG_PERIODS, type LogPeriod, periodStart } from "./logic.ts";

type Tab = "acoes" | "sincronizacoes";

const pick = <T extends string>(value: string | null, allowed: readonly T[]) => (value && (allowed as readonly string[]).includes(value) ? (value as T) : null);
const PERIOD_VALUES = LOG_PERIODS.map((p) => p.value);
const CATEGORY_VALUES = AUDIT_CATEGORIES.map((c) => c.value);

export function LogsPage() {
  const { profile } = useAuth();
  // Auditoria (quem fez o quê) é só do administrador; o gestor vê as sincronizações.
  const canAudit = can(profile?.role, "users.manage");
  const [params, updateParams] = useSearchParamsUpdater();
  const tab: Tab = canAudit ? (pick(params.get("aba"), ["acoes", "sincronizacoes"] as const) ?? "acoes") : "sincronizacoes";
  const period = pick(params.get("periodo"), PERIOD_VALUES) ?? "30";
  const set = (key: string, value: string | null) =>
    updateParams((latest) => {
      if (value) latest.set(key, value);
      else latest.delete(key);
      return latest;
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tudo o que aconteceu no sistema: {canAudit ? "quem entrou, quem alterou o quê e " : ""}cada sincronização com as plataformas. Nada é apagado.
        </p>
      </div>

      {canAudit && (
        <div className="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Escolha o log">
          {([["acoes", "Ações dos usuários"], ["sincronizacoes", "Sincronizações"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => set("aba", value === "acoes" ? null : value)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                tab === value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "acoes" ? (
        <AuditTab period={period} params={params} set={set} />
      ) : (
        <SyncTab period={period} params={params} set={set} />
      )}
    </div>
  );
}

interface TabProps {
  period: LogPeriod;
  params: URLSearchParams;
  set: (key: string, value: string | null) => void;
}

function PeriodSelect({ period, set }: Pick<TabProps, "period" | "set">) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slate-700">Período</span>
      <Select value={period} onChange={(e) => set("periodo", e.target.value === "30" ? null : e.target.value)}>
        {LOG_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </Select>
    </label>
  );
}

function AuditTab({ period, params, set }: TabProps) {
  const actor = params.get("pessoa");
  const category = pick(params.get("tipo"), CATEGORY_VALUES) as AuditCategory | null;
  const from = useMemo(() => periodStart(period), [period]);
  const { data: users = [] } = useUsers();
  const log = useAuditLog({ from, actor, category }, true);
  const rows = log.data?.pages.flat() ?? [];

  return (
    <section className="space-y-4" aria-label="Ações dos usuários">
      <Card className="grid gap-3 p-4 sm:grid-cols-3" role="search" aria-label="Filtros das ações">
        <PeriodSelect period={period} set={set} />
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Pessoa</span>
          <Select value={actor ?? ""} onChange={(e) => set("pessoa", e.target.value || null)}>
            <option value="">Todas</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tipo</span>
          <Select value={category ?? ""} onChange={(e) => set("tipo", e.target.value || null)}>
            <option value="">Todos</option>
            {AUDIT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </label>
      </Card>

      {log.error && <Alert tone="error">{log.error.message}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500" data-testid="audit-count">
          {log.isLoading ? "Carregando…" : `${rows.length}${log.hasNextPage ? "+" : ""} ${rows.length === 1 ? "registro" : "registros"}`}
        </p>
        <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={!rows.length} onClick={() => downloadCsv("logs-acoes.csv", auditCsvRows(rows))}>
          <Download className="size-3.5" aria-hidden /> Baixar planilha
        </Button>
      </div>

      {log.isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center" data-testid="audit-empty">
          <ScrollText className="size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">Nenhum registro com estes filtros.</p>
        </Card>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" aria-label="Registros de ações">
          {rows.map((r) => <AuditItem key={r.id} row={r} />)}
        </ul>
      )}

      {log.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" loading={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>Carregar mais</Button>
        </div>
      )}
    </section>
  );
}

function AuditItem({ row: r }: { row: AuditRow }) {
  const lines = describeAuditDetails(r.action, r.details);
  return (
    <li className="px-4 py-3" data-testid="audit-row" data-action={r.action}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-slate-900">
          <span className="font-medium" data-testid="audit-actor">{actorLabel(r)}</span>
          <span className="text-slate-400" aria-hidden> · </span>
          <span data-testid="audit-action">{auditActionLabel(r.action)}</span>
          {r.target_label && !r.action.startsWith("auth.") && (
            <>
              <span className="text-slate-400" aria-hidden> · </span>
              <span className="text-slate-700" data-testid="audit-target">{r.target_label}</span>
            </>
          )}
        </p>
        <time className="whitespace-nowrap text-xs text-slate-500" dateTime={r.created_at}>{formatDateTime(r.created_at)}</time>
      </div>
      {lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-slate-600" data-testid="audit-details">
          {lines.map((l) => <li key={l} className="break-words">{l}</li>)}
        </ul>
      )}
    </li>
  );
}

function SyncTab({ period, params, set }: TabProps) {
  const status = pick(params.get("resultado"), ["sucesso", "erro"] as const);
  const clientId = params.get("cliente");
  const from = useMemo(() => periodStart(period), [period]);
  const { data: clients = [] } = useClients();
  const log = useSyncLog({ from, status, clientId }, true);
  const rows = log.data?.pages.flat() ?? [];

  const csv = () =>
    downloadCsv("logs-sincronizacoes.csv", [
      ["Início", "Conta", "Cliente", "Plataforma", "Origem", "Resultado", "Registros", "Duração", "Erro"],
      ...rows.map((x) => [
        formatDateTime(x.started_at), x.ad_accounts?.name ?? "", x.clients?.name ?? "", x.platform_id, TRIGGER_LABEL[x.trigger],
        RUN_LABEL[x.status], String(x.records_updated), formatDuration(x.duration_ms), x.error_message ?? "",
      ]),
    ]);

  return (
    <section className="space-y-4" aria-label="Sincronizações">
      <Card className="grid gap-3 p-4 sm:grid-cols-3" role="search" aria-label="Filtros das sincronizações">
        <PeriodSelect period={period} set={set} />
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Resultado</span>
          <Select value={status ?? ""} onChange={(e) => set("resultado", e.target.value || null)}>
            <option value="">Todos</option>
            <option value="sucesso">Sucesso</option>
            <option value="erro">Erro</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Cliente</span>
          <Select value={clientId ?? ""} onChange={(e) => set("cliente", e.target.value || null)}>
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
      </Card>

      {log.error && <Alert tone="error">{log.error.message}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500" data-testid="sync-count">
          {log.isLoading ? "Carregando…" : `${rows.length}${log.hasNextPage ? "+" : ""} ${rows.length === 1 ? "sincronização" : "sincronizações"}`}
        </p>
        <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={!rows.length} onClick={csv}>
          <Download className="size-3.5" aria-hidden /> Baixar planilha
        </Button>
      </div>

      <RunsTable runs={rows} loading={log.isLoading} emptyText="Nenhuma sincronização com estes filtros." />

      {log.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" loading={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>Carregar mais</Button>
        </div>
      )}
    </section>
  );
}
