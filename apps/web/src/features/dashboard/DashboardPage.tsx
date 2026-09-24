import { computeKpis, DEFAULT_TIMEZONE, KPI_DEFINITIONS, type MetricTotals } from "@backstage/shared";
import { useMemo } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useAccountBalances } from "@/features/balance/api.ts";
import { BalanceSection } from "@/features/balance/BalanceSection.tsx";
import { summarizeBalances } from "@/features/balance/summary.ts";
import { useClients } from "@/features/clients/api.ts";
import { cn } from "@/lib/cn.ts";
import { useDashboardSummary } from "./api.ts";
import { ChartsSection } from "./ChartsSection.tsx";
import { resolveFilterPeriod } from "./filters.ts";
import { FiltersBar } from "./FiltersBar.tsx";
import { BalanceCard, KpiCard } from "./KpiCard.tsx";
import { missingReason, pickCurrency } from "./summary.ts";
import { useDashboardFilters } from "./useDashboardFilters.ts";

const EMPTY: MetricTotals = { spend_micros: null, impressions: null, clicks: null, leads: null, messages: null, conversions: null, conversion_value_micros: null };

export function DashboardPage() {
  const { profile } = useAuth();
  const firstName = profile?.full_name.split(" ")[0] || "";
  const { filters, setFilters, clear } = useDashboardFilters();
  const { data: clients = [] } = useClients();

  // As datas seguem o fuso do cliente escolhido (ou o de Brasília).
  const timezone = clients.find((c) => c.id === filters.clientId)?.timezone ?? DEFAULT_TIMEZONE;
  const period = useMemo(() => resolveFilterPeriod(filters, timezone), [filters, timezone]);
  const { data, isLoading, error } = useDashboardSummary(period.current, period.previous, filters);

  const currencies = data?.current.map((r) => r.currency) ?? [];
  const currency = pickCurrency(currencies, filters.currency);
  const row = data?.current.find((r) => r.currency === currency);
  const previousRow = data?.previous.find((r) => r.currency === currency);
  const totals = row ?? EMPTY;
  const kpis = computeKpis(totals);
  const previousKpis = previousRow ? computeKpis(previousRow) : null;
  const hasData = Boolean(row);

  const balanceFilters = { clientId: filters.clientId, platform: filters.platform, accountId: filters.accountId };
  const balances = useAccountBalances(balanceFilters);
  const balanceTotals = summarizeBalances(balances.data ?? [], currency ?? filters.currency);

  const card = (key: (typeof KPI_DEFINITIONS)[number]["key"]) => {
    const definition = KPI_DEFINITIONS.find((d) => d.key === key)!;
    return (
      <KpiCard
        key={key}
        definition={definition}
        value={hasData ? kpis[key] : null}
        previous={previousKpis?.[key] ?? null}
        currency={currency ?? "BRL"}
        missing={hasData ? missingReason(key, totals) : "Sem dados no período."}
        loading={isLoading}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá{firstName && `, ${firstName}`}!</h1>
        <p className="mt-1 text-sm text-slate-500">Resumo geral de desempenho das contas de anúncio.</p>
      </div>

      <FiltersBar filters={filters} period={period} clients={clients} onChange={setFilters} onClear={clear} />

      {error && <Alert tone="error">{error.message}</Alert>}

      {currencies.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Moeda" className="inline-flex rounded-lg bg-slate-100 p-1">
            {currencies.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={c === currency}
                onClick={() => setFilters({ currency: c })}
                className={cn("rounded-md px-3 py-1 text-sm font-medium", c === currency ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Há contas em moedas diferentes. Os valores aparecem separados por moeda, <strong>sem conversão</strong>.
          </p>
        </div>
      )}

      {!isLoading && !error && !hasData && (
        <Alert tone="info">
          Nenhum dado de desempenho neste período com os filtros escolhidos. Os números aparecem depois que a
          sincronização buscar os dados no Meta Ads e no Google Ads.
        </Alert>
      )}

      <section aria-labelledby="resumo-geral" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="resumo-geral" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Resumo geral</h2>
          {row && (
            <p className="text-xs text-slate-500">
              {row.accounts} {row.accounts === 1 ? "conta" : "contas"}
              {row.source_level === "campaign" && ` · ${row.campaigns} ${row.campaigns === 1 ? "campanha" : "campanhas"} (soma das campanhas filtradas)`}
              {row.last_synced_at && ` · atualizado em ${new Date(row.last_synced_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {card("spend")}
          <BalanceCard totals={balanceTotals} loading={balances.isLoading} />
          {card("leads")}
          {card("messages")}
          {card("conversions")}
          {card("cpl")}
          {card("cpc")}
          {card("cpm")}
          {card("ctr")}
          {card("roas")}
        </div>
      </section>

      <ChartsSection range={period.current} filters={filters} currency={currency} />

      <BalanceSection filters={balanceFilters} />
    </div>
  );
}
