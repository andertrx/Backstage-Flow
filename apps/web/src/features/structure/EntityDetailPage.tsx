import {
  computeKpis, creativeLabel, KPI_DEFINITIONS, levelLabel, objectiveLabel, optimizationLabel, PLATFORM_LABELS,
  reviewInfo, type StructureLevel,
} from "@backstage/shared";
import { ChevronRight, Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { MetricsTable } from "@/components/data/MetricsTable.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/field.tsx";
import { CampaignStatusBadge } from "@/features/campaigns/CampaignStatusBadge.tsx";
import { budgetColumn, type Column, dash, METRIC_COLUMNS, statusColumn } from "@/features/campaigns/columns.tsx";
import { periodQueryString } from "@/features/campaigns/links.ts";
import { parseTable, SORT_KEYS, type SortKey, type TableState, writeTable } from "@/features/campaigns/table.ts";
import { resolveFilterPeriod } from "@/features/dashboard/filters.ts";
import { KpiCard } from "@/features/dashboard/KpiCard.tsx";
import { missingReason } from "@/features/dashboard/summary.ts";
import { useDashboardFilters } from "@/features/dashboard/useDashboardFilters.ts";
import { cn } from "@/lib/cn.ts";
import { formatDateTime, formatMoney } from "@/lib/format.ts";
import { useChildRows, useEntityChanges, useEntitySummary, useNames } from "./api.ts";
import { describeChange } from "./changes.ts";
import { PeriodPicker } from "./PeriodPicker.tsx";
import type { EntityRow } from "./types.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";

const CHILD: Record<StructureLevel, "ad_group" | "ad" | null> = { campaign: "ad_group", ad_group: "ad", ad: null };
const PATH: Record<StructureLevel, string> = { campaign: "/campanhas", ad_group: "/conjuntos", ad: "/anuncios" };
const STATUS_CHIPS = [
  { value: null, label: "Todos" },
  { value: "ativa", label: "Ativos" },
  { value: "pausada", label: "Pausados" },
  { value: "encerrada", label: "Encerrados" },
  { value: "erro", label: "Com erro" },
] as const;

const REVIEW_TONE = { success: "success", warning: "warning", danger: "danger", neutral: "neutral" } as const;

function ReviewBadge({ value }: { value: string | null }) {
  const info = reviewInfo(value);
  return info ? <Badge tone={REVIEW_TONE[info.tone]}>{info.label}</Badge> : dash();
}

const GROUP_COLUMNS: Column<EntityRow>[] = [
  statusColumn,
  { key: "info:optimization", label: "Otimização", render: (r) => optimizationLabel(r.detail) ?? dash() },
  budgetColumn,
  ...METRIC_COLUMNS,
];
const AD_COLUMNS: Column<EntityRow>[] = [
  statusColumn,
  { key: "info:type", label: "Tipo", render: (r) => creativeLabel(r.detail) ?? dash() },
  { key: "info:review", label: "Revisão", render: (r) => <ReviewBadge value={r.review_status} /> },
  ...METRIC_COLUMNS,
];
const sortsOf = (cols: Column<EntityRow>[]): SortKey[] =>
  ["name", ...cols.map((c) => c.key).filter((k): k is SortKey => (SORT_KEYS as readonly string[]).includes(k))];

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export function EntityDetailPage({ level }: { level: StructureLevel }) {
  const { id } = useParams();
  const { filters, setFilters } = useDashboardFilters();
  const [params, updateParams] = useSearchParamsUpdater();
  const period = useMemo(() => resolveFilterPeriod(filters), [filters]);
  const periodQuery = periodQueryString(params);

  const childLevel = CHILD[level];
  const childColumns = childLevel === "ad" ? AD_COLUMNS : GROUP_COLUMNS;
  const table = useMemo(() => parseTable(params, sortsOf(childColumns)), [params, childColumns]);
  const setTable = useCallback((next: TableState) => updateParams((latest) => writeTable(latest, next)), [updateParams]);

  const summary = useEntitySummary(level, id, period.current, period.previous);
  const entity = summary.data?.current ?? null;
  const previous = summary.data?.previous ?? null;
  const names = useNames(
    level === "ad_group" ? entity?.parent_id : level === "ad" ? entity?.campaign_id : null,
    level === "ad" ? entity?.parent_id : null,
  );
  const children = useChildRows(childLevel ?? "ad", childLevel ? id : undefined, period.current, table);
  const changes = useEntityChanges(level, id);

  const [searchText, setSearchText] = useState(table.search);
  useEffect(() => setSearchText(table.search), [table.search]);
  useEffect(() => {
    if (searchText === table.search) return;
    const t = setTimeout(() => setTable({ ...table, search: searchText, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [searchText, table, setTable]);

  if (summary.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  if (summary.error) return <Alert tone="error">{summary.error.message}</Alert>;
  if (!entity) {
    return (
      <div className="space-y-4">
        <Alert tone="error">Item não encontrado ou você não tem acesso a ele.</Alert>
        <Link to={`/campanhas${periodQuery}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">Voltar para Campanhas</Link>
      </div>
    );
  }

  const platform = entity.platform_id;
  const currency = entity.currency ?? "BRL";
  const kpis = computeKpis(entity);
  const prevKpis = previous?.has_data ? computeKpis(previous) : null;
  const childLabel = childLevel ? levelLabel(childLevel, platform, true) : null;

  const crumbs: { label: string; to?: string }[] = [{ label: "Campanhas", to: `/campanhas${periodQuery}` }];
  if (level === "campaign") crumbs.push({ label: entity.name });
  if (level === "ad_group") crumbs.push({ label: names.data?.campaign ?? "Campanha", to: `/campanhas/${entity.parent_id}${periodQuery}` }, { label: entity.name });
  if (level === "ad") {
    crumbs.push(
      { label: names.data?.campaign ?? "Campanha", to: `/campanhas/${entity.campaign_id}${periodQuery}` },
      { label: names.data?.adGroup ?? levelLabel("ad_group", platform), to: `/conjuntos/${entity.parent_id}${periodQuery}` },
      { label: entity.name },
    );
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        {crumbs.map((c, i) => (
          <span key={i} className="inline-flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
            {c.to ? (
              <Link to={c.to} className="truncate hover:text-brand-700 hover:underline">{c.label}</Link>
            ) : (
              <span aria-current="page" className="truncate font-medium text-slate-900">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap items-start gap-4">
        {level === "ad" && entity.thumbnail_url && (
          <img src={entity.thumbnail_url} alt={`Miniatura do anúncio ${entity.name}`} referrerPolicy="no-referrer" loading="lazy"
            className="size-20 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{levelLabel(level, platform)} · {PLATFORM_LABELS[platform] ?? platform}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{entity.name}</h1>
            <CampaignStatusBadge status={entity.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap">
            <Info label="ID na plataforma">{entity.external_id}</Info>
            {level === "campaign" && <Info label="Objetivo">{objectiveLabel(entity.detail) ?? dash()}</Info>}
            {level === "ad_group" && <Info label="Otimização">{optimizationLabel(entity.detail) ?? dash()}</Info>}
            {level === "ad" && <Info label="Tipo">{creativeLabel(entity.detail) ?? dash()}</Info>}
            {level === "ad" && <Info label="Revisão"><ReviewBadge value={entity.review_status} /></Info>}
            {level !== "ad" && (
              <Info label="Orçamento">
                {entity.budget_micros == null ? dash("Sem orçamento neste nível (pode estar em outro nível).")
                  : `${formatMoney(entity.budget_micros / 1_000_000, currency)}${entity.budget_period === "vitalicio" ? " (total)" : " por dia"}`}
              </Info>
            )}
          </dl>
        </div>
      </div>

      <PeriodPicker filters={filters} period={period} onChange={setFilters} />

      <section aria-labelledby="numeros" className="space-y-3">
        <h2 id="numeros" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Números do período</h2>
        {!entity.has_data && <Alert tone="info">Sem dados deste item no período escolhido.</Alert>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {KPI_DEFINITIONS.map((d) => (
            <KpiCard
              key={d.key}
              definition={d}
              value={entity.has_data ? kpis[d.key] : null}
              previous={prevKpis?.[d.key] ?? null}
              currency={currency}
              missing={entity.has_data ? missingReason(d.key, entity) : "Sem dados no período."}
              loading={summary.isFetching && !summary.data}
            />
          ))}
        </div>
      </section>

      {childLevel && (
        <section aria-labelledby="filhos" className="space-y-3">
          <h2 id="filhos" className="text-sm font-semibold uppercase tracking-wide text-slate-500">{childLabel}</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
              <Input aria-label={`Pesquisar ${childLabel?.toLowerCase()}`} placeholder="Pesquisar por nome ou ID" className="pl-9"
                value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
              {STATUS_CHIPS.map((chip) => (
                <button key={chip.label} type="button" aria-pressed={table.status === chip.value}
                  onClick={() => setTable({ ...table, status: chip.value, page: 1 })}
                  className={cn("rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset",
                    table.status === chip.value ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")}>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          {children.error && <Alert tone="error">{children.error.message}</Alert>}
          {children.isLoading ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
          ) : (children.data?.rows.length ?? 0) === 0 ? (
            <Alert tone="info">
              {table.search || table.status ? "Nada encontrado com esses filtros." : `Nenhum item em "${childLabel}" ainda. Eles aparecem depois que a sincronização buscar a estrutura.`}
            </Alert>
          ) : (
            <MetricsTable
              rows={children.data!.rows}
              total={children.data!.total}
              table={table}
              onTableChange={setTable}
              columns={childColumns}
              nameLabel={levelLabel(childLevel, platform)}
              caption={`${childLabel} de ${entity.name}`}
              fetching={children.isFetching}
              stale={children.isPlaceholderData}
              testId="child-row"
              rowKey={(r) => r.id}
              renderName={(r) => (
                <div className="flex items-center gap-2">
                  {childLevel === "ad" && r.thumbnail_url && (
                    <img src={r.thumbnail_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-8 shrink-0 rounded object-cover ring-1 ring-slate-200" />
                  )}
                  <Link to={`${PATH[childLevel]}/${r.id}${periodQuery}`} title={r.name}
                    className="block truncate font-medium text-slate-900 hover:text-brand-700 hover:underline">{r.name}</Link>
                </div>
              )}
            />
          )}
        </section>
      )}

      <section aria-labelledby="historico" className="space-y-3">
        <h2 id="historico" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Histórico de alterações</h2>
        <Card className="p-4">
          {changes.isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : (changes.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma alteração registrada ainda. Mudanças de status, orçamento e nome aparecem aqui automaticamente.</p>
          ) : (
            <ol className="space-y-2" aria-label="Alterações, das mais recentes para as mais antigas">
              {changes.data!.map((c) => {
                const t = describeChange(c, entity.currency);
                return (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-sm" data-testid="change-item">
                    <span className="text-xs text-slate-400">{formatDateTime(c.changed_at ?? c.detected_at)}</span>
                    <span className="font-medium text-slate-700">{t.label}:</span>
                    <span className="text-slate-500 line-through decoration-slate-300">{t.from}</span>
                    <span aria-hidden>→</span>
                    <span className="sr-only">para</span>
                    <span className="font-medium text-slate-900">{t.to}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </section>
    </div>
  );
}
