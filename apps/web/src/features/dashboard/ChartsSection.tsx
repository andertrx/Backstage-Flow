import {
  bucketsFor, buildSeries, CHART_METRICS, type ChartMetricKey, type DateRange, GRANULARITY_LABELS, type Granularity, PLATFORM_LABELS,
} from "@backstage/shared";
import { BarChart3, Table2 } from "lucide-react";
import { useMemo } from "react";
import { type ChartLine, TimeSeriesChart } from "@/components/charts/TimeSeriesChart.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { cn } from "@/lib/cn.ts";
import { formatAxisValue, formatKpi } from "@/lib/format.ts";
import { useDashboardTimeseries } from "./api.ts";
import { bucketAxisLabel, bucketTitle } from "./chartLabels.ts";
import type { DashboardFilters } from "./filters.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";

/** Cores por ENTIDADE (nunca pela posição): validadas para daltonismo e contraste. */
const COLORS: Record<string, string> = { total: "#2a78d6", meta: "#2a78d6", google: "#eb6834" };
const GRANULARITIES: Granularity[] = ["day", "week", "month"];
const MAX_DAILY_DAYS = 400;

function useChartParams() {
  const [params, updateParams] = useSearchParamsUpdater();
  const metricKey = (CHART_METRICS.some((m) => m.key === params.get("grafico")) ? params.get("grafico") : "spend") as ChartMetricKey;
  const granularity = (GRANULARITIES as string[]).includes(params.get("agrupar") ?? "") ? (params.get("agrupar") as Granularity) : "day";
  const byPlatform = params.get("porplataforma") === "1";
  const asTable = params.get("vista") === "tabela";
  const set = (k: string, v: string | null) =>
    updateParams((latest) => {
      if (v) latest.set(k, v); else latest.delete(k);
      return latest;
    });
  return { metricKey, granularity, byPlatform, asTable, set };
}

export function ChartsSection({ range, filters, currency }: { range: DateRange; filters: DashboardFilters; currency: string | null }) {
  const { metricKey, granularity: requested, byPlatform, asTable, set } = useChartParams();
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
  const dailyAllowed = days <= MAX_DAILY_DAYS;
  const granularity: Granularity = requested === "day" && !dailyAllowed ? "week" : requested;
  const metric = CHART_METRICS.find((m) => m.key === metricKey)!;

  const { data: rows = [], isLoading, isFetching, error } = useDashboardTimeseries(range, filters, granularity, byPlatform);
  const buckets = useMemo(() => bucketsFor(range, granularity), [range, granularity]);
  const chartCurrency = currency ?? rows[0]?.currency ?? "BRL";
  const series = useMemo(() => buildSeries(rows, buckets, metric, chartCurrency, byPlatform), [rows, buckets, metric, chartCurrency, byPlatform]);

  const lines: ChartLine[] = series.map((s) => ({
    key: s.key,
    label: s.key === "total" ? metric.label : PLATFORM_LABELS[s.key] ?? s.key,
    color: COLORS[s.key] ?? "#64748b",
    values: s.points.map((p) => p.value),
  }));
  const hasValues = lines.some((l) => l.values.some((v) => v != null));
  const fmt = (v: number) => formatKpi(v, metric.format, chartCurrency);
  const xLabels = buckets.map((b) => bucketAxisLabel(b, granularity));
  const titles = buckets.map((b) => bucketTitle(b, granularity));

  return (
    <section aria-labelledby="evolucao" className="space-y-3">
      <h2 id="evolucao" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Evolução</h2>
      <Card className={cn("space-y-4 p-4", isFetching && !isLoading && "opacity-70")}>
        <div className="flex flex-wrap items-center gap-3">
          <Select aria-label="Métrica do gráfico" className="w-auto min-w-40" value={metricKey} onChange={(e) => set("grafico", e.target.value === "spend" ? null : e.target.value)}>
            {CHART_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </Select>
          <div role="group" aria-label="Agrupar por" className="inline-flex rounded-lg bg-slate-100 p-1">
            {GRANULARITIES.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={granularity === g}
                disabled={g === "day" && !dailyAllowed}
                title={g === "day" && !dailyAllowed ? `Para mais de ${MAX_DAILY_DAYS} dias, use semanal ou mensal.` : undefined}
                onClick={() => set("agrupar", g === "day" ? null : g)}
                className={cn("rounded-md px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40",
                  granularity === g ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
              >
                {GRANULARITY_LABELS[g]}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 rounded border-slate-300" checked={byPlatform}
              onChange={(e) => set("porplataforma", e.target.checked ? "1" : null)} />
            Separar por plataforma
          </label>
          <Button variant="ghost" className="ml-auto px-3 py-1.5 text-xs" onClick={() => set("vista", asTable ? null : "tabela")}>
            {asTable ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
            {asTable ? "Ver gráfico" : "Ver tabela"}
          </Button>
        </div>

        {lines.length > 1 && (
          <ul className="flex flex-wrap gap-4 text-xs text-slate-600" aria-label="Legenda">
            {lines.map((l) => (
              <li key={l.key} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: l.color }} aria-hidden />
                {l.label}
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <Alert tone="error">{error.message}</Alert>
        ) : isLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-slate-50" aria-label="Carregando gráfico" />
        ) : !hasValues ? (
          <div className="flex h-64 items-center justify-center rounded-lg bg-slate-50 px-6 text-center text-sm text-slate-500" data-testid="chart-empty">
            {metricKey === "reach"
              ? "O alcance (pessoas únicas) não pode ser somado entre dias nem entre contas. Ele aparece no agrupamento diário quando uma única conta ou campanha está filtrada."
              : rows.length === 0
                ? "Sem dados no período. Os números aparecem depois que a sincronização buscar os dados no Meta Ads e no Google Ads."
                : `${metric.label}: informação não disponível pela API para este filtro.`}
          </div>
        ) : asTable ? (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{metric.label} por período</caption>
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Período</th>
                  {lines.map((l) => <th key={l.key} scope="col" className="py-2 pr-4 text-right font-medium">{l.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {buckets.map((b, i) => (
                  <tr key={b.key} data-testid="chart-table-row">
                    <td className="py-1.5 pr-4 text-slate-600">{titles[i]}</td>
                    {lines.map((l) => (
                      <td key={l.key} className="py-1.5 pr-4 text-right tabular-nums text-slate-900">
                        {l.values[i] == null ? <span className="text-slate-300" title="Sem dados neste período.">—</span> : fmt(l.values[i]!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <TimeSeriesChart
            lines={lines}
            xLabels={xLabels}
            pointTitles={titles}
            formatValue={fmt}
            formatAxis={(v) => formatAxisValue(v, metric.format, chartCurrency)}
            ariaLabel={`Gráfico de ${metric.label} por ${{ day: "dia", week: "semana", month: "mês" }[granularity]}, de ${titles[0]} a ${titles[titles.length - 1]}. Use "Ver tabela" para ler todos os valores.`}
          />
        )}
        <p className="text-xs text-slate-500">
          Valores em {chartCurrency}, sem conversão. Pontos sem dados interrompem a linha (não viram zero).
          {granularity === "week" && " Semanas de segunda a domingo."}
        </p>
      </Card>
    </section>
  );
}
