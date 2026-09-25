import {
  COMPARE_MODE_HINTS,
  COMPARE_MODE_LABELS,
  compareMetric,
  compareRange,
  COMPARISON_DEFINITIONS,
  computeKpis,
  type DateRange,
  daysInRange,
  DEFAULT_TIMEZONE,
  type KpiDefinition,
  type MetricComparison,
  rangesOverlap,
  sameLength,
} from "@backstage/shared";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Minus } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { InfoTooltip } from "@/components/ui/tooltip.tsx";
import { useClients } from "@/features/clients/api.ts";
import { useDashboardSummary } from "@/features/dashboard/api.ts";
import { CurrencyTabs } from "@/features/dashboard/CurrencyTabs.tsx";
import { resolveFilterPeriod } from "@/features/dashboard/filters.ts";
import { FiltersBar } from "@/features/dashboard/FiltersBar.tsx";
import { missingReason, pickCurrency } from "@/features/dashboard/summary.ts";
import { useDashboardFilters } from "@/features/dashboard/useDashboardFilters.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatChange, formatDate, formatDifference, formatKpi } from "@/lib/format.ts";
import { COMPARE_MODES, type CompareChoice, parseCompare, writeCompare } from "./compareParams.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";

const toneClass = { good: "text-emerald-700 bg-emerald-50", bad: "text-red-700 bg-red-50", neutral: "text-slate-600 bg-slate-100" };
const toneWord = { good: "melhora", bad: "piora", neutral: "variação" };

