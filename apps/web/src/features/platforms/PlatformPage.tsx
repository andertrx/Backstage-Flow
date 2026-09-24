import {
  type AdAccountStatus,
  assessBalance,
  computeKpis,
  DEFAULT_TIMEZONE,
  formatAccountId,
  KPI_DEFINITIONS,
  type KpiKey,
  objectiveLabel,
} from "@backstage/shared";
import { ArrowRight, type LucideIcon, Megaphone, Search } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { InfoTooltip } from "@/components/ui/tooltip.tsx";
import { AccountStatusBadge } from "@/features/ad-accounts/AccountStatusBadge.tsx";
import { useAccountBalances } from "@/features/balance/api.ts";
import type { AccountBalance } from "@/features/balance/types.ts";
import { useCampaignTable } from "@/features/campaigns/api.ts";
import { CampaignStatusBadge } from "@/features/campaigns/CampaignStatusBadge.tsx";
import { DEFAULT_TABLE } from "@/features/campaigns/table.ts";
import { useClients } from "@/features/clients/api.ts";
import { useDashboardSummary, useFilterAccounts } from "@/features/dashboard/api.ts";
import { CurrencyTabs } from "@/features/dashboard/CurrencyTabs.tsx";
import { type DashboardFilters, resolveFilterPeriod, serializeFilters } from "@/features/dashboard/filters.ts";
import { FiltersBar } from "@/features/dashboard/FiltersBar.tsx";
import { KpiCard } from "@/features/dashboard/KpiCard.tsx";
import { missingReason, NOT_AVAILABLE, pickCurrency } from "@/features/dashboard/summary.ts";
import { useDashboardFilters } from "@/features/dashboard/useDashboardFilters.ts";
import { formatDateTime, formatKpi, formatMoney } from "@/lib/format.ts";
import { type PeriodReach, usePeriodReach, usePlatformStructure } from "./api.ts";
import { type LevelCount, type PlatformId, platformKpiLabel, type PlatformView, REACH_REASONS, reachScope } from "./logic.ts";

/** Ícone e cor de cada plataforma (mesmas cores do gráfico por plataforma). */
const LOOK: Record<PlatformId, { icon: LucideIcon; className: string }> = {
  meta: { icon: Megaphone, className: "bg-[#2a78d6]/10 text-[#2a78d6]" },
  google: { icon: Search, className: "bg-[#eb6834]/10 text-[#eb6834]" },
};

