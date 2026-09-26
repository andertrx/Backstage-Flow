import {
  computeExecutive,
  DEFAULT_TIMEZONE,
  EXECUTIVE_STEPS,
  executiveCurrencies,
  executiveMissingReason,
  type ExecutiveGroup,
  type ExecutiveKey,
  type ExecutiveRow,
  groupExecutive,
  PLATFORMS,
  platformName,
  sumExecutive,
} from "@backstage/shared";
import { ArrowDown, ArrowLeft, ArrowRight, Building2, Layers } from "lucide-react";
import { Fragment, useMemo } from "react";
import { Link, useLocation } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useClients } from "@/features/clients/api.ts";
import { CurrencyTabs } from "@/features/dashboard/CurrencyTabs.tsx";
import { resolveFilterPeriod } from "@/features/dashboard/filters.ts";
import { FiltersBar } from "@/features/dashboard/FiltersBar.tsx";
import { KpiCard } from "@/features/dashboard/KpiCard.tsx";
import { pickCurrency } from "@/features/dashboard/summary.ts";
import { useDashboardFilters } from "@/features/dashboard/useDashboardFilters.ts";
import { DataFreshness } from "@/features/sync/DataFreshness.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatKpi } from "@/lib/format.ts";
import { useExecutiveBreakdown } from "./api.ts";

const EMPTY = sumExecutive([]);

