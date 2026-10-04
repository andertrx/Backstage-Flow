import { can, type CompareLevel, freshness } from "@backstage/shared";
import { Activity, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { type SyncOverviewRow, useSyncOverview } from "@/features/sync/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { AlertsOverview, AlertsTab, EngineSettings } from "./alerts.tsx";
import { useMonitorRules } from "./api.ts";
import { CompareTable, CreativesGrid, FiltersBar, LEVEL_PARAM, useMonitorFilters } from "./compare.tsx";
import { NotifySettings } from "./NotifySettings.tsx";
import { ObjectiveFilter } from "./objectivesFilter.tsx";
import { HistoryTab, OverviewExtras } from "./overview.tsx";
import { RulesSettings } from "./RulesSettings.tsx";

/**
 * Abas do Monitoramento. Correção de 04/10: Comparativos, Campanhas e Criativos viraram níveis dentro de Alertas
 * (os endereços antigos continuam abrindo o nível certo).
 */
const TABS = [
  { value: "visao-geral", label: "Visão geral" },
  { value: "alertas", label: "Alertas" },
  { value: "historico", label: "Histórico" },
  { value: "configuracoes", label: "Configurações" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** Abas antigas → nível dentro de Alertas. */
const OLD_TABS: Record<string, CompareLevel> = { comparativos: "campaign", campanhas: "campaign", criativos: "creative" };
const OLD_LEVELS: Record<string, CompareLevel> = { account: "account", campaign: "campaign", ad_group: "ad_group", ad: "ad", creative: "creative" };

export function MonitoringPage() {
  const [params, updateParams] = useSearchParamsUpdater();
  const oldTab = params.get("aba") ?? "";
  useEffect(() => {
    if (!(oldTab in OLD_TABS)) return;
    updateParams((latest) => {
      const oldLevel = OLD_LEVELS[latest.get("nivel") ?? ""];
      const level = oldTab === "comparativos" && oldLevel ? oldLevel : OLD_TABS[oldTab];
      latest.set("aba", "alertas");
      latest.set("nivel", LEVEL_PARAM[level]);
      if (oldTab === "campanhas") latest.delete("campanha");
      return latest;
    });
  }, [oldTab, updateParams]);
  const tab: Tab = TABS.some((t) => t.value === params.get("aba")) ? (params.get("aba") as Tab) : "visao-geral";
  const setTab = (value: Tab) =>
    updateParams((latest) => {
      if (value === "visao-geral") latest.delete("aba");
      else latest.set("aba", value);
      // Clicar na aba Alertas abre a lista de alertas (o nível escolhido vale só dentro da aba).
      latest.delete("nivel");
      latest.delete("campanha");
      return latest;
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Activity className="size-6 text-brand-600" aria-hidden /> Monitoramento de Desempenho
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Acompanha as variações das métricas das campanhas e criativos, com limites que você define. Só usa números das plataformas: nada é estimado.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Seções do monitoramento">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-2 py-2 text-sm font-medium sm:px-3",
              tab === t.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "configuracoes" && <ObjectiveFilter />}

      {tab === "configuracoes" ? (
        <div className="space-y-8">
          <EngineSettings />
          <RulesSettings />
          <NotifySettings />
        </div>
      ) : tab === "historico" ? (
        <HistoryTab />
      ) : tab === "visao-geral" ? (
        <Overview onOpenSettings={() => setTab("configuracoes")} onOpenAlerts={() => setTab("alertas")} />
      ) : oldTab in OLD_TABS ? null : (
        <AlertsArea />
      )}
    </div>
  );
}

/** Seletor de nível da aba Alertas: a lista de alertas ou a situação de cada item, nível por nível. */
const ALERT_VIEWS: { level: CompareLevel | null; label: string }[] = [
  { level: null, label: "Alertas" },
  { level: "campaign", label: "Campanhas" },
  { level: "ad_group", label: "Conjuntos" },
  { level: "ad", label: "Anúncios" },
  { level: "creative", label: "Criativos" },
  { level: "account", label: "Contas" },
];
const LEVEL_FROM_PARAM = Object.fromEntries(Object.entries(LEVEL_PARAM).map(([l, p]) => [p, l])) as Record<string, CompareLevel>;

function AlertsArea() {
  const f = useMonitorFilters();
  const level: CompareLevel | null = LEVEL_FROM_PARAM[f.params.get("nivel") ?? ""] ?? null;
  return (
    <div className="space-y-4">
      <div>
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-1" role="group" aria-label="Ver por nível" data-testid="nivel-alertas">
          {ALERT_VIEWS.map((v) => (
            <button
              key={v.label}
              type="button"
              aria-pressed={level === v.level}
              onClick={() => f.set({ nivel: v.level ? LEVEL_PARAM[v.level] : null, campanha: null })}
              className={cn("shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium", level === v.level ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {level === null ? (
        <AlertsTab />
      ) : (
        <>
          <p className="text-sm text-slate-500" data-testid="nivel-explicacao">
            Situação de cada item neste nível, calculada agora pelos limites das Configurações (crítico, atenção, informativo ou normal).
            {level === "ad_group" || level === "creative" || level === "account"
              ? " Neste nível não são criados alertas nem avisos: a lista mostra a situação para você acompanhar."
              : " Os alertas registrados (com responsável e tratamento) ficam na opção Alertas."}
          </p>
          <FiltersBar {...f} />
          {f.filters.campaignId && (
            <button type="button" onClick={() => f.set({ campanha: null })} className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100" data-testid="filtro-campanha">
              Só uma campanha ✕
            </button>
          )}
          {level === "creative" ? <CreativesGrid {...f} /> : <CompareTable key={level} level={level} {...f} />}
        </>
      )}
    </div>
  );
}

type CollectState = "em_dia" | "atrasada" | "erro" | "nunca";

function collectState(r: SyncOverviewRow, now: Date): CollectState {
  if (r.status === "erro") return "erro";
  const f = freshness(r.last_success_at, now);
  if (f === "nunca") return "nunca";
  return f === "desatualizada" ? "atrasada" : "em_dia";
}

const STATE_LOOK: Record<CollectState, { label: string; icon: typeof Clock; tone: string }> = {
  em_dia: { label: "Em dia", icon: CheckCircle2, tone: "text-emerald-700" },
  atrasada: { label: "Atrasada", icon: Clock, tone: "text-amber-700" },
  erro: { label: "Com erro", icon: XCircle, tone: "text-red-700" },
  nunca: { label: "Nunca sincronizada", icon: AlertTriangle, tone: "text-slate-600" },
};

/** Visão geral: alertas abertos e avaliação automática (37.3) e a situação da coleta, que decide se os números podem ser comparados. */
function Overview({ onOpenSettings, onOpenAlerts }: { onOpenSettings: () => void; onOpenAlerts: () => void }) {
  const { profile } = useAuth();
  const { data: accounts = [], isLoading, error } = useSyncOverview();
  const { data: rules = [] } = useMonitorRules();
  const now = new Date();
  const real = accounts.filter((a) => !a.is_test_account);
  const withState = real.map((a) => ({ ...a, state: collectState(a, now) }));
  const count = (s: CollectState) => withState.filter((a) => a.state === s).length;
  const problems = withState.filter((a) => a.state !== "em_dia").sort((a, b) => (a.last_success_at ?? "").localeCompare(b.last_success_at ?? ""));
  const lastSuccess = real.map((a) => a.last_success_at).filter(Boolean).sort().at(-1) ?? null;
  const nextRun = real.map((a) => a.next_run_at).filter((d): d is string => !!d && d > now.toISOString()).sort()[0] ?? null;
  const general = rules.filter((r) => r.scope === "global");
  const specific = rules.filter((r) => r.scope !== "global");

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      <AlertsOverview onOpenAlerts={onOpenAlerts} />

      <OverviewExtras />

      <section aria-labelledby="coleta" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="coleta" className="text-base font-semibold">Situação da coleta</h2>
          <p className="text-xs text-slate-500">
            {lastSuccess ? <>Última atualização: <span title={formatDateTime(lastSuccess)}>{formatRelative(lastSuccess, now)}</span></> : "Nenhuma atualização ainda"}
            {nextRun && <> · Próxima prevista: {formatDateTime(nextRun)}</>}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(["em_dia", "atrasada", "erro", "nunca"] as const).map((s) => {
            const look = STATE_LOOK[s];
            return (
              <Card key={s} className="p-4" data-testid={`coleta-${s}`}>
                <p className={cn("flex items-center gap-1.5 text-sm font-medium", look.tone)}>
                  <look.icon className="size-4" aria-hidden /> {look.label}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{isLoading ? "…" : count(s)}</p>
                <p className="text-xs text-slate-500">conta(s)</p>
              </Card>
            );
          })}
        </div>
        <Alert tone="info">
          Conta com a coleta atrasada ou com erro <strong>não gera alerta de desempenho</strong>: os números podem estar desatualizados.
          As contas atualizam cerca de 1 vez por hora.
        </Alert>
        {problems.length > 0 && (
          <Card className="divide-y divide-slate-100">
            {problems.map((a) => {
              const look = STATE_LOOK[a.state];
              return (
                <div key={a.ad_account_id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{a.client_name} · {a.name}</p>
                    {a.state === "erro" && a.last_error_message && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.last_error_message}</p>}
                  </div>
                  <p className={cn("flex shrink-0 items-center gap-1 text-xs font-medium", look.tone)}>
                    <look.icon className="size-3.5" aria-hidden /> {look.label}
                    {a.last_success_at && <span className="font-normal text-slate-500">· última com sucesso {formatRelative(a.last_success_at, now)}</span>}
                  </p>
                </div>
              );
            })}
          </Card>
        )}
        {can(profile?.role, "sync.run") && problems.length > 0 && (
          <p className="text-xs text-slate-500">
            Para tentar de novo, use <Link className="font-medium text-brand-700 hover:underline" to="/sincronizacao">Sincronização</Link>.
          </p>
        )}
      </section>

      <section aria-labelledby="regras" className="space-y-3">
        <h2 id="regras" className="text-base font-semibold">Regras em vigor</h2>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <p className="text-slate-700">
            <strong className="tabular-nums">{general.filter((r) => r.active).length}</strong> limite(s) geral(is) ativo(s) e{" "}
            <strong className="tabular-nums">{specific.length}</strong> regra(s) específica(s) por cliente, conta, campanha ou anúncio.
          </p>
          <button type="button" onClick={onOpenSettings} className="text-sm font-medium text-brand-700 hover:underline">
            Ver os limites
          </button>
        </Card>
      </section>
    </div>
  );
}