export function PlatformPage({ view }: { view: PlatformView }) {
  const { filters: urlFilters, setFilters, clear } = useDashboardFilters();
  // Esta tela é de uma plataforma só: o filtro de plataforma é fixo.
  const filters: DashboardFilters = useMemo(() => ({ ...urlFilters, platform: view.id }), [urlFilters, view.id]);
  const { data: clients = [] } = useClients();
  const { data: accounts = [] } = useFilterAccounts();

  const timezone = clients.find((c) => c.id === filters.clientId)?.timezone ?? DEFAULT_TIMEZONE;
  const period = useMemo(() => resolveFilterPeriod(filters, timezone), [filters, timezone]);
  const summary = useDashboardSummary(period.current, period.previous, filters);
  const structure = usePlatformStructure(view.id, filters);
  // Alcance só nas plataformas que mostram alcance (o Google Ads não entra aqui).
  const showsReach = view.kpis.includes("reach");
  const scope = useMemo(
    () => (showsReach ? reachScope(filters, accounts, view.id) : ({ kind: "none", reason: "" } as const)),
    [showsReach, filters, accounts, view.id],
  );
  const reach = usePeriodReach(scope, period.current, period.previous);

  const currencies = summary.data?.current.map((r) => r.currency) ?? [];
  const currency = pickCurrency(currencies, filters.currency);
  const row = summary.data?.current.find((r) => r.currency === currency);
  const previousRow = summary.data?.previous.find((r) => r.currency === currency);
  const withReach = (r: typeof row, pr: PeriodReach | null | undefined) =>
    r ? computeKpis({ ...r, reach: pr?.reach ?? null, frequency: pr?.frequency ?? null }) : null;
  const kpis = withReach(row, reach.data?.current);
  const previousKpis = withReach(previousRow, reach.data?.previous);

  const reachMissing = scope.kind === "none" ? scope.reason : REACH_REASONS.notSynced;
  const missing = (key: KpiKey) => {
    if (!row) return "Sem dados no período.";
    if (key === "reach" || key === "frequency") return reachMissing;
    return missingReason(key, row);
  };

  const query = serializeFilters(filters).toString();
  const Icon = LOOK[view.id].icon;
  const money = view.id === "google" ? "orçamento" : "saldo";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className={`mt-1 grid size-10 place-items-center rounded-xl ${LOOK[view.id].className}`}><Icon className="size-5" aria-hidden /></span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{view.label}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tudo do {view.label} num lugar só: estrutura, desempenho, {money}, status e cobrança das contas.
          </p>
        </div>
      </div>

      <FiltersBar filters={filters} period={period} clients={clients} onChange={setFilters} onClear={clear} lockedPlatform />

      {summary.error && <Alert tone="error">{summary.error.message}</Alert>}

      <StructureSection view={view} counts={structure.data} accounts={accounts.filter((a) => a.platform_id === view.id && (!filters.clientId || a.client_id === filters.clientId) && (!filters.accountId || a.id === filters.accountId)).length} loading={structure.isLoading} query={query} />

      <CurrencyTabs currencies={currencies} value={currency} onChange={(c) => setFilters({ currency: c })} />

      {!summary.isLoading && !summary.error && !row && (
        <Alert tone="info">
          Nenhum dado do {view.label} neste período com os filtros escolhidos. Os números aparecem depois que a
          sincronização buscar os dados na plataforma.
        </Alert>
      )}

      <section aria-labelledby="desempenho" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="desempenho" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Desempenho</h2>
          {row && (
            <p className="text-xs text-slate-500">
              {row.accounts} {row.accounts === 1 ? "conta" : "contas"}
              {row.source_level === "campaign" && ` · ${row.campaigns} ${row.campaigns === 1 ? "campanha" : "campanhas"} (soma das campanhas filtradas)`}
              {row.last_synced_at && ` · atualizado em ${formatDateTime(row.last_synced_at)}`}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="platform-kpis">
          {view.kpis.map((key) => (
            <KpiCard
              key={key}
              definition={(() => {
                const d = KPI_DEFINITIONS.find((x) => x.key === key)!;
                return { ...d, label: platformKpiLabel(view, key, d.label) };
              })()}
              value={kpis?.[key] ?? null}
              previous={previousKpis?.[key] ?? null}
              currency={currency ?? "BRL"}
              missing={missing(key)}
              loading={summary.isLoading || ((key === "reach" || key === "frequency") && reach.isLoading && scope.kind !== "none")}
            />
          ))}
        </div>
      </section>

      <AccountsSection view={view} filters={filters} />

      <TopCampaigns view={view} filters={filters} range={period.current} query={query} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Estrutura: contas, campanhas, conjuntos/grupos e anúncios
// -----------------------------------------------------------------------------
function StructureSection({ view, counts, accounts, loading, query }: {
  view: PlatformView; counts?: Record<"campaign" | "ad_group" | "ad", LevelCount>; accounts: number; loading: boolean; query: string;
}) {
  const tile = (label: string, c: LevelCount | undefined, testId: string, to?: string) => (
    <Card className="flex flex-col gap-1 p-4" role="group" aria-label={label} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-500">{label}</h3>
        {to && (
          <Link to={to} className="text-xs font-medium text-brand-600 hover:underline" aria-label={`Ver ${label.toLowerCase()}`}>
            Ver <ArrowRight className="inline size-3" aria-hidden />
          </Link>
        )}
      </div>
      {loading || !c ? (
        <div className="h-8 w-16 animate-pulse rounded bg-slate-100" aria-label="Carregando" />
      ) : (
        <>
          <p className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="structure-total">{c.total.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-slate-500" data-testid="structure-detail">
            {c.active.toLocaleString("pt-BR")} {c.active === 1 ? "ativo" : "ativos"} · {c.paused.toLocaleString("pt-BR")} {c.paused === 1 ? "pausado" : "pausados"}
            {c.error > 0 && <span className="text-red-700"> · {c.error} com erro</span>}
          </p>
        </>
      )}
    </Card>
  );
  return (
    <section aria-labelledby="estrutura" className="space-y-3">
      <h2 id="estrutura" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Estrutura</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="flex flex-col gap-1 p-4" role="group" aria-label="Contas" data-testid="structure-accounts">
          <h3 className="text-sm font-medium text-slate-500">Contas</h3>
          <p className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="structure-total">{accounts}</p>
          <p className="text-xs text-slate-500">{accounts === 1 ? "vinculada" : "vinculadas"} a clientes</p>
        </Card>
        {tile("Campanhas", counts?.campaign, "structure-campaigns", `/campanhas?${new URLSearchParams([...new URLSearchParams(query), ["plataforma", view.id]]).toString()}`)}
        {tile(view.groupLabel, counts?.ad_group, "structure-groups")}
        {tile("Anúncios", counts?.ad, "structure-ads")}
      </div>
      <p className="text-xs text-slate-500">
        {view.groupLabel} e anúncios são abertos a partir de cada campanha. Status como a plataforma informou na última sincronização.
      </p>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Contas: saldo, status e cobrança
// -----------------------------------------------------------------------------
function AccountsSection({ view, filters }: { view: PlatformView; filters: DashboardFilters }) {
  const { data = [], isLoading, error } = useAccountBalances({ clientId: filters.clientId, platform: view.id, accountId: filters.accountId });
  return (
    <section aria-labelledby="contas-plataforma" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="contas-plataforma" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contas: {view.id === "google" ? "orçamento" : "saldo"}, status e cobrança</h2>
        <Link to="/contas" className="text-xs font-medium text-brand-600 hover:underline">Saúde das contas <ArrowRight className="inline size-3" aria-hidden /></Link>
      </div>
      {error && <Alert tone="error">{error.message}</Alert>}
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : data.length === 0 ? (
        <Alert tone="info">Nenhuma conta do {view.label} vinculada com os filtros escolhidos.</Alert>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((b) => <AccountCard key={b.ad_account_id} b={b} platform={view.id} />)}
        </div>
      )}
    </section>
  );
}

function Row({ label, hint, testId, children }: { label: string; hint?: string; testId?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="flex items-center gap-1 text-slate-500">
        {label}
        {hint && <InfoTooltip label={`Sobre ${label.toLowerCase()}`}>{hint}</InfoTooltip>}
      </dt>
      <dd className="text-right font-medium text-slate-900" data-testid={testId}>{children}</dd>
    </div>
  );
}

function AccountCard({ b, platform }: { b: AccountBalance; platform: PlatformId }) {
  const currency = b.currency ?? "BRL";
  const alerts = assessBalance(b).alerts;
  const missing = <span className="font-normal text-slate-400" title={NOT_AVAILABLE}>Não informado pela API</span>;
  const money = (v: number | null) => (v == null ? missing : formatMoney(v / 1_000_000, currency));
  const payment = b.is_prepay == null ? null : b.is_prepay ? "Pré-paga (saldo antecipado)" : "Pós-paga (cobrança após o gasto)";
  return (
    <Card className="flex flex-col gap-3 p-4" role="group" aria-label={`Conta ${b.name}`} data-testid="platform-account">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{b.name}</p>
          <p className="text-xs text-slate-500">{b.client_name} · {formatAccountId(b.platform_id, b.external_id)}</p>
        </div>
        <AccountStatusBadge status={b.status as AdAccountStatus} />
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        {platform === "google" ? (
          <>
            <Row label="Orçamento" testId="account-budget" hint="Orçamento da conta (faturamento mensal), aprovado no Google Ads.">
              {b.budget_micros == null ? missing : (
                <>
                  {formatMoney(b.budget_micros / 1_000_000, currency)}
                  {b.budget_end_at && <span className="block text-xs font-normal text-slate-500">até {formatDateTime(b.budget_end_at)}</span>}
                </>
              )}
            </Row>
            <Row label="Já veiculado" testId="account-spent" hint="Quanto do orçamento já foi usado, como o Google informa.">{money(b.amount_spent_micros)}</Row>
            <Row label="Disponível no orçamento" testId="account-available" hint="Orçamento − valor já veiculado, quando o Google informa os dois.">{money(b.available_micros)}</Row>
          </>
        ) : (
          <>
            <Row label="Saldo disponível" testId="account-available" hint="Limite de gastos − valor já gasto, quando a plataforma informa os dois. Saldo pré-pago do Meta não tem valor numérico na API.">
              {money(b.available_micros)}
            </Row>
            <Row label="Cobrança" testId="account-billing">{payment ?? missing}</Row>
            <Row label="Forma de pagamento" testId="account-funding" hint="Texto informado pela plataforma, exibido exatamente como veio.">{b.funding_description ?? missing}</Row>
            {b.amount_due_micros != null && <Row label="Valor devido">{formatMoney(b.amount_due_micros / 1_000_000, currency)}</Row>}
          </>
        )}
        <Row label="Problemas de cobrança" testId="account-issues" hint="Pagamento pendente, conta limitada, sem forma de pagamento... como a plataforma informa.">
          {alerts.length > 0 ? (
            <ul className="flex flex-wrap justify-end gap-1.5" aria-label="Problemas de cobrança">
              {alerts.map((alert) => (
                <li key={alert.code}><Badge tone={alert.severity === "critical" ? "danger" : "warning"}>{alert.label}</Badge></li>
              ))}
            </ul>
          ) : b.captured_at ? (
            <span className="font-normal text-emerald-700">Nenhum informado</span>
          ) : (
            <span className="font-normal text-slate-400">Ainda não verificado</span>
          )}
        </Row>
        <Row label="Última verificação">
          <span className="font-normal text-slate-700">{b.captured_at ? formatDateTime(b.captured_at) : <span className="text-slate-400">Ainda não verificada</span>}</span>
        </Row>
      </dl>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Campanhas com mais investimento no período
// -----------------------------------------------------------------------------
function TopCampaigns({ view, filters, range, query }: { view: PlatformView; filters: DashboardFilters; range: { from: string; to: string }; query: string }) {
  const { data, isLoading, error } = useCampaignTable(range, filters, DEFAULT_TABLE);
  const rows = (data?.rows ?? []).filter((r) => r.has_data).slice(0, 5);
  const periodOnly = new URLSearchParams([...new URLSearchParams(query)].filter(([k]) => ["periodo", "de", "ate"].includes(k))).toString();
  const money = (v: number | null, c: string | null) => (v == null ? "—" : formatMoney(v / 1_000_000, c ?? "BRL"));
  return (
    <section aria-labelledby="top-campanhas" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="top-campanhas" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Campanhas com mais investimento</h2>
        <Link to={`/campanhas?${new URLSearchParams([...new URLSearchParams(query), ["plataforma", view.id]]).toString()}`} className="text-xs font-medium text-brand-600 hover:underline">
          Ver todas as campanhas do {view.label} <ArrowRight className="inline size-3" aria-hidden />
        </Link>
      </div>
      {error && <Alert tone="error">{error.message}</Alert>}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="h-24 animate-pulse bg-slate-50" aria-label="Carregando" />
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nenhuma campanha com investimento neste período.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.campaign_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3" data-testid="top-campaign">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <Link to={`/campanhas/${r.campaign_id}${periodOnly ? `?${periodOnly}` : ""}`} className="block truncate font-medium text-slate-900 hover:text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <CampaignStatusBadge status={r.status} />
                    <span>{r.client_name}</span>
                    {r.objective && <span>· {objectiveLabel(r.objective)}</span>}
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-4 text-right text-sm tabular-nums">
                  <div><dt className="text-xs text-slate-500">Investimento</dt><dd className="font-semibold text-slate-900">{money(r.spend_micros, r.currency)}</dd></div>
                  {view.result === "leads" ? (
                    <>
                      <div><dt className="text-xs text-slate-500">Leads</dt><dd className="text-slate-700">{r.leads == null ? "—" : formatKpi(r.leads, "decimal", "BRL")}</dd></div>
                      <div><dt className="text-xs text-slate-500">CPL</dt><dd className="text-slate-700">{money(r.cpl_micros, r.currency)}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt className="text-xs text-slate-500">Conversões</dt><dd className="text-slate-700">{r.conversions == null ? "—" : formatKpi(r.conversions, "decimal", "BRL")}</dd></div>
                      <div><dt className="text-xs text-slate-500">Custo/conv.</dt><dd className="text-slate-700">{money(r.cpa_micros, r.currency)}</dd></div>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
