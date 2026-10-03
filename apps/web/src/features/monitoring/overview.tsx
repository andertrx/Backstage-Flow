import { can, PLATFORM_LABELS, PLATFORM_OPTIONS } from "@backstage/shared";
import { Activity, ArrowRight, BarChart3, Table2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { type ChartLine, TimeSeriesChart } from "@/components/charts/TimeSeriesChart.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { STATUS_LABELS } from "./alertDetail.tsx";
import type { AlertStatus } from "./api.ts";
import { SeverityBadge } from "./compare.tsx";
import { type MonitorPlatform, type MonitorSummary, useMonitorHistory, useMonitorSummary } from "./overviewApi.ts";

/** Etapa 37.6 — Visão geral, aba Histórico e os blocos do monitoramento no dashboard, ficha do cliente e visões Meta/Google. */

export const METRIC_NAMES: Record<string, string> = {
  cost_per_result: "Custo por resultado", results: "Resultados", cpc: "CPC", cpm: "CPM", ctr: "CTR", roas: "ROAS", spend: "Investimento",
};
const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null) => (v == null ? "" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/** Endereço da aba Alertas, já filtrada. */
export function alertsLink(o: { clientId?: string | null; platform?: string | null; alertId?: number } = {}) {
  const p = new URLSearchParams({ aba: "alertas" });
  if (o.clientId) p.set("cliente", o.clientId);
  if (o.platform) p.set("plataforma", o.platform);
  if (o.alertId) p.set("alerta", String(o.alertId));
  return `/monitoramento?${p.toString()}`;
}

/** Faixa curta (dashboard e visões Meta/Google): abertos por gravidade, sem responsável e com você. */
export function MonitorShortcut({ clientId = null, platform = null }: { clientId?: string | null; platform?: MonitorPlatform | null }) {
  const { profile } = useAuth();
  const allowed = can(profile?.role, "monitor.view");
  const { data: s } = useMonitorSummary(clientId, platform, allowed);
  if (!allowed || !s) return null;
  const total = s.open.critico + s.open.atencao + s.open.informativo;
  const item = (v: number, one: string, many: string, tone?: string) => (
    <span className={cn("whitespace-nowrap", v > 0 && tone ? tone : "text-slate-600")}>
      <b className="tabular-nums">{n(v)}</b> {v === 1 ? one : many}
    </span>
  );
  return (
    <Link to={alertsLink({ clientId, platform })} data-testid="monitor-shortcut"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400">
      <span className="flex items-center gap-2 font-semibold text-slate-800">
        <Activity className="size-4 text-blue-600" aria-hidden /> Monitoramento de desempenho
        {platform && <span className="font-normal text-slate-500">· {PLATFORM_LABELS[platform]}</span>}
      </span>
      {total === 0 ? (
        <span className="text-slate-600">Nenhum alerta de desempenho aberto</span>
      ) : (
        <>
          {item(s.open.critico, "crítico", "críticos", "font-semibold text-red-600")}
          {item(s.open.atencao, "de atenção", "de atenção", "font-semibold text-amber-700")}
          {s.open.informativo > 0 && item(s.open.informativo, "informativo", "informativos")}
          {item(s.unassigned, "sem responsável", "sem responsável")}
          {s.mine > 0 && item(s.mine, "com você", "com você", "font-semibold text-blue-700")}
        </>
      )}
      <ArrowRight className="ml-auto size-4 text-blue-600" aria-hidden />
    </Link>
  );
}

function TopList({ items, clientId }: { items: MonitorSummary["top"]; clientId?: string | null }) {
  if (!items.length) return <p className="text-sm text-slate-500">Nenhum alerta aberto.</p>;
  return (
    <ul className="divide-y divide-slate-100" data-testid="mais-urgentes">
      {items.map((a) => (
        <li key={a.id}>
          <Link to={alertsLink({ clientId, alertId: a.id })} className="flex items-start gap-3 py-2.5 hover:bg-slate-50" data-testid="alerta-urgente">
            <SeverityBadge severity={a.severity} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900" title={a.entity_name ?? ""}>{a.entity_name ?? "—"}</span>
              <span className="block text-xs text-slate-500">
                {METRIC_NAMES[a.metric] ?? a.metric} {pct(a.variation_pct)} · {a.client_name} · {PLATFORM_LABELS[a.platform_id] ?? a.platform_id}
              </span>
            </span>
            <span className="shrink-0 text-right text-xs text-slate-500">
              <span className="block">{STATUS_LABELS[a.status as AlertStatus] ?? a.status}</span>
              <span className="block">{a.assignee_name ?? "Sem responsável"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Bloco da ficha do cliente: alertas abertos do cliente e os mais urgentes. */
export function ClientMonitorCard({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const allowed = can(profile?.role, "monitor.view");
  const { data: s, error } = useMonitorSummary(clientId, null, allowed);
  if (!allowed) return null;
  const total = s ? s.open.critico + s.open.atencao + s.open.informativo : 0;
  return (
    <Card className="space-y-3 p-4" data-testid="cliente-monitoramento">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Activity className="size-4 text-blue-600" aria-hidden /> Monitoramento de desempenho</h2>
        <Link to={alertsLink({ clientId })} className="text-sm font-medium text-blue-700 hover:underline">Ver os alertas deste cliente</Link>
      </div>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {s && (
        <>
          <p className="text-sm text-slate-700" data-testid="cliente-monitoramento-contagem">
            {total === 0 ? "Nenhum alerta de desempenho aberto." : (
              <>
                <b className="text-red-600">{n(s.open.critico)}</b> crítico(s), <b className="text-amber-700">{n(s.open.atencao)}</b> de atenção
                {s.open.informativo > 0 && <>, {n(s.open.informativo)} informativo(s)</>} · {n(s.unassigned)} sem responsável
              </>
            )}
          </p>
          {total > 0 && <TopList items={s.top.slice(0, 3)} clientId={clientId} />}
        </>
      )}
    </Card>
  );
}

/** Visão geral: com você, sem responsável, mais urgentes e por cliente. */
export function OverviewExtras() {
  const { data: s, error, isLoading } = useMonitorSummary();
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (isLoading || !s) return null;
  const tile = (label: string, v: number, testid: string, to: string) => (
    <Link to={to} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-blue-400" data-testid={testid}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{n(v)}</p>
    </Link>
  );
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {tile("Com você", s.mine, "resumo-meus", alertsLink())}
        {tile("Sem responsável", s.unassigned, "resumo-sem-responsavel", alertsLink())}
        {tile("Novos (não vistos)", s.new, "resumo-novos", alertsLink())}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="mais-urgentes" className="space-y-2">
          <h2 id="mais-urgentes" className="text-base font-semibold">Mais urgentes</h2>
          <Card className="px-4 py-1"><TopList items={s.top} /></Card>
        </section>
        <section aria-labelledby="por-cliente" className="space-y-2">
          <h2 id="por-cliente" className="text-base font-semibold">Alertas abertos por cliente</h2>
          <Card className="relative overflow-x-auto p-0">
            {s.by_client.length === 0 ? <p className="p-4 text-sm text-slate-500">Nenhum alerta aberto.</p> : (
              <table className="w-full text-sm" data-testid="por-cliente">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 text-right font-medium">Críticos</th>
                    <th className="px-3 py-2 text-right font-medium">Atenção</th>
                    <th className="px-3 py-2 text-right font-medium">Sem resp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.by_client.slice(0, 10).map((c) => (
                    <tr key={c.client_id}>
                      <td className="px-3 py-2"><Link to={alertsLink({ clientId: c.client_id })} className="font-medium text-blue-700 hover:underline">{c.client_name}</Link></td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", c.critico > 0 && "font-semibold text-red-600")}>{n(c.critico)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{n(c.atencao)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{n(c.unassigned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {s.by_client.length > 10 && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Mostrando os 10 clientes com mais alertas de {s.by_client.length}.</p>}
          </Card>
        </section>
      </div>
    </div>
  );
}

/** Cores por ENTIDADE (mesmo par validado do dashboard): criados e resolvidos. */
const HISTORY_COLORS = { created: "#2a78d6", resolved: "#eb6834" };
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Aba Histórico: o que aconteceu com os alertas no período (só números do banco). */
export function HistoryTab() {
  const [days, setDays] = useState(30);
  const [clientId, setClientId] = useState("");
  const [platform, setPlatform] = useState<MonitorPlatform>("");
  const [asTable, setAsTable] = useState(false);
  const { data: clients = [] } = useClients();
  const { data: h, error, isLoading } = useMonitorHistory(days, clientId || null, platform || null);

  const lines: ChartLine[] = h ? [
    { key: "created", label: "Criados", color: HISTORY_COLORS.created, values: h.days.map((d) => d.created) },
    { key: "resolved", label: "Encerrados", color: HISTORY_COLORS.resolved, values: h.days.map((d) => d.resolved) },
  ] : [];
  const kpi = (label: string, value: string, hint?: string, testid?: string) => (
    <Card className="p-4" data-testid={testid}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </Card>
  );

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <label className="text-xs text-slate-600">
          Período
          <Select className="mt-1 w-44" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período do histórico">
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={180}>Últimos 180 dias</option>
          </Select>
        </label>
        <label className="text-xs text-slate-600">
          Cliente
          <Select className="mt-1 w-48" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Cliente do histórico">
            <option value="">Todos</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="text-xs text-slate-600">
          Plataforma
          <Select className="mt-1 w-36" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Plataforma do histórico">
            <option value="">Todas</option>
            {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </label>
      </Card>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {h && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpi("Alertas criados", n(h.created), `${n(h.created_by_severity.critico)} crítico(s) · ${n(h.created_by_severity.atencao)} de atenção`, "hist-criados")}
            {kpi("Encerrados", n(h.resolved), `${n(h.resolved_manual)} por alguém · ${n(h.resolved_auto)} normalizaram · ${n(h.resolved_inactive)} item desativado`, "hist-encerrados")}
            {kpi("Ainda abertos", n(h.still_open), "dos criados no período", "hist-abertos")}
            {kpi("Tempo até encerrar", h.median_hours == null ? "—" : h.median_hours < 48 ? `${h.median_hours.toLocaleString("pt-BR")} h` : `${(h.median_hours / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`,
              "mediana dos encerrados no período", "hist-tempo")}
          </div>

          <section aria-labelledby="hist-dia" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="hist-dia" className="text-base font-semibold">Alertas por dia</h2>
              <div className="flex items-center gap-3 text-xs text-slate-600">
                {lines.map((l) => (
                  <span key={l.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: l.color }} aria-hidden />{l.label}</span>
                ))}
                <button type="button" onClick={() => setAsTable((v) => !v)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-blue-700 hover:bg-blue-50">
                  {asTable ? <><BarChart3 className="size-3.5" aria-hidden /> Ver gráfico</> : <><Table2 className="size-3.5" aria-hidden /> Ver tabela</>}
                </button>
              </div>
            </div>
            <Card className="relative overflow-x-auto p-3">
              {asTable ? (
                <table className="w-full text-sm" data-testid="hist-tabela">
                  <thead className="text-left text-xs uppercase text-slate-500">
                    <tr><th className="px-2 py-1 font-medium">Dia</th><th className="px-2 py-1 text-right font-medium">Criados</th><th className="px-2 py-1 text-right font-medium">Encerrados</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...h.days].reverse().map((d) => (
                      <tr key={d.day}><td className="px-2 py-1">{ddmm(d.day)}</td><td className="px-2 py-1 text-right tabular-nums">{d.created}</td><td className="px-2 py-1 text-right tabular-nums">{d.resolved}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <TimeSeriesChart lines={lines} xLabels={h.days.map((d) => ddmm(d.day))} pointTitles={h.days.map((d) => `Dia ${ddmm(d.day)}`)}
                  formatValue={(v) => n(v)} formatAxis={(v) => n(Math.round(v))} ariaLabel="Alertas criados e encerrados por dia" height={220} />
              )}
            </Card>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="hist-avaliacoes" className="space-y-2">
              <h2 id="hist-avaliacoes" className="text-base font-semibold">Resultado das providências</h2>
              <Card className="space-y-2 p-4 text-sm" data-testid="hist-avaliacoes">
                <p className="text-xs text-slate-500">Avaliações automáticas 3 e 7 dias depois de cada providência registrada.</p>
                {h.followups.melhorou + h.followups.piorou + h.followups.igual + h.followups.sem_dados === 0 ? (
                  <p className="text-slate-500">Nenhuma avaliação no período.</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-2">
                    <li><b className="tabular-nums text-emerald-700">{n(h.followups.melhorou)}</b> melhorou</li>
                    <li><b className="tabular-nums text-red-600">{n(h.followups.piorou)}</b> piorou</li>
                    <li><b className="tabular-nums">{n(h.followups.igual)}</b> sem mudança relevante</li>
                    <li><b className="tabular-nums">{n(h.followups.sem_dados)}</b> sem dados suficientes</li>
                  </ul>
                )}
                {h.recurrences > 0 && <p className="text-xs text-slate-500">{n(h.recurrences)} alerta(s) voltaram depois de encerrados (reincidência).</p>}
              </Card>
            </section>
            <section aria-labelledby="hist-metricas" className="space-y-2">
              <h2 id="hist-metricas" className="text-base font-semibold">Métricas que mais geraram alertas</h2>
              <Card className="p-4">
                {h.by_metric.length === 0 ? <p className="text-sm text-slate-500">Nenhum alerta criado no período.</p> : (
                  <ul className="space-y-2" data-testid="hist-metricas">
                    {h.by_metric.map((m) => (
                      <li key={m.metric} className="flex items-center gap-3 text-sm">
                        <span className="w-40 shrink-0 text-slate-700">{METRIC_NAMES[m.metric] ?? m.metric}</span>
                        <span className="h-2 flex-1 rounded-full bg-slate-100" aria-hidden>
                          <span className="block h-2 rounded-full bg-blue-600" style={{ width: `${(m.created / Math.max(...h.by_metric.map((x) => x.created))) * 100}%` }} />
                        </span>
                        <span className="w-10 text-right tabular-nums text-slate-700">{n(m.created)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>
          <p className="text-xs text-slate-500">Período: {ddmm(h.from)} a {ddmm(h.to)}/{h.to.slice(0, 4)} (fuso de São Paulo). Alertas ignorados contam como criados; nada é apagado.</p>
        </>
      )}
    </div>
  );
}

