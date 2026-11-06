import { can, computeKpis, DEFAULT_TIMEZONE, KPI_DEFINITIONS, type MetricTotals, opsCan } from "@backstage/shared";
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, Info, type LucideIcon, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import { Card } from "@/components/ui/card.tsx";
import { navGroupsFor } from "@/components/layout/navigation.ts";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useAccountBalances } from "@/features/balance/api.ts";
import { summarizeBalances } from "@/features/balance/summary.ts";
import { useActiveClients } from "@/features/clients/api.ts";
import { useUnseenAlertsCount } from "@/features/alerts/api.ts";
import { useDashboardSummary } from "@/features/dashboard/api.ts";
import { CurrencyTabs } from "@/features/dashboard/CurrencyTabs.tsx";
import { parseFilters, resolveFilterPeriod } from "@/features/dashboard/filters.ts";
import { KpiCard } from "@/features/dashboard/KpiCard.tsx";
import { missingReason, pickCurrency } from "@/features/dashboard/summary.ts";
import { useAccountHealth } from "@/features/health/api.ts";
import { useMonitorSummary } from "@/features/monitoring/overviewApi.ts";
import { useOpsDashboard } from "@/features/operations/dashboardApi.ts";
import { useDueReminder } from "@/features/operations/dueReminderApi.ts";
import { useEnviosPendentes } from "@/features/operations/enviosApi.ts";
import { useMyOpsPermissions } from "@/features/operations/api.ts";
import { cn } from "@/lib/cn.ts";
import { buildHojeItems, type HojeInputs, type HojeTone, hojeWatching, saudacao } from "./hojeLogic.ts";
import { useCountUp } from "./useCountUp.ts";

const EMPTY: MetricTotals = { spend_micros: null, impressions: null, clicks: null, leads: null, messages: null, conversions: null, conversion_value_micros: null };
const TONE: Record<HojeTone, { ring: string; chip: string; icon: LucideIcon }> = {
  danger: { ring: "ring-red-200 hover:ring-red-400", chip: "bg-red-50 text-red-700", icon: AlertTriangle },
  warning: { ring: "ring-amber-200 hover:ring-amber-400", chip: "bg-amber-50 text-amber-700", icon: AlertTriangle },
  info: { ring: "ring-blue-200 hover:ring-blue-400", chip: "bg-blue-50 text-blue-700", icon: Info },
};
const HERO_KPIS = ["spend", "leads", "messages", "cpl"] as const;

function Rise({ i, className, children }: { i: number; className?: string; children: React.ReactNode }) {
  return <div className={cn("hoje-rise", className)} style={{ "--i": i } as React.CSSProperties}>{children}</div>;
}

function Count({ value }: { value: number }) {
  return <span className="tabular-nums">{useCountUp(value)}</span>;
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>;
}

/**
 * Etapa 43.2 — "Hoje": a capa do sistema. Mostra, nesta ordem, o que precisa de ação, a saúde das contas,
 * o resultado dos últimos 7 dias e atalhos por área. Cada pessoa vê só o que o papel e as permissões dela alcançam.
 * Tudo vem de consultas que o CRM já faz (nada estimado).
 */
