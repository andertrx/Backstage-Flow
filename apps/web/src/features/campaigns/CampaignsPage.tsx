import { CAMPAIGN_STATUS_FILTERS, type CampaignStatusFilter, DEFAULT_TIMEZONE, ENTITY_STATUS_LABELS } from "@backstage/shared";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { MetricsTable } from "@/components/data/MetricsTable.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Input } from "@/components/ui/field.tsx";
import { useClients } from "@/features/clients/api.ts";
import { resolveFilterPeriod } from "@/features/dashboard/filters.ts";
import { FiltersBar } from "@/features/dashboard/FiltersBar.tsx";
import { useDashboardFilters } from "@/features/dashboard/useDashboardFilters.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { useCampaignTable } from "./api.ts";
import { COLUMNS } from "./columns.tsx";
import { parseTable, type TableState, writeTable } from "./table.ts";
import { periodQueryString } from "./links.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { DataFreshness } from "@/features/sync/DataFreshness.tsx";

const STATUS_CHIPS: { value: CampaignStatusFilter | null; label: string }[] = [
  { value: null, label: "Todas" },
  { value: "ativa", label: ENTITY_STATUS_LABELS.ativa },
  { value: "pausada", label: ENTITY_STATUS_LABELS.pausada },
  { value: "encerrada", label: ENTITY_STATUS_LABELS.encerrada },
  { value: "erro", label: ENTITY_STATUS_LABELS.erro },
];

export function CampaignsPage() {
  const { filters, setFilters, clear } = useDashboardFilters();
  const [params, updateParams] = useSearchParamsUpdater();
  const table = useMemo(() => parseTable(params), [params]);
  const setTable = useCallback(
    (next: TableState) => updateParams((latest) => writeTable(latest, next)),
    [updateParams],
  );

  const { data: clients = [] } = useClients();
  const timezone = clients.find((c) => c.id === filters.clientId)?.timezone ?? DEFAULT_TIMEZONE;
  const period = useMemo(() => resolveFilterPeriod(filters, timezone), [filters, timezone]);
  const { data, isLoading, isFetching, isPlaceholderData, error } = useCampaignTable(period.current, filters, table);

  // A busca espera a pessoa parar de digitar (0,3 s) antes de consultar o banco.
  const [searchText, setSearchText] = useState(table.search);
  useEffect(() => setSearchText(table.search), [table.search]);
  useEffect(() => {
    if (searchText === table.search) return;
    const t = setTimeout(() => setTable({ ...table, search: searchText, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [searchText, table, setTable]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const mixedCurrency = new Set(rows.map((r) => r.currency)).size > 1;
  /** Ao abrir uma campanha, leva junto o período escolhido. */
  const periodQuery = periodQueryString(params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="mt-1 text-sm text-slate-500">Todas as campanhas com os números do período escolhido.</p>
      </div>

      <FiltersBar filters={filters} period={period} clients={clients} onChange={setFilters} onClear={clear} campaignFields={false} />
      <DataFreshness clientId={filters.clientId} platform={filters.platform} accountId={filters.accountId} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input aria-label="Pesquisar campanhas" placeholder="Pesquisar campanha, cliente ou ID" className="pl-9"
            value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              aria-pressed={table.status === chip.value}
              onClick={() => setTable({ ...table, status: chip.value, page: 1 })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset",
                table.status === chip.value ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
              )}
              title={chip.value ? CAMPAIGN_STATUS_FILTERS[chip.value].map((s) => ENTITY_STATUS_LABELS[s]).join(" ou ") : undefined}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {mixedCurrency && (
        <Alert tone="info">
          Há campanhas em moedas diferentes: cada valor aparece na moeda da sua conta, <strong>sem conversão</strong>.
          Ao ordenar por valores, os números são comparados sem converter a moeda.
        </Alert>
      )}

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando campanhas" />
      ) : rows.length === 0 && !error ? (
        <Alert tone="info">
          {table.search || table.status
            ? "Nenhuma campanha encontrada com esses filtros."
            : "Nenhuma campanha ainda. Elas aparecem depois que a sincronização buscar a estrutura das contas no Meta e no Google."}
        </Alert>
      ) : (
        <MetricsTable
          rows={rows}
          total={total}
          table={table}
          onTableChange={setTable}
          columns={COLUMNS}
          nameLabel="Campanha"
          caption={`Campanhas do período, ordenadas por ${table.sort}`}
          fetching={isFetching}
          stale={isPlaceholderData}
          testId="campaign-row"
          rowKey={(r) => r.campaign_id}
          renderName={(r) => (
            <>
              <Link to={`/campanhas/${r.campaign_id}${periodQuery}`} className="block truncate font-medium text-slate-900 hover:text-brand-700 hover:underline" title={r.name}>
                {r.name}
              </Link>
              <span className="block truncate text-xs text-slate-500">{r.client_name} · {r.account_name}</span>
            </>
          )}
        />
      )}

      <p className="text-xs text-slate-500">
        <strong>—</strong> = sem dados no período ou informação não disponível pela API (passe o mouse para ver o motivo).
        Alcance e frequência aparecem só quando a plataforma informa o alcance do período exato.
      </p>
    </div>
  );
}
