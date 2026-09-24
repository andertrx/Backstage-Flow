import { CAMPAIGN_STATUS_FILTERS, type CampaignStatusFilter, DEFAULT_TIMEZONE, ENTITY_STATUS_LABELS } from "@backstage/shared";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/field.tsx";
import { useClients } from "@/features/clients/api.ts";
import { resolveFilterPeriod } from "@/features/dashboard/filters.ts";
import { FiltersBar } from "@/features/dashboard/FiltersBar.tsx";
import { useDashboardFilters } from "@/features/dashboard/useDashboardFilters.ts";
import { cn } from "@/lib/cn.ts";
import { useCampaignTable } from "./api.ts";
import { COLUMNS } from "./columns.tsx";
import { PAGE_SIZE, parseTable, type SortKey, type TableState, toggleSort, writeTable } from "./table.ts";

const STATUS_CHIPS: { value: CampaignStatusFilter | null; label: string }[] = [
  { value: null, label: "Todas" },
  { value: "ativa", label: ENTITY_STATUS_LABELS.ativa },
  { value: "pausada", label: ENTITY_STATUS_LABELS.pausada },
  { value: "encerrada", label: ENTITY_STATUS_LABELS.encerrada },
  { value: "erro", label: ENTITY_STATUS_LABELS.erro },
];

export function CampaignsPage() {
  const { filters, setFilters, clear } = useDashboardFilters();
  const [params, setParams] = useSearchParams();
  const table = useMemo(() => parseTable(params), [params]);
  const setTable = useCallback(
    (next: TableState) => setParams((prev) => writeTable(prev, next), { replace: true }),
    [setParams],
  );

  const { data: clients = [] } = useClients();
  const timezone = clients.find((c) => c.id === filters.clientId)?.timezone ?? DEFAULT_TIMEZONE;
  const period = useMemo(() => resolveFilterPeriod(filters, timezone), [filters, timezone]);
  const { data, isLoading, isFetching, error } = useCampaignTable(period.current, filters, table);

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
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const mixedCurrency = new Set(rows.map((r) => r.currency)).size > 1;

  const sortHeader = (key: SortKey, label: string, hint?: string, numeric?: boolean) => {
    const active = table.sort === key;
    const Icon = !active ? ArrowUpDown : table.desc ? ArrowDown : ArrowUp;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (table.desc ? "descending" : "ascending") : "none"}
        className={cn("whitespace-nowrap px-3 py-2.5 font-medium", numeric && "text-right")}
      >
        <button
          type="button"
          title={hint}
          onClick={() => setTable(toggleSort(table, key))}
          className={cn("inline-flex items-center gap-1 rounded hover:text-slate-900", active && "text-slate-900")}
        >
          {label}
          <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
        <p className="mt-1 text-sm text-slate-500">Todas as campanhas com os números do período escolhido.</p>
      </div>

      <FiltersBar filters={filters} period={period} clients={clients} onChange={setFilters} onClear={clear} campaignFields={false} />

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

      {error && <Alert tone="error">{error.message}</Alert>}
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
        <Card className={cn("overflow-hidden", isFetching && "opacity-70")}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Campanhas do período, ordenadas por {table.sort}</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" aria-sort={table.sort === "name" ? (table.desc ? "descending" : "ascending") : "none"}
                    className="sticky left-0 z-10 min-w-56 bg-slate-50 px-3 py-2.5 font-medium">
                    <button type="button" onClick={() => setTable(toggleSort(table, "name"))}
                      className={cn("inline-flex items-center gap-1 hover:text-slate-900", table.sort === "name" && "text-slate-900")}>
                      Campanha
                      {table.sort === "name" ? (table.desc ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />)
                        : <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />}
                    </button>
                  </th>
                  {COLUMNS.map((c) => sortHeader(c.key, c.label, c.hint, c.numeric))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.campaign_id} data-testid="campaign-row" className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 min-w-56 max-w-72 bg-white px-3 py-2.5">
                      <span className="block truncate font-medium text-slate-900" title={r.name}>{r.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.client_name} · {r.account_name}
                      </span>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={cn("whitespace-nowrap px-3 py-2.5 text-slate-700", c.numeric && "text-right tabular-nums")}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5 text-xs text-slate-500">
            <p data-testid="campaign-count">
              {total === 0 ? "Nenhuma campanha" : `Mostrando ${(table.page - 1) * PAGE_SIZE + 1}–${Math.min(table.page * PAGE_SIZE, total)} de ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="px-3 py-1 text-xs" disabled={table.page <= 1}
                onClick={() => setTable({ ...table, page: table.page - 1 })}>Anterior</Button>
              <span>Página {table.page} de {pages}</span>
              <Button variant="secondary" className="px-3 py-1 text-xs" disabled={table.page >= pages}
                onClick={() => setTable({ ...table, page: table.page + 1 })}>Próxima</Button>
            </div>
          </div>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        <strong>—</strong> = sem dados no período ou informação não disponível pela API (passe o mouse para ver o motivo).
        Alcance e frequência aparecem só quando a plataforma informa o alcance do período exato.
      </p>
    </div>
  );
}
