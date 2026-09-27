import {
  can,
  captureParams,
  CHANNEL_LABELS,
  classifyTouch,
  type Evidence,
  EVIDENCE_LABELS,
  eventLabel,
} from "@backstage/shared";
import { Code2, MousePointerClick, Pencil, Plus, Radar } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import {
  type OverviewRow,
  type TrackingContainer,
  useConversionsSummary,
  useRecentEvents,
  useRecentLeads,
  useRecentTouchpoints,
  useTrackingContainers,
  useTrackingOverview,
} from "./api.ts";
import { ContainerFormModal, InstallModal } from "./ContainerModals.tsx";
import { LeadsSection } from "./LeadsSection.tsx";
import { PERIOD_LABELS, type PeriodPreset, periodRange, summarizeConversions } from "./logic.ts";

const EVIDENCE_TONE: Record<Evidence, "success" | "warning" | "neutral"> = {
  confirmada: "success",
  provavel: "warning",
  desconhecida: "neutral",
};

const paidLabel = (paid: boolean | null) => (paid === true ? "Pago" : paid === false ? "Orgânico" : "Não dá para saber");

export function TrackingPage() {
  const { profile } = useAuth();
  const canManage = can(profile?.role, "tracking.manage");
  const [params, updateParams] = useSearchParamsUpdater();
  const period = (["hoje", "7d", "30d"] as const).find((p) => p === params.get("periodo")) ?? "hoje";
  const clientId = params.get("cliente");
  const set = (key: string, value: string | null) =>
    updateParams((latest) => {
      if (value) latest.set(key, value);
      else latest.delete(key);
      return latest;
    });

  const { data: clients = [] } = useClients();
  const { data: containers = [], isLoading, error } = useTrackingContainers();
  const hasContainers = containers.length > 0;
  const range = useMemo(() => periodRange(period), [period]);
  const overview = useTrackingOverview(range.from, range.to, hasContainers);
  const touchpoints = useRecentTouchpoints(hasContainers);
  const events = useRecentEvents(hasContainers);
  const leads = useRecentLeads(hasContainers);
  const conversions = useConversionsSummary(range.from, range.to, hasContainers);

  const [editing, setEditing] = useState<TrackingContainer | "new" | null>(null);
  const [installing, setInstalling] = useState<TrackingContainer | null>(null);

  const visible = containers.filter((c) => !clientId || c.client_id === clientId);
  const visibleIds = new Set(visible.map((c) => c.id));
  const byId = new Map(containers.map((c) => [c.id, c]));
  const stats = new Map((overview.data ?? []).map((r) => [r.container_id, r]));
  const total = sumOverview(visible.map((c) => stats.get(c.id)).filter((r): r is OverviewRow => !!r));
  const conv = summarizeConversions(conversions.data ?? [], visibleIds);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
          <p className="mt-1 text-sm text-slate-500">
            Visitas, origens e eventos dos sites dos clientes, coletados pelo nosso script (sem dados pessoais).
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> Novo container
          </Button>
        )}
      </div>

      <Alert tone="info">
        Fase atual: visitas, origem de cada chegada (UTMs, fbclid, gclid e IDs do anúncio), leads, compras e a jornada de cada lead.
        O envio das conversões ao Meta (API de Conversões) entra na próxima fase.
      </Alert>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : !hasContainers ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center" data-testid="tracking-empty">
          <Radar className="size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">Nenhum site configurado ainda.</p>
          <p className="max-w-md text-sm text-slate-500">
            {canManage
              ? "Crie um container para o site do cliente, informe o domínio e cole o código de instalação no site."
              : "Peça a um administrador ou gestor para configurar o site do cliente."}
          </p>
        </Card>
      ) : (
        <>
          <Card className="grid gap-3 p-4 sm:grid-cols-2" role="search" aria-label="Filtros do tracking">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Período</span>
              <Select value={period} onChange={(e) => set("periodo", e.target.value === "hoje" ? null : e.target.value)}>
                {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
              </Select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Cliente</span>
              <Select value={clientId ?? ""} onChange={(e) => set("cliente", e.target.value || null)}>
                <option value="">Todos os clientes</option>
                {clients.filter((c) => containers.some((t) => t.client_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" role="list" aria-label="Resumo do período">
            <Stat label="Sessões" value={total.sessions} />
            <Stat label="Visitantes" value={total.visitors} />
            <Stat label="Páginas vistas" value={total.pageviews} />
            <Stat label="Sessões de anúncio" value={total.paid_sessions} hint="Origem paga (confirmada ou provável)." />
            <Stat label="Origem desconhecida" value={total.unknown_origin_sessions} hint="Sessões sem parâmetros nem site de origem." />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="list" aria-label="Conversões do período">
            <Stat label="Leads" value={conv.leads} hint="Eventos Lead no período." />
            <Stat label="Conversões" value={conv.conversions} hint="Lead, cadastro, inscrição, agendamento e compra." />
            <Stat label="Compras" value={conv.purchases} hint="Sem repetir o mesmo nº de pedido." />
            <div role="listitem" className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200" data-testid="tracking-revenue">
              <span className="block text-xs font-medium text-slate-500">Receita do site</span>
              {conv.revenue.length === 0 ? (
                <span className="text-2xl font-semibold text-slate-900">—</span>
              ) : (
                conv.revenue.map((r) => (
                  <span key={r.currency} className="block text-lg font-semibold text-slate-900">{formatMoney(r.micros / 1_000_000, r.currency)}</span>
                ))
              )}
            </div>
          </div>

          <section aria-label="Sites configurados" className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Sites</h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {visible.map((c) => (
                <ContainerCard
                  key={c.id}
                  container={c}
                  stats={stats.get(c.id)}
                  canManage={canManage}
                  onEdit={() => setEditing(c)}
                  onInstall={() => setInstalling(c)}
                />
              ))}
            </ul>
          </section>

          <LeadsSection
            leads={(leads.data ?? []).filter((l) => visibleIds.has(l.container_id))}
            siteName={(id) => byId.get(id)?.name ?? "—"}
          />

          <section aria-label="Últimas origens" className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Últimas chegadas e origem</h2>
            <Card className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Quando</th>
                    <th className="px-3 py-2 font-medium">Site</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Evidência</th>
                    <th className="px-3 py-2 font-medium">Campanha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" data-testid="touchpoints">
                  {(touchpoints.data ?? []).filter((t) => visibleIds.has(t.container_id)).map((t) => (
                    <tr key={t.id} data-testid="touchpoint-row">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(t.occurred_at)}</td>
                      <td className="px-3 py-2 text-slate-600">{byId.get(t.container_id)?.name ?? "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{CHANNEL_LABELS[t.channel]}</td>
                      <td className="px-3 py-2 text-slate-600">{paidLabel(t.paid)}</td>
                      <td className="px-3 py-2" title={t.reason}>
                        <Badge tone={EVIDENCE_TONE[t.evidence]}>{EVIDENCE_LABELS[t.evidence]}</Badge>
                        <span className="sr-only"> — {t.reason}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {t.utm_campaign ?? (t.ad_campaign_id ? `ID ${t.ad_campaign_id}` : "—")}
                      </td>
                    </tr>
                  ))}
                  {(touchpoints.data ?? []).filter((t) => visibleIds.has(t.container_id)).length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nenhuma chegada registrada ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          </section>

          <section aria-label="Últimos eventos" className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Últimos eventos (3 dias)</h2>
            <Card>
              <ul className="divide-y divide-slate-100 text-sm" data-testid="events">
                {(events.data ?? []).filter((e) => visibleIds.has(e.container_id)).map((e) => (
                  <li key={`${e.container_id}-${e.event_id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="event-row">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-medium text-slate-900">{eventLabel(e.event_name)}</span>
                      <span className="truncate text-slate-500">{e.page_path ?? ""}</span>
                      {e.test && <Badge tone="warning">Teste</Badge>}
                    </span>
                    <span className="text-xs text-slate-500">{byId.get(e.container_id)?.name} · {formatDateTime(e.occurred_at)}</span>
                  </li>
                ))}
                {(events.data ?? []).filter((e) => visibleIds.has(e.container_id)).length === 0 && (
                  <li className="px-3 py-6 text-center text-slate-500">Nenhum evento recebido nos últimos 3 dias.</li>
                )}
              </ul>
            </Card>
          </section>
        </>
      )}

      <LinkTester />

      {editing && (
        <ContainerFormModal
          container={editing === "new" ? null : editing}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            if (editing === "new") {
              const created = { id } as TrackingContainer;
              setInstalling((prev) => prev ?? created);
            }
          }}
        />
      )}
      {installing && (
        <InstallModalLoader id={installing.id} containers={containers} onClose={() => setInstalling(null)} />
      )}
    </div>
  );
}

/** Abre as instruções assim que o container recém-criado aparece na lista. */
function InstallModalLoader({ id, containers, onClose }: { id: string; containers: TrackingContainer[]; onClose: () => void }) {
  const container = containers.find((c) => c.id === id);
  return container ? <InstallModal container={container} onClose={onClose} /> : null;
}

function sumOverview(rows: OverviewRow[]) {
  const keys = ["sessions", "visitors", "pageviews", "events", "paid_sessions", "unknown_origin_sessions"] as const;
  return Object.fromEntries(keys.map((k) => [k, rows.reduce((t, r) => t + Number(r[k] ?? 0), 0)])) as Record<(typeof keys)[number], number>;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div role="listitem" className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200" title={hint} data-testid="tracking-stat">
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value.toLocaleString("pt-BR")}</span>
    </div>
  );
}

function ContainerCard({ container: c, stats, canManage, onEdit, onInstall }: {
  container: TrackingContainer;
  stats?: OverviewRow;
  canManage: boolean;
  onEdit: () => void;
  onInstall: () => void;
}) {
  return (
    <li>
      <Card className="space-y-3 p-4" data-testid="container-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{c.name}</p>
            <p className="text-xs text-slate-500">{c.clients?.name ?? "—"} · {c.allowed_domains.join(", ")}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge tone={c.status === "ativo" ? "success" : "neutral"}>{c.status === "ativo" ? "Ativo" : "Pausado"}</Badge>
            {c.test_mode && <Badge tone="warning">Modo teste</Badge>}
          </div>
        </div>
        <p className="text-sm text-slate-600" data-testid="container-last-event">
          {stats?.last_event_at ? `Último evento recebido ${formatRelative(stats.last_event_at)}.` : "Nenhum evento recebido ainda. Confira se o código foi instalado."}
        </p>
        <dl className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
          <div className="rounded-lg bg-slate-50 p-2"><dt>Sessões</dt><dd className="text-base font-semibold text-slate-900">{stats?.sessions ?? 0}</dd></div>
          <div className="rounded-lg bg-slate-50 p-2"><dt>Páginas</dt><dd className="text-base font-semibold text-slate-900">{stats?.pageviews ?? 0}</dd></div>
          <div className="rounded-lg bg-slate-50 p-2"><dt>Eventos</dt><dd className="text-base font-semibold text-slate-900">{stats?.events ?? 0}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onInstall} aria-label={`Código de instalação: ${c.name}`}>
            <Code2 className="size-3.5" aria-hidden /> Código de instalação
          </Button>
          {canManage && (
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onEdit} aria-label={`Editar ${c.name}`}>
              <Pencil className="size-3.5" aria-hidden /> Editar
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}

/** Confere, sem gravar nada, como uma URL de anúncio seria classificada. */
function LinkTester() {
  const [url, setUrl] = useState("");
  const [referrer, setReferrer] = useState("");
  const [result, setResult] = useState<ReturnType<typeof classify> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      new URL(url);
    } catch {
      setResult(null);
      return setError("Cole a URL completa, começando com https://");
    }
    setError(null);
    setResult(classify(url, referrer));
  }

  return (
    <Card className="space-y-3 p-4" aria-label="Testar link">
      <div className="flex items-center gap-2">
        <MousePointerClick className="size-4 text-slate-400" aria-hidden />
        <h2 className="text-base font-semibold text-slate-900">Testar um link</h2>
      </div>
      <p className="text-sm text-slate-500">Cole a URL de um anúncio para ver o que o tracking vai entender. Nada é gravado.</p>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end" noValidate>
        <Field label="URL de destino">
          {(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://loja.com.br/?utm_source=facebook&fbclid=…" />}
        </Field>
        <Field label="Site de origem (opcional)">
          {(id) => <Input id={id} value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="https://www.google.com/" />}
        </Field>
        <Button type="submit" variant="secondary">Testar</Button>
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      {result && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm" data-testid="link-test-result">
          {result.touch ? (
            <p>
              <strong>{CHANNEL_LABELS[result.touch.channel]}</strong> · {paidLabel(result.touch.paid)} ·{" "}
              <Badge tone={EVIDENCE_TONE[result.touch.evidence]}>{EVIDENCE_LABELS[result.touch.evidence]}</Badge>
              <span className="block text-slate-600">{result.touch.reason}</span>
            </p>
          ) : (
            <p>Navegação dentro do próprio site: não conta como nova origem.</p>
          )}
          <p className="text-xs text-slate-500">
            UTMs: {Object.entries(result.params.utm).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhuma"} · Identificadores de clique:{" "}
            {Object.keys(result.params.clickIds).join(", ") || "nenhum"} · IDs do anúncio:{" "}
            {Object.entries(result.params.adIds).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhum"}
          </p>
        </div>
      )}
    </Card>
  );
}

function classify(url: string, referrer: string) {
  const params = captureParams(url);
  return { params, touch: classifyTouch({ params, referrer: referrer.trim() || null, pageUrl: url }) };
}
