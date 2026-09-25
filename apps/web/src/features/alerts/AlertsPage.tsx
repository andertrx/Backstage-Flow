import {
  ALERT_SEVERITIES,
  ALERT_SEVERITY_EMOJI,
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  ALERT_TYPE_LABELS,
  ALERT_TYPES,
  type AlertSeverity,
  type AlertStatus,
  can,
  compareAlerts,
  countOpenBySeverity,
  formatAccountId,
  PLATFORM_LABELS,
} from "@backstage/shared";
import { BellOff, CheckCircle2, Eye, RefreshCw, RotateCcw, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { type AlertRow, type AlertSituation, type RefreshAlertsResult, useAlerts, useRefreshAlerts, useSetAlertStatus } from "./api.ts";

const SITUATIONS: { value: AlertSituation; label: string }[] = [
  { value: "abertos", label: "Abertos" },
  { value: "resolvidos", label: "Resolvidos" },
  { value: "todos", label: "Todos" },
];

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  critica: "border-l-red-500",
  alta: "border-l-orange-500",
  media: "border-l-amber-400",
};
const STATUS_STYLE: Record<AlertStatus, string> = {
  aberto: "bg-red-50 text-red-700 ring-red-200",
  visto: "bg-slate-100 text-slate-700 ring-slate-200",
  resolvido: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const pick = <T extends string>(value: string | null, allowed: readonly T[]) => (value && (allowed as readonly string[]).includes(value) ? (value as T) : null);

export function AlertsPage() {
  const { profile } = useAuth();
  const canManage = can(profile?.role, "alerts.manage");
  const [params, updateParams] = useSearchParamsUpdater();
  const situation = pick(params.get("situacao"), ["abertos", "resolvidos", "todos"] as const) ?? "abertos";
  const severity = pick(params.get("gravidade"), ALERT_SEVERITIES);
  const type = pick(params.get("tipo"), ALERT_TYPES);
  const clientId = params.get("cliente");
  const platform = pick(params.get("plataforma"), ["meta", "google"] as const);
  const set = (key: string, value: string | null) =>
    updateParams((latest) => {
      if (value) latest.set(key, value);
      else latest.delete(key);
      return latest;
    });

  const { data: clients = [] } = useClients();
  const { data = [], isLoading, error } = useAlerts(situation);
  const refresh = useRefreshAlerts();
  const [lastCheck, setLastCheck] = useState<RefreshAlertsResult | null>(null);

  const alerts = useMemo(
    () =>
      data
        .filter((a) => (!severity || a.severity === severity) && (!type || a.type === type) && (!clientId || a.client_id === clientId) && (!platform || a.platform_id === platform))
        .sort(compareAlerts),
    [data, severity, type, clientId, platform],
  );
  const counts = countOpenBySeverity(data);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Problemas encontrados nas contas e campanhas. A verificação roda sozinha a cada 15 minutos.
          </p>
        </div>
        {canManage && (
          <Button
            variant="secondary"
            loading={refresh.isPending}
            onClick={() => refresh.mutate(undefined, { onSuccess: setLastCheck })}
          >
            {!refresh.isPending && <RefreshCw className="size-4" aria-hidden />} Verificar agora
          </Button>
        )}
      </div>

      {refresh.error && <Alert tone="error">{errorMessage(refresh.error)}</Alert>}
      {lastCheck && (
        <Alert tone="success">
          Verificação concluída: {lastCheck.created} {lastCheck.created === 1 ? "alerta novo" : "alertas novos"}
          {" · "}{lastCheck.resolved} {lastCheck.resolved === 1 ? "resolvido" : "resolvidos"} automaticamente.
        </Alert>
      )}

      {/* Resumo por gravidade (só os não resolvidos) */}
      <div className="grid grid-cols-3 gap-3" role="list" aria-label="Alertas abertos por gravidade">
        {ALERT_SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            role="listitem"
            onClick={() => set("gravidade", severity === s ? null : s)}
            aria-pressed={severity === s}
            data-testid={`count-${s}`}
            className={cn(
              "rounded-xl border border-l-4 border-slate-200 bg-white p-3 text-left shadow-sm transition hover:bg-slate-50",
              SEVERITY_STYLE[s],
              severity === s && "ring-2 ring-brand-600",
            )}
          >
            <span className="block text-xs font-medium text-slate-500">
              <span aria-hidden>{ALERT_SEVERITY_EMOJI[s]}</span> {ALERT_SEVERITY_LABELS[s]}
            </span>
            <span className="text-2xl font-semibold text-slate-900">{counts[s]}</span>
          </button>
        ))}
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" role="search" aria-label="Filtros de alertas">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Situação</span>
          <Select value={situation} onChange={(e) => set("situacao", e.target.value === "abertos" ? null : e.target.value)}>
            {SITUATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Gravidade</span>
          <Select value={severity ?? ""} onChange={(e) => set("gravidade", e.target.value || null)}>
            <option value="">Todas</option>
            {ALERT_SEVERITIES.map((s) => <option key={s} value={s}>{ALERT_SEVERITY_LABELS[s]}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Tipo</span>
          <Select value={type ?? ""} onChange={(e) => set("tipo", e.target.value || null)}>
            <option value="">Todos os tipos</option>
            {ALERT_TYPES.map((t) => <option key={t} value={t}>{ALERT_TYPE_LABELS[t]}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Cliente</span>
          <Select value={clientId ?? ""} onChange={(e) => set("cliente", e.target.value || null)}>
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Plataforma</span>
          <Select value={platform ?? ""} onChange={(e) => set("plataforma", e.target.value || null)}>
            <option value="">Todas</option>
            <option value="meta">Meta Ads</option>
            <option value="google">Google Ads</option>
          </Select>
        </label>
      </Card>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : alerts.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center" data-testid="alerts-empty">
          <BellOff className="size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">
            {situation === "abertos" && !severity && !type && !clientId && !platform ? "Nenhum alerta aberto. Tudo certo por aqui." : "Nenhum alerta com estes filtros."}
          </p>
          <p className="text-sm text-slate-500">Os alertas aparecem sozinhos quando algum problema é encontrado.</p>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label="Lista de alertas">
          {alerts.map((a) => <AlertCard key={a.id} alert={a} canManage={canManage} />)}
        </ul>
      )}
    </div>
  );
}

function AlertCard({ alert: a, canManage }: { alert: AlertRow; canManage: boolean }) {
  const setStatus = useSetAlertStatus();
  const busy = setStatus.isPending;
  const change = (status: AlertStatus) => setStatus.mutate({ id: a.id, status });
  return (
    <li>
      <Card className={cn("border-l-4 p-4", SEVERITY_STYLE[a.severity], a.status === "resolvido" && "opacity-75")} data-testid="alert-card" data-alert-type={a.type}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-900" data-testid="alert-severity">
                <span aria-hidden>{ALERT_SEVERITY_EMOJI[a.severity]}</span> {ALERT_SEVERITY_LABELS[a.severity]}
              </span>
              <span className="text-slate-400" aria-hidden>·</span>
              <span className="font-medium text-slate-700" data-testid="alert-type">{ALERT_TYPE_LABELS[a.type]}</span>
            </p>
            <p className="mt-1 text-slate-900" data-testid="alert-description">{a.description}</p>
          </div>
          <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLE[a.status])} data-testid="alert-status">
            {ALERT_STATUS_LABELS[a.status]}
          </span>
        </div>

        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4" data-testid="alert-meta">
          <div><dt className="inline">Data: </dt><dd className="inline text-slate-700" title={formatDateTime(a.first_seen_at)}>{formatDateTime(a.first_seen_at)}</dd></div>
          <div><dt className="inline">Cliente: </dt><dd className="inline text-slate-700">{a.clients?.name ?? "—"}</dd></div>
          <div><dt className="inline">Plataforma: </dt><dd className="inline text-slate-700">{a.platform_id ? PLATFORM_LABELS[a.platform_id] ?? a.platform_id : "—"}</dd></div>
          <div>
            <dt className="inline">Conta: </dt>
            <dd className="inline text-slate-700">
              {a.ad_accounts ? `${a.ad_accounts.name} (${formatAccountId(a.platform_id ?? "", a.ad_accounts.external_id)})` : "—"}
            </dd>
          </div>
          {a.campaign_id && (
            <div className="sm:col-span-2">
              <dt className="inline">Campanha: </dt>
              <dd className="inline"><Link to={`/campanhas/${a.campaign_id}`} className="text-brand-700 hover:underline">{a.campaigns?.name ?? "abrir"}</Link></dd>
            </div>
          )}
        </dl>

        {a.recommended_action && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700" data-testid="alert-action">
            <Wrench className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            <span><strong className="font-medium">Ação recomendada:</strong> {a.recommended_action}</span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            {a.status === "resolvido" && a.resolved_at
              ? `${a.resolution === "automatica" ? "Resolvido automaticamente (o problema deixou de acontecer)" : "Marcado como resolvido"} ${formatRelative(a.resolved_at)}.`
              : `Problema ainda presente na verificação de ${formatRelative(a.last_seen_at)}.`}
          </p>
          {canManage && a.status !== "resolvido" && (
            <div className="flex flex-wrap gap-2">
              {a.status === "aberto" ? (
                <Button variant="ghost" className="px-2.5 py-1 text-xs" disabled={busy} onClick={() => change("visto")}>
                  <Eye className="size-3.5" aria-hidden /> Marcar como visto
                </Button>
              ) : (
                <Button variant="ghost" className="px-2.5 py-1 text-xs" disabled={busy} onClick={() => change("aberto")}>
                  <RotateCcw className="size-3.5" aria-hidden /> Reabrir
                </Button>
              )}
              <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={busy} onClick={() => change("resolvido")}>
                <CheckCircle2 className="size-3.5" aria-hidden /> Resolver
              </Button>
            </div>
          )}
        </div>
        {setStatus.error && <p className="mt-2 text-xs text-red-700">{errorMessage(setStatus.error)}</p>}
      </Card>
    </li>
  );
}