const rangeText = (r: DateRange) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} a ${formatDate(r.to)}`);
const daysText = (r: DateRange) => {
  const n = daysInRange(r);
  return `${n} ${n === 1 ? "dia" : "dias"}`;
};

export function ComparisonPage() {
  const { filters, setFilters, clear } = useDashboardFilters();
  const [params, updateParams] = useSearchParamsUpdater();
  const { search } = useLocation();
  const choice = useMemo(() => parseCompare(params), [params]);
  const setChoice = useCallback((next: CompareChoice) => updateParams((latest) => writeCompare(latest, next)), [updateParams]);
  const { data: clients = [] } = useClients();

  const timezone = clients.find((c) => c.id === filters.clientId)?.timezone ?? DEFAULT_TIMEZONE;
  const current = useMemo(() => resolveFilterPeriod(filters, timezone).current, [filters, timezone]);
  const previous = useMemo(() => compareRange(choice.mode, current, choice), [choice, current]);
  const { data, isLoading, error } = useDashboardSummary(current, previous, filters);

  // Moedas dos dois períodos (a comparação é sempre na mesma moeda).
  const currencies = [...new Set([...(data?.current ?? []), ...(data?.previous ?? [])].map((r) => r.currency))];
  const currency = pickCurrency(currencies, filters.currency);
  const row = data?.current.find((r) => r.currency === currency);
  const previousRow = data?.previous.find((r) => r.currency === currency);
  const kpis = row ? computeKpis(row) : null;
  const previousKpis = previousRow ? computeKpis(previousRow) : null;

  const warnings: string[] = [];
  if (!sameLength(current, previous))
    warnings.push("Os dois períodos têm quantidades de dias diferentes. Totais como investimento e leads tendem a ser maiores no período mais longo; compare de preferência os custos e as taxas (CPL, CPC, CPM, CTR, ROAS).");
  if (rangesOverlap(current, previous)) warnings.push("Os períodos têm dias em comum: esses dias entram nos dois lados da comparação.");

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/${search}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="size-4" aria-hidden /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Comparar períodos</h1>
        <p className="mt-1 text-sm text-slate-500">Veja lado a lado como os números mudaram entre dois períodos, com os mesmos filtros.</p>
      </div>

      <FiltersBar filters={filters} period={{ current, previous }} clients={clients} onChange={setFilters} onClear={clear} />

      <Card className="space-y-3 p-4">
        <div role="radiogroup" aria-label="Comparar com" className="flex flex-wrap gap-2">
          {COMPARE_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={choice.mode === mode}
              onClick={() => setChoice(mode === "custom" ? { mode, from: choice.from ?? previous.from, to: choice.to ?? previous.to } : { mode, from: null, to: null })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset",
                choice.mode === mode ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600 ring-slate-300 hover:text-slate-900",
              )}
            >
              {COMPARE_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{COMPARE_MODE_HINTS[choice.mode]}</p>
        {choice.mode === "custom" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
            <Field label="Comparar de">
              {(id) => (
                <Input id={id} type="date" value={previous.from}
                  onChange={(e) => {
                    // Início depois do fim: o fim acompanha (nunca vira um período inválido).
                    const from = e.target.value;
                    if (from) setChoice({ mode: "custom", from, to: from > previous.to ? from : previous.to });
                  }} />
              )}
            </Field>
            <Field label="Comparar até">
              {(id) => (
                <Input id={id} type="date" value={previous.to}
                  onChange={(e) => {
                    const to = e.target.value;
                    if (to) setChoice({ mode: "custom", from: to < previous.from ? to : previous.from, to });
                  }} />
              )}
            </Field>
          </div>
        )}
      </Card>

      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]" data-testid="compare-periods">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Período atual</p>
          <p className="mt-1 text-lg font-semibold text-slate-900" data-testid="compare-current">{rangeText(current)}</p>
          <p className="text-xs text-slate-500">{daysText(current)}</p>
        </Card>
        <div className="flex items-center justify-center text-sm font-semibold text-slate-400">vs</div>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Comparado com</p>
          <p className="mt-1 text-lg font-semibold text-slate-900" data-testid="compare-previous">{rangeText(previous)}</p>
          <p className="text-xs text-slate-500">{daysText(previous)}</p>
        </Card>
      </div>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}

      <CurrencyTabs currencies={currencies} value={currency} onChange={(c) => setFilters({ currency: c })} />

      {!isLoading && !error && !row && !previousRow && (
        <Alert tone="info">
          Nenhum dado de desempenho nos dois períodos com os filtros escolhidos. Os números aparecem depois que a
          sincronização buscar os dados no Meta Ads e no Google Ads.
        </Alert>
      )}
      {!isLoading && !error && row && !previousRow && (
        <Alert tone="info">
          Não há dados no período de comparação ({rangeText(previous)}). Sem essa base, as diferenças não podem ser calculadas.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Resultado da comparação</h2>
          <div className="hidden items-center gap-3 text-xs text-slate-500 md:flex" aria-hidden>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-[#2a78d6]" /> Atual</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-slate-300" /> Comparação</span>
          </div>
        </div>
        {/* relative: textos só para leitores de tela (posição absoluta) ficam presos à caixa que rola. */}
        <div className="relative hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Comparação de {rangeText(current)} com {rangeText(previous)}{currency ? `, em ${currency}` : ""}
            </caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 font-medium">Métrica</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">Atual</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">Comparação</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">Diferença</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">Variação</th>
                <th scope="col" className="hidden w-40 px-4 py-2.5 font-medium md:table-cell"><span className="sr-only">Visual</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {COMPARISON_DEFINITIONS.map((d) => (
                <ComparisonRow
                  key={d.key}
                  definition={d}
                  current={kpis?.[d.key] ?? null}
                  previous={previousKpis?.[d.key] ?? null}
                  currentMissing={row ? missingReason(d.key, row) : "Sem dados no período."}
                  previousMissing={previousRow ? missingReason(d.key, previousRow) : "Sem dados no período."}
                  currency={currency ?? "BRL"}
                  loading={isLoading}
                />
              ))}
            </tbody>
          </table>
        </div>
        {/* No celular: um bloco por métrica, sem rolagem lateral. */}
        <ul className="divide-y divide-slate-100 md:hidden" aria-label="Resultado da comparação">
          {COMPARISON_DEFINITIONS.map((d) => (
            <ComparisonItem
              key={d.key}
              definition={d}
              current={kpis?.[d.key] ?? null}
              previous={previousKpis?.[d.key] ?? null}
              currency={currency ?? "BRL"}
              loading={isLoading}
            />
          ))}
        </ul>
        <div className="space-y-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <p><strong className="font-medium text-slate-700">Diferença</strong> = atual − comparação. <strong className="font-medium text-slate-700">Variação</strong> = diferença ÷ comparação. No CTR, a diferença é em pontos percentuais (p.p.).</p>
          <p>Verde = melhorou · vermelho = piorou · cinza = depende do objetivo (ex.: investimento). Nunca somamos moedas diferentes.</p>
        </div>
      </Card>
    </div>
  );
}

function VariationBadge({ c }: { c: MetricComparison }) {
  const Arrow = c.trend === "up" ? ArrowUpRight : c.trend === "down" ? ArrowDownRight : Minus;
  if (c.percent == null) return null;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium", toneClass[c.tone])} data-tone={c.tone}>
      <Arrow className="size-3.5" aria-hidden />
      <span className="sr-only">{toneWord[c.tone]} de </span>
      {formatChange(c.percent)}
    </span>
  );
}

function ComparisonItem({ definition, current, previous, currency, loading }: Omit<RowProps, "currentMissing" | "previousMissing">) {
  const c = compareMetric(current, previous, definition);
  const fmt = (v: number | null) => (v == null ? "—" : formatKpi(v, definition.format, currency));
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3" data-testid="compare-card" data-metric={definition.key}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{definition.label}</p>
        {loading ? (
          <div className="mt-1 h-5 w-24 animate-pulse rounded bg-slate-100" aria-label="Carregando" />
        ) : (
          <>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt(current)}</p>
            <p className="text-xs text-slate-500">antes: {fmt(previous)}</p>
          </>
        )}
      </div>
      {!loading && (
        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-right">
          <VariationBadge c={c} />
          <span className="text-xs tabular-nums text-slate-600">
            {c.difference == null ? "sem base de comparação" : formatDifference(c.difference, definition.format, currency)}
          </span>
        </div>
      )}
    </li>
  );
}

interface RowProps {
  definition: KpiDefinition;
  current: number | null;
  previous: number | null;
  currentMissing: string;
  previousMissing: string;
  currency: string;
  loading: boolean;
}

function ComparisonRow({ definition, current, previous, currentMissing, previousMissing, currency, loading }: RowProps) {
  const c = compareMetric(current, previous, definition);
  const dash = (reason: string) => <span className="text-slate-400" title={reason} aria-label={reason}>—</span>;
  const max = Math.max(current ?? 0, previous ?? 0);
  const bar = (v: number | null) => (v == null || v <= 0 || max <= 0 ? 0 : Math.max(2, (v / max) * 100));

  return (
    <tr data-testid="compare-row" data-metric={definition.key} className="hover:bg-slate-50/60">
      <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-900">
        <span className="inline-flex items-center gap-1.5">
          {definition.label}
          <InfoTooltip label={`O que é ${definition.label}?`}>{definition.description}</InfoTooltip>
        </span>
      </th>
      {loading ? (
        <td colSpan={4} className="px-4 py-3"><div className="ml-auto h-4 w-48 animate-pulse rounded bg-slate-100" aria-label="Carregando" /></td>
      ) : (
        <>
          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900" data-testid="compare-current-value">
            {current == null ? dash(currentMissing) : formatKpi(current, definition.format, currency)}
          </td>
          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600" data-testid="compare-previous-value">
            {previous == null ? dash(previousMissing) : formatKpi(previous, definition.format, currency)}
          </td>
          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700" data-testid="compare-difference">
            {c.difference == null ? dash("Precisa dos dois períodos para calcular.") : formatDifference(c.difference, definition.format, currency)}
          </td>
          <td className="whitespace-nowrap px-4 py-3 text-right" data-testid="compare-percent">
            {c.percent == null ? (
              dash(previous === 0 ? "O período de comparação é zero: não dá para calcular a variação em %." : "Precisa dos dois períodos para calcular.")
            ) : (
              <VariationBadge c={c} />
            )}
          </td>
        </>
      )}
      <td className="hidden px-4 py-3 md:table-cell" aria-hidden>
        {!loading && max > 0 && (
          <div className="space-y-1">
            <div className="h-2 rounded-r-sm bg-[#2a78d6]" style={{ width: `${bar(current)}%` }} />
            <div className="h-2 rounded-r-sm bg-slate-300" style={{ width: `${bar(previous)}%` }} />
          </div>
        )}
      </td>
    </tr>
  );
}