export function HojePage() {
  const { profile } = useAuth();
  const role = profile?.role;
  const ops = useMyOpsPermissions();
  const opsPerms = ops.data ?? null;
  const internal = can(role, "internal.view");
  const canMonitor = can(role, "monitor.view");
  const canEnvios = opsCan(opsPerms, "ops.envios");
  const inOps = opsCan(opsPerms, "ops.access");
  const canCommercial = opsCan(opsPerms, "ops.commercial");

  const { data: clients = [] } = useActiveClients();
  const activeIds = useMemo(() => new Set(clients.map((c) => c.id)), [clients]);

  const envios = useEnviosPendentes(canEnvios);
  const monitor = useMonitorSummary(null, null, canMonitor);
  const unseen = useUnseenAlertsCount(internal);
  const due = useDueReminder(inOps);
  const opsDash = useOpsDashboard({}, inOps);
  const balances = useAccountBalances({ clientId: null, platform: null, accountId: null });
  const health = useAccountHealth();

  const balanceRows = useMemo(() => (balances.data ?? []).filter((r) => activeIds.has(r.client_id)), [balances.data, activeIds]);
  const balance = summarizeBalances(balanceRows, null);
  const syncErrors = (health.data ?? []).filter((r) => activeIds.has(r.client_id)
    && (r.sync_status === "erro" || r.connection_status === "revogada" || r.connection_status === "erro")).length;

  const inputs: HojeInputs = {
    enviosPendentes: canEnvios ? (envios.data ?? []).map((e) => ({ nome: e.nome, horario: e.horario })) : null,
    alertasCriticos: canMonitor ? monitor.data?.open.critico ?? 0 : null,
    alertasAntigosAbertos: internal ? unseen.data ?? 0 : null,
    tarefasVencidas: inOps ? due.data?.tasks.length ?? 0 : null,
    reunioesHoje: inOps ? opsDash.data?.meetings_today ?? 0 : null,
    leadsAtrasados: canCommercial ? opsDash.data?.leads_overdue ?? 0 : null,
    contasSaldoCritico: internal ? balance.critical : null,
    contasComErroDeSync: internal ? syncErrors : null,
  };
  const loading = [envios, monitor, unseen, due, opsDash, balances, health].some((q) => q.isLoading && q.fetchStatus !== "idle");
  const items = buildHojeItems(inputs);
  const watching = hojeWatching(inputs);

  // Resultado dos últimos 7 dias (mesma consulta do Dashboard, com o período padrão).
  const showResults = internal && role !== "equipe" && role !== "vendedor";
  const period = useMemo(() => resolveFilterPeriod(parseFilters(new URLSearchParams()), DEFAULT_TIMEZONE), []);
  const summary = useDashboardSummary(period.current, period.previous, parseFilters(new URLSearchParams()));
  const [wantedCurrency, setCurrency] = useState<string | null>(null);
  const currencies = summary.data?.current.map((r) => r.currency) ?? [];
  const currency = pickCurrency(currencies, wantedCurrency);
  const row = summary.data?.current.find((r) => r.currency === currency);
  const prevRow = summary.data?.previous.find((r) => r.currency === currency);
  const totals = row ?? EMPTY;
  const kpis = computeKpis(totals);
  const previousKpis = prevRow ? computeKpis(prevRow) : null;

  if (role === "cliente") return <Navigate to="/" replace />;

  const firstName = profile?.full_name.split(" ")[0] || "";
  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: DEFAULT_TIMEZONE }).format(new Date());
  const groups = navGroupsFor(role, opsPerms).map((g) => ({ ...g, items: g.items.filter((i) => i.path !== "/") })).filter((g) => g.items.length);
  const urgentFirst = items.findIndex((i) => i.tone === "danger");

  return (
    <div className="space-y-8" data-testid="hoje">
      <Rise i={0}>
        <p className="text-sm font-medium text-blue-700" data-testid="hoje-data">{today.charAt(0).toUpperCase() + today.slice(1)}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{saudacao()}{firstName && `, ${firstName}`}!</h1>
        <p className="mt-1 text-sm text-slate-500">O que precisa de você, como estão as contas e o resultado da semana, num lugar só.</p>
      </Rise>

      <section aria-labelledby="hoje-agora" className="space-y-3" data-testid="hoje-agora">
        <Rise i={1}><SectionTitle id="hoje-agora">Precisa de você agora</SectionTitle></Rise>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-label="Carregando">
            {[0, 1].map((n) => <div key={n} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : items.length === 0 ? (
          <Rise i={2}>
            <Card className="flex items-center gap-3 p-5" data-testid="hoje-tudo-certo">
              <CheckCircle2 className="size-6 text-emerald-600" aria-hidden />
              <div>
                <p className="font-semibold text-slate-900">{watching === 0 ? "Nada para mostrar aqui ainda." : "Tudo em dia."}</p>
                <p className="text-sm text-slate-500">
                  {watching === 0 ? "Use os atalhos abaixo para abrir a sua área." : "Nenhum envio, alerta, tarefa ou conta pedindo ação agora."}
                </p>
              </div>
            </Card>
          </Rise>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((it, idx) => {
              const t = TONE[it.tone];
              const Icon = it.id === "envio" ? Send : it.id === "reunioes" ? CalendarCheck : t.icon;
              return (
                <Rise key={it.id} i={2 + idx}>
                  <Link to={it.to} data-testid={`hoje-item-${it.id}`}
                    className={cn("group flex h-full items-start gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 transition", t.ring, idx === urgentFirst && "hoje-pulse")}>
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-lg font-semibold", t.chip)}>
                      <Count value={it.count} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-900"><Icon className="size-4 shrink-0 opacity-70" aria-hidden />{it.title}</span>
                      {it.detail && <span className="mt-0.5 block text-sm text-slate-500">{it.detail}</span>}
                      <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-700">{it.cta}<ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden /></span>
                    </span>
                  </Link>
                </Rise>
              );
            })}
          </div>
        )}
      </section>

      {internal && (
        <section aria-labelledby="hoje-saude" className="space-y-3" data-testid="hoje-saude">
          <Rise i={3}><SectionTitle id="hoje-saude">Saúde das contas</SectionTitle></Rise>
          <Rise i={4}>
            <Card className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                { label: "Contas ativas", value: balance.total === 0 && !balances.isLoading ? 0 : new Set(balanceRows.map((r) => r.ad_account_id)).size, to: "/contas", hint: "de clientes ativos" },
                { label: "Saldo em alerta", value: balance.alerts, to: "/contas", hint: `${balance.critical} crítica${balance.critical === 1 ? "" : "s"}`, bad: balance.alerts > 0 },
                { label: "Com erro de sincronização", value: syncErrors, to: "/sincronizacao", hint: syncErrors ? "dados podem estar velhos" : "tudo sincronizando", bad: syncErrors > 0 },
              ].map((s) => (
                <Link key={s.label} to={s.to} className="p-4 transition hover:bg-slate-50">
                  <p className="text-sm text-slate-500">{s.label}</p>
                  <p className={cn("mt-1 text-3xl font-semibold tracking-tight", s.bad ? "text-red-600" : "text-slate-900")}><Count value={s.value} /></p>
                  <p className="text-xs text-slate-500">{s.hint}</p>
                </Link>
              ))}
            </Card>
          </Rise>
        </section>
      )}

      {showResults && (
        <section aria-labelledby="hoje-resultado" className="space-y-3" data-testid="hoje-resultado">
          <Rise i={5} className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionTitle id="hoje-resultado">Resultado dos últimos 7 dias</SectionTitle>
            <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">Dashboard completo<ArrowRight className="size-4" aria-hidden /></Link>
          </Rise>
          <CurrencyTabs currencies={currencies} value={currency} onChange={setCurrency} />
          <Rise i={6} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {HERO_KPIS.map((key) => {
              const definition = KPI_DEFINITIONS.find((d) => d.key === key)!;
              return (
                <KpiCard key={key} definition={definition} value={row ? kpis[key] : null} previous={previousKpis?.[key] ?? null}
                  currency={currency ?? "BRL"} missing={row ? missingReason(key, totals) : "Sem dados no período."} loading={summary.isLoading} />
              );
            })}
          </Rise>
        </section>
      )}

      <section aria-labelledby="hoje-atalhos" className="space-y-3" data-testid="hoje-atalhos">
        <Rise i={7}><SectionTitle id="hoje-atalhos">Ir para</SectionTitle></Rise>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g, idx) => (
            <Rise key={g.group} i={8 + idx}>
              <Card className="h-full p-4">
                <h3 className="text-sm font-semibold text-slate-900">{g.group}</h3>
                <ul className="mt-2 space-y-0.5">
                  {g.items.map((it) => (
                    <li key={it.path}>
                      <Link to={it.path} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-700">
                        <it.icon className="size-4 text-slate-400" aria-hidden />{it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </Rise>
          ))}
        </div>
      </section>
    </div>
  );
}
