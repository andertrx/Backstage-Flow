import {
  addDays,
  COMPARED_METRICS,
  type ComparedMetric,
  type CompareEvaluation,
  type CompareLevel,
  compareSeverity,
  DATA_QUALITY_LABELS,
  type DateRange,
  daysInRange,
  DEFAULT_TIMEZONE,
  isValidRange,
  MONITOR_METRIC_DEFINITIONS,
  MONITOR_PERIOD_LABELS,
  MONITOR_PERIODS,
  MONITOR_SEVERITY_LABELS,
  type MonitorPeriod,
  monitorPeriods,
  type MonitorSeverity,
  type MonitorTotals,
  type MonitorVariation,
  monitorValues,
  monitorVariation,
  type PeriodPair,
  PLATFORM_LABELS,
  PLATFORM_OPTIONS,
  RESULT_KIND_LABELS,
  SCOPE_LABELS,
  evaluateComparison,
} from "@backstage/shared";
import { ExternalLink, ImageOff, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart.tsx";
import { useClients } from "@/features/clients/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatAxisValue, formatChange, formatDate, formatKpi } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { type CompareRow, useMonitorCompare, useMonitorDaily, useMonitorRules } from "./api.ts";
import { useMonitorObjectives } from "./objectivesFilter.tsx";

// ---------------------------------------------------------------- filtros (no endereço)

export interface MonitorFilters {
  period: MonitorPeriod;
  custom: DateRange | null;
  clientId: string | null;
  platform: string | null;
  campaignId: string | null;
  onlyRelevant: boolean;
}

export function useMonitorFilters() {
  const [params, update] = useSearchParamsUpdater();
  const p = params.get("periodo");
  const period: MonitorPeriod = p === "custom" || (MONITOR_PERIODS as readonly string[]).includes(p ?? "") ? (p as MonitorPeriod) : "last_7_days";
  const de = params.get("de");
  const ate = params.get("ate");
  const custom = de && ate && isValidRange({ from: de, to: ate }) && daysInRange({ from: de, to: ate }) <= 400 ? { from: de, to: ate } : null;
  const filters: MonitorFilters = {
    period,
    custom,
    clientId: params.get("cliente"),
    platform: params.get("plataforma"),
    campaignId: params.get("campanha"),
    onlyRelevant: params.get("relevantes") === "1",
  };
  const set = (patch: Record<string, string | null>) =>
    update((latest) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v) latest.set(k, v);
        else latest.delete(k);
      }
      return latest;
    });
  const pair = monitorPeriods(period, DEFAULT_TIMEZONE, new Date(), custom);
  return { filters, pair, set, params };
}