export function ExecutivePage() {
  const { filters, setFilters, clear } = useDashboardFilters();
  const { search } = useLocation();
  const { data: clients = [] } = useClients();
  const client = clients.find((c) => c.id === filters.clientId) ?? null;

  // As datas seguem o fuso do cliente escolhido (ou o de Brasília), como no Dashboard.
  const timezone = client?.timezone ?? DEFAULT_TIMEZONE;
  const period = useMemo(() => resolveFilterPeriod(filters, timezone), [filters, timezone]);
  const scope = { clientId: filters.clientId, platform: filters.platform };
  const { data, isLoading, error } = useExecutiveBreakdown(period.current, period.previous, scope);

  const rows = data?.current ?? [];
  const currencies = executiveCurrencies(rows);
  const currency = pickCurrency(currencies, filters.currency);
  const inCurrency = (list: ExecutiveRow[]) => list.filter((r) => r.currency === currency);
  const totals = currency ? sumExecutive(inCurrency(rows)) : EMPTY;
  const previousRows = inCurrency(data?.previous ?? []);
  const previous = previousRows.length ? computeExecutive(sumExecutive(previousRows)) : null;
  const values = computeExecutive(totals);
  const hasData = currency != null;

  const byPlatform = currency ? groupExecutive(rows, currency, "platform", platformName) : [];
  const byClient = currency ? groupExecutive(rows, currency, "client") : [];

  const scopeText = [
    client ? client.name : "Todos os clientes",
    filters.platform ? platformName(filters.platform) : PLATFORMS.map((p) => p.name.replace(" Ads", "")).join(" + "),
  ].join(" · ");
  const individual = Boolean(filters.clientId || filters.platform);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to={`/${search}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <ArrowLeft className="size-3.5" aria-hidden /> Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Visão executiva</h1>
          <p className="mt-1 text-sm text-slate-500">
            Do investimento ao retorno, em uma linha. <span className="font-medium text-slate-700" data-testid="executive-scope">{scopeText}</span>
          </p>
        </div>
        {individual && (
          <Button variant="secondary" onClick={() => setFilters({ clientId: null, platform: null, accountId: null })}>
            <Layers className="size-4" aria-hidden /> Ver consolidado
          </Button>
        )}
      </div>

      <FiltersBar filters={filters} period={period} clients={clients} onChange={setFilters} onClear={clear} campaignFields={false} accountField={false} />
      <DataFreshness clientId={filters.clientId} platform={filters.platform} accountId={null} />

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      <CurrencyTabs currencies={currencies} value={currency} onChange={(c) => setFilters({ currency: c })} />

      {!isLoading && !error && !hasData && (
        <Alert tone="info">Nenhum dado de desempenho neste período com os filtros escolhidos.</Alert>
      )}

      <section aria-labelledby="cadeia" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cadeia" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {individual ? "Resultado individual" : "Consolidado"}
          </h2>
          {hasData && (
            <p className="text-xs text-slate-500">
              {totals.accounts} {totals.accounts === 1 ? "conta" : "contas"} · valores em {currency}, sem conversão de moeda
            </p>
          )}
        </div>
        <ol className="grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]" aria-label="Do investimento ao retorno" data-testid="executive-chain">
          {EXECUTIVE_STEPS.map((step, i) => (
            <Fragment key={step.key}>
              {i > 0 && (
                <li aria-hidden className="flex items-center justify-center text-slate-300">
                  <ArrowDown className="size-5 lg:hidden" />
                  <ArrowRight className="hidden size-5 lg:block" />
                </li>
              )}
              <li className="flex min-w-0 [&>*]:flex-1">
                <KpiCard
                  definition={step}
                  value={hasData ? values[step.key] : null}
                  previous={previous?.[step.key] ?? null}
                  currency={currency ?? "BRL"}
                  missing={hasData ? executiveMissingReason(step.key, totals) : "Sem dados no período."}
                  loading={isLoading}
                />
              </li>
            </Fragment>
          ))}
        </ol>
      </section>

      {hasData && (
        <>
          <Breakdown
            title="Por plataforma"
            icon={Layers}
            testId="executive-platforms"
            groups={byPlatform}
            totalSpend={totals.spend_micros}
            currency={currency!}
            selected={filters.platform}
            onSelect={(id) => setFilters({ platform: id, accountId: null })}
          />
          <Breakdown
            title="Por cliente"
            icon={Building2}
            testId="executive-clients"
            groups={byClient}
            totalSpend={totals.spend_micros}
            currency={currency!}
            selected={filters.clientId}
            onSelect={(id) => setFilters({ clientId: id, accountId: null })}
          />
        </>
      )}
    </div>
  );
}

const COLUMNS: ExecutiveKey[] = ["spend", "results", "cost_per_result", "conversions", "roas"];

function Breakdown({
  title,
  icon: Icon,
  testId,
  groups,
  totalSpend,
  currency,
  selected,
  onSelect,
}: {
  title: string;
  icon: typeof Layers;
  testId: string;
  groups: ExecutiveGroup[];
  totalSpend: number | null;
  currency: string;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const step = (key: ExecutiveKey) => EXECUTIVE_STEPS.find((s) => s.key === key)!;
  const cell = (g: ExecutiveGroup, key: ExecutiveKey) => {
    const v = computeExecutive(g.totals)[key];
    return v == null ? <span className="text-slate-400" title={executiveMissingReason(key, g.totals)}>—</span> : formatKpi(v, step(key).format, currency);
  };
  const share = (g: ExecutiveGroup) => (totalSpend ? ((g.totals.spend_micros ?? 0) / totalSpend) * 100 : null);

  return (
    <section aria-labelledby={`${testId}-title`} className="space-y-3">
      <h2 id={`${testId}-title`} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="size-4" aria-hidden /> {title}
      </h2>
      <Card className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm" data-testid={testId}>
          <caption className="sr-only">{title}: investimento, resultados, custo, conversões e ROAS ({currency})</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">{title.replace("Por ", "")}</th>
              {COLUMNS.map((key) => (
                <th key={key} scope="col" className="px-4 py-3 text-right font-medium">{step(key).label.replace(" total", "")}</th>
              ))}
              <th scope="col" className="px-4 py-3 font-medium">Parte do investimento</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((g) => {
              const pct = share(g);
              const isSelected = g.id === selected;
              return (
                <tr key={g.id} data-testid="executive-row" className={isSelected ? "bg-brand-50/60" : undefined}>
                  <th scope="row" className="px-4 py-3 font-medium text-slate-900">{g.name}</th>
                  {COLUMNS.map((key) => (
                    <td key={key} className="px-4 py-3 text-right tabular-nums text-slate-700">{cell(g, key)}</td>
                  ))}
                  <td className="px-4 py-3">
                    {pct != null && (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">{formatKpi(pct, "percent", currency)}</span>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {isSelected ? (
                      <span className="text-xs font-medium text-brand-700">Em exibição</span>
                    ) : (
                      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" aria-label={`Ver individual: ${g.name}`} onClick={() => onSelect(g.id)}>
                        Ver individual
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