const rangeText = (r: DateRange) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} a ${formatDate(r.to)}`);

export function FiltersBar({ filters, pair, set }: ReturnType<typeof useMonitorFilters>) {
  const { data: clients = [] } = useClients();
  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Período">
          {(id) => (
            <Select
              id={id}
              value={filters.period}
              onChange={(e) => {
                const v = e.target.value;
                set(v === "custom" ? { periodo: v, de: pair.current.from, ate: pair.current.to } : { periodo: v === "last_7_days" ? null : v, de: null, ate: null });
              }}
            >
              {[...MONITOR_PERIODS, "custom" as const].map((v) => <option key={v} value={v}>{MONITOR_PERIOD_LABELS[v]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Cliente">
          {(id) => (
            <Select id={id} value={filters.clientId ?? ""} onChange={(e) => set({ cliente: e.target.value || null, campanha: null })}>
              <option value="">Todos os clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Plataforma">
          {(id) => (
            <Select id={id} value={filters.platform ?? ""} onChange={(e) => set({ plataforma: e.target.value || null })}>
              <option value="">Todas</option>
              {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input type="checkbox" className="size-4 rounded border-slate-300" checked={filters.onlyRelevant} onChange={(e) => set({ relevantes: e.target.checked ? "1" : null })} />
          Só variações relevantes (atenção ou crítico)
        </label>
      </div>
      {filters.period === "custom" && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="De">
            {(id) => <Input id={id} type="date" value={pair.current.from} onChange={(e) => e.target.value && set({ de: e.target.value })} />}
          </Field>
          <Field label="Até">
            {(id) => <Input id={id} type="date" value={pair.current.to} onChange={(e) => e.target.value && set({ ate: e.target.value })} />}
          </Field>
        </div>
      )}
      <p className="text-xs text-slate-500" data-testid="periodos">
        Atual: <strong className="text-slate-700">{rangeText(pair.current)}</strong> × anterior: <strong className="text-slate-700">{rangeText(pair.previous)}</strong>
        {" "}({daysInRange(pair.current)} {daysInRange(pair.current) === 1 ? "dia" : "dias"} cada{!pair.same_length ? " — durações diferentes" : ""}). Fuso: São Paulo.
        {pair.note && <span className="ml-1 font-medium text-amber-700">{pair.note}</span>}
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- avaliação + aparência

export const SEVERITY_LOOK: Record<MonitorSeverity, { text: string; border: string; badge: string }> = {
  critico: { text: "text-red-700", border: "border-l-red-500", badge: "bg-red-50 text-red-700 ring-red-200" },
  atencao: { text: "text-orange-700", border: "border-l-orange-500", badge: "bg-orange-50 text-orange-700 ring-orange-200" },
  informativo: { text: "text-sky-700", border: "border-l-sky-400", badge: "bg-sky-50 text-sky-700 ring-sky-200" },
  normal: { text: "text-slate-500", border: "border-l-emerald-400", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

export function SeverityBadge({ severity }: { severity: MonitorSeverity }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", SEVERITY_LOOK[severity].badge)} data-severity={severity}>
      {MONITOR_SEVERITY_LABELS[severity]}
    </span>
  );
}

const METRIC_FORMAT: Record<ComparedMetric, "money" | "decimal" | "percent" | "ratio"> = {
  spend: "money", results: "decimal", cost_per_result: "money", ctr: "percent", cpc: "money", cpm: "money", roas: "ratio",
};
const SHORT_LABEL: Record<ComparedMetric, string> = {
  spend: "Investimento", results: "Resultados", cost_per_result: "Custo/result.", ctr: "CTR", cpc: "CPC", cpm: "CPM", roas: "ROAS",
};

export const fmtMetric = (m: ComparedMetric, v: number | null, currency: string) => (v == null ? "—" : formatKpi(v, METRIC_FORMAT[m], currency));

export function variationText(v: MonitorVariation): string {
  switch (v.kind) {
    case "percent": return formatChange(v.percent!);
    case "new": return "Novo";
    case "no_change": return "0,0%";
    case "no_base": return "Sem base";
    case "unavailable": return "—";
  }
}

export interface EvaluatedRow extends CompareRow {
  evaluation: CompareEvaluation;
}

/**
 * Dentro do período coberto pelo histórico, item sem nenhum dia de dados = não veiculou (zero).
 * Fora da cobertura continua "sem dados" (null): nunca estimamos.
 */
function noDeliveryAsZero(t: MonitorTotals, days: number, coverage: CompareRow["coverage"]): MonitorTotals {
  if (days > 0 || coverage !== "completa") return t;
  return { ...t, spend_micros: 0, impressions: 0, clicks: 0, link_clicks: 0, leads: 0, messages: 0, conversions: 0 };
}

export function useEvaluatedRows(level: CompareLevel, filters: MonitorFilters, pair: PeriodPair) {
  const { objectives } = useMonitorObjectives();
  const q = useMonitorCompare({ level, current: pair.current, previous: pair.previous, clientId: filters.clientId, platform: filters.platform, campaignId: filters.campaignId, objectives });
  const { data: rules = [] } = useMonitorRules();
  const rows = useMemo(() => {
    const list: EvaluatedRow[] = (q.data ?? []).map((raw) => {
      const r = { ...raw, current: noDeliveryAsZero(raw.current, raw.cur_days, raw.coverage), previous: noDeliveryAsZero(raw.previous, raw.prev_days, raw.coverage) };
      return {
      ...r,
      evaluation: evaluateComparison(
        {
          level, objective: r.objective, coverage: r.coverage, partial: pair.partial, current: r.current, previous: r.previous,
          target: { client_id: r.client_id, account_id: r.ad_account_id, campaign_id: r.campaign_id, ad_id: level === "ad" ? r.entity_id : null },
        },
        rules,
      ),
      };
    });
    return list
      .filter((r) => !filters.onlyRelevant || r.evaluation.worst === "critico" || r.evaluation.worst === "atencao")
      .sort((a, b) => compareSeverity(a.evaluation.worst, b.evaluation.worst) || (b.current.spend_micros ?? 0) - (a.current.spend_micros ?? 0));
  }, [q.data, rules, level, pair.partial, filters.onlyRelevant]);
  return { ...q, rows };
}

export function SeveritySummary({ rows }: { rows: EvaluatedRow[] }) {
  const count = (s: MonitorSeverity) => rows.filter((r) => r.evaluation.worst === s).length;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(["critico", "atencao", "informativo", "normal"] as const).map((s) => (
        <Card key={s} className={cn("border-l-4 p-3", SEVERITY_LOOK[s].border)} data-testid={`resumo-${s}`}>
          <p className={cn("text-sm font-medium", SEVERITY_LOOK[s].text)}>{MONITOR_SEVERITY_LABELS[s]}</p>
          <p className="text-2xl font-semibold tabular-nums">{count(s)}</p>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- tabela comparativa

const LEVEL_LABELS: Record<CompareLevel, string> = {
  account: "Contas", campaign: "Campanhas", ad_group: "Conjuntos / grupos", ad: "Anúncios", creative: "Criativos",
};

export function CompareTable({ level, filters, pair, set }: { level: CompareLevel } & ReturnType<typeof useMonitorFilters>) {
  const { rows, isLoading, isFetching, error } = useEvaluatedRows(level, filters, pair);
  const [open, setOpen] = useState<EvaluatedRow | null>(null);

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      <SeveritySummary rows={rows} />
      <p className="text-xs text-slate-500">
        A gravidade usa os limites das Configurações. Cada linha mostra o valor atual e a variação em relação ao período anterior, na moeda da própria conta (moedas nunca são somadas).
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm" aria-busy={isFetching}>
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{LEVEL_LABELS[level]}</th>
              <th className="px-3 py-2">Situação</th>
              {COMPARED_METRICS.map((m) => <th key={m} className="px-3 py-2 text-right">{SHORT_LABEL[m]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Carregando…</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500" data-testid="compare-vazio">
                {filters.onlyRelevant ? "Nenhuma variação relevante neste período." : "Nenhum dado nos dois períodos."}
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.entity_key} className={cn("border-l-4 hover:bg-slate-50", SEVERITY_LOOK[r.evaluation.worst].border)} data-testid="compare-row" data-severity={r.evaluation.worst}>
                <td className="max-w-[280px] px-3 py-2.5">
                  <button type="button" onClick={() => setOpen(r)} className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-brand-700 hover:underline" title={r.name ?? ""}>
                    {r.name ?? "Sem nome"}
                  </button>
                  <p className="truncate text-xs text-slate-500">
                    {r.client_name} · {PLATFORM_LABELS[r.platform_id] ?? r.platform_id}{level !== "account" ? ` · ${r.account_name}` : ""}
                    {(level === "ad" || level === "ad_group") && r.campaign_name ? ` · ${r.campaign_name}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <SeverityBadge severity={r.evaluation.worst} />
                  {r.coverage !== "completa" && <p className="mt-1 text-[11px] text-amber-700">Histórico incompleto</p>}
                </td>
                {COMPARED_METRICS.map((m) => {
                  const e = r.evaluation.metrics[m];
                  return (
                    <td key={m} className="px-3 py-2.5 text-right tabular-nums" title={`Anterior: ${fmtMetric(m, e.previous, r.currency)}`}>
                      <span className="text-slate-900">{fmtMetric(m, e.current, r.currency)}</span>
                      <span className={cn("block text-xs", SEVERITY_LOOK[e.severity].text)} data-metric={m}>{variationText(e.variation)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {rows.length >= 500 && <p className="text-xs text-slate-500">Mostrando os 500 itens com maior investimento. Use os filtros para ver os demais.</p>}
      {open && <EntityDetail row={open} pair={pair} onClose={() => setOpen(null)} onDrill={(lvl) => { set({ aba: "comparativos", nivel: lvl, campanha: open.campaign_id }); setOpen(null); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- detalhe (métricas, gráfico e dia a dia)

export function EntityDetail({ row, pair, onClose, onDrill }: {
  row: EvaluatedRow;
  pair: PeriodPair;
  onClose: () => void;
  onDrill?: (level: "ad_group" | "ad") => void;
}) {
  const [metric, setMetric] = useState<ComparedMetric>("cost_per_result");
  const span: DateRange = { from: pair.previous.from, to: pair.current.to };
  const daily = useMonitorDaily(row.level, row.entity_key, span);
  const kind = row.evaluation.resultKind;
  const byDate = new Map((daily.data ?? []).map((d) => [d.date, d.totals]));
  // Dentro do período coberto, dia sem linha = sem entrega (zero). Fora, é "sem dados".
  const zero = row.coverage === "completa";
  const valueOn = (date: string) => {
    const t = byDate.get(date);
    if (!t) return zero ? monitorValues({ spend_micros: 0, impressions: 0, reach: null, clicks: 0, link_clicks: 0, leads: 0, messages: 0, conversions: 0, conversion_value_micros: 0 }, kind)[metric] : null;
    return monitorValues(t, kind)[metric];
  };
  const curDays = Array.from({ length: daysInRange(pair.current) }, (_, i) => addDays(pair.current.from, i));
  const prevDays = Array.from({ length: daysInRange(pair.previous) }, (_, i) => addDays(pair.previous.from, i));
  const n = Math.max(curDays.length, prevDays.length);
  const curValues = Array.from({ length: n }, (_, i) => (curDays[i] ? valueOn(curDays[i]) : null));
  const prevValues = Array.from({ length: n }, (_, i) => (prevDays[i] ? valueOn(prevDays[i]) : null));
  const format = METRIC_FORMAT[metric];
  const today = pair.partial ? pair.current.to : null;
  const ruleOf = (m: ComparedMetric) => row.evaluation.metrics[m].rule;

  return (
    <Modal open title={row.name ?? "Detalhe"} onClose={onClose} size="lg">
      <div className="space-y-4" data-testid="detalhe">
        <div className="flex gap-3">
          {(row.level === "ad" || row.level === "creative") && <Thumb row={row} className="size-20" />}
          <div className="min-w-0 text-sm">
            <p className="text-slate-500">
              {row.client_name} · {PLATFORM_LABELS[row.platform_id] ?? row.platform_id} · {row.account_name}
              {row.campaign_name && row.level !== "campaign" ? ` · ${row.campaign_name}` : ""}
              {row.ad_group_name && (row.level === "ad" || row.level === "creative") ? ` · ${row.ad_group_name}` : ""}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={row.evaluation.worst} />
              {row.status && <Badge>{row.status}</Badge>}
              {row.level !== "account" && <span className="text-xs text-slate-500">Resultado: {RESULT_KIND_LABELS[kind]}</span>}
              {row.creative_external_id && <span className="text-xs text-slate-500">Criativo {row.creative_external_id}</span>}
              {row.level === "creative" && (row.ads_count ?? 0) > 1 && <Badge tone="brand">{row.ads_count} anúncios usam este criativo</Badge>}
            </p>
            <p className="mt-1 text-xs text-slate-500">Atual {rangeText(pair.current)} × anterior {rangeText(pair.previous)} · dias com dados: {row.cur_days} e {row.prev_days}</p>
          </div>
        </div>

        {row.coverage !== "completa" && (
          <Alert tone="warning">O histórico guardado desta conta não cobre os dois períodos inteiros: a comparação fica só como informação.</Alert>
        )}
        {pair.partial && <Alert tone="warning">Hoje ainda está em coleta: o período atual é parcial e não é equivalente ao anterior.</Alert>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1.5 pr-2">Métrica</th>
                <th className="py-1.5 pr-2 text-right">Atual</th>
                <th className="py-1.5 pr-2 text-right">Anterior</th>
                <th className="py-1.5 pr-2 text-right">Variação</th>
                <th className="py-1.5">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMPARED_METRICS.map((m) => {
                const e = row.evaluation.metrics[m];
                const rule = ruleOf(m);
                return (
                  <tr key={m} data-testid={`detalhe-${m}`}>
                    <td className="py-2 pr-2 font-medium text-slate-800">{MONITOR_METRIC_DEFINITIONS[m].label}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{fmtMetric(m, e.current, row.currency)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-slate-600">{fmtMetric(m, e.previous, row.currency)}</td>
                    <td className={cn("py-2 pr-2 text-right tabular-nums", SEVERITY_LOOK[e.severity].text)}>{variationText(e.variation)}</td>
                    <td className="py-2 text-xs">
                      <SeverityBadge severity={e.severity} />
                      {e.severity !== "normal" && <span className="ml-1 text-slate-500">{DATA_QUALITY_LABELS[e.quality]}</span>}
                      {rule && rule.active && (
                        <span className="block text-[11px] text-slate-400">
                          Limite {rule.attention_pct}% / {rule.critical_pct}% ({SCOPE_LABELS[rule.scope]})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-sm font-semibold">Tendência diária</h3>
            <div className="w-48">
              <Field label="Métrica do gráfico">
                {(id) => (
                  <Select id={id} value={metric} onChange={(e) => setMetric(e.target.value as ComparedMetric)}>
                    {COMPARED_METRICS.map((m) => <option key={m} value={m}>{MONITOR_METRIC_DEFINITIONS[m].label}</option>)}
                  </Select>
                )}
              </Field>
            </div>
          </div>
          {daily.error && <Alert tone="error">{errorMessage(daily.error)}</Alert>}
          {daily.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
          ) : (
            <TimeSeriesChart
              ariaLabel={`${MONITOR_METRIC_DEFINITIONS[metric].label} por dia: período atual e anterior`}
              lines={[
                { key: "atual", label: "Período atual", color: "#2563eb", values: curValues },
                { key: "anterior", label: "Período anterior", color: "#94a3b8", values: prevValues },
              ]}
              xLabels={Array.from({ length: n }, (_, i) => `Dia ${i + 1}`)}
              pointTitles={Array.from({ length: n }, (_, i) => `Dia ${i + 1}: ${curDays[i] ? formatDate(curDays[i]) : "—"} × ${prevDays[i] ? formatDate(prevDays[i]) : "—"}`)}
              formatValue={(v) => formatKpi(v, format, row.currency)}
              formatAxis={(v) => formatAxisValue(v, format, row.currency)}
              height={200}
            />
          )}
        </div>

        <details className="rounded-lg ring-1 ring-slate-200">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Comparação dia a dia ({MONITOR_METRIC_DEFINITIONS[metric].label})</summary>
          <table className="w-full text-sm" data-testid="dia-a-dia">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="px-3 py-1">Dia</th><th className="px-3 py-1 text-right">Valor</th><th className="px-3 py-1 text-right">Dia anterior</th><th className="px-3 py-1 text-right">Variação</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {curDays.map((d) => {
                const v = valueOn(d);
                const before = valueOn(addDays(d, -1));
                return (
                  <tr key={d}>
                    <td className="px-3 py-1">{formatDate(d)}{d === today && <span className="ml-1 text-xs text-amber-700">(parcial)</span>}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{fmtMetric(metric, v, row.currency)}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-slate-500">{fmtMetric(metric, before, row.currency)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{d === today ? "—" : variationText(monitorVariation(v, before))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>

        <div className="flex flex-wrap justify-end gap-2">
          {row.level === "campaign" && onDrill && (
            <>
              <Button variant="secondary" onClick={() => onDrill("ad_group")}><Layers className="size-4" aria-hidden /> Ver conjuntos desta campanha</Button>
              <Button variant="secondary" onClick={() => onDrill("ad")}><Layers className="size-4" aria-hidden /> Ver anúncios desta campanha</Button>
            </>
          )}
          {row.preview_link && (
            <a href={row.preview_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-brand-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
              <ExternalLink className="size-4" aria-hidden /> Ver prévia oficial
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- criativos

function Thumb({ row, className }: { row: CompareRow; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!row.thumbnail_url || failed) {
    return (
      <div className={cn("flex shrink-0 flex-col items-center justify-center rounded-lg bg-slate-100 text-center text-[10px] text-slate-500", className)} data-testid="sem-previa">
        <ImageOff className="size-5" aria-hidden />
        Prévia indisponível
      </div>
    );
  }
  return (
    <img
      src={row.thumbnail_url}
      alt={`Miniatura de ${row.name ?? "anúncio"}`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-lg bg-slate-100 object-cover", className)}
    />
  );
}

const CARD_METRICS: ComparedMetric[] = ["spend", "results", "cost_per_result", "ctr"];

export function CreativesGrid({ filters, pair }: ReturnType<typeof useMonitorFilters>) {
  const { rows, isLoading, error } = useEvaluatedRows("creative", filters, pair);
  const [open, setOpen] = useState<EvaluatedRow | null>(null);
  const grouped = rows.filter((r) => (r.ads_count ?? 0) > 1).length;

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      <SeveritySummary rows={rows} />
      <Alert tone="info">
        Anúncios que usam o <strong>mesmo criativo</strong> (mesmo código informado pela plataforma) aparecem juntos; nunca agrupamos só porque os nomes são parecidos.
        {grouped === 0 && " Enquanto a plataforma não informar o código do criativo, cada anúncio aparece sozinho."}
      </Alert>
      {isLoading && <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>}
      {!isLoading && rows.length === 0 && <Card className="p-8 text-center text-sm text-slate-500" data-testid="criativos-vazio">Nenhum criativo com dados nos dois períodos.</Card>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.entity_key} className={cn("flex flex-col gap-3 border-l-4 p-3", SEVERITY_LOOK[r.evaluation.worst].border)} data-testid="criativo-card" data-severity={r.evaluation.worst}>
            <div className="flex gap-3">
              <Thumb row={r} className="size-20" />
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setOpen(r)} className="line-clamp-2 text-left text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline">
                  {r.name ?? "Sem nome"}
                </button>
                <p className="truncate text-xs text-slate-500">{r.campaign_name ?? "—"}</p>
                <p className="truncate text-xs text-slate-500">{r.client_name} · {PLATFORM_LABELS[r.platform_id] ?? r.platform_id}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <SeverityBadge severity={r.evaluation.worst} />
                  {r.creative_type && <Badge>{r.creative_type}</Badge>}
                  {(r.ads_count ?? 0) > 1 && <Badge tone="brand">{r.ads_count} anúncios</Badge>}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {CARD_METRICS.map((m) => {
                const e = r.evaluation.metrics[m];
                return (
                  <div key={m} className="flex items-baseline justify-between gap-1">
                    <dt className="text-slate-500">{SHORT_LABEL[m]}</dt>
                    <dd className="text-right tabular-nums">
                      {fmtMetric(m, e.current, r.currency)} <span className={SEVERITY_LOOK[e.severity].text}>{variationText(e.variation)}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        ))}
      </div>
      {open && <EntityDetail row={open} pair={pair} onClose={() => setOpen(null)} />}
    </div>
  );
}

export { LEVEL_LABELS };
