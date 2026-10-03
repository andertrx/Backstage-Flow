import { can, freshness } from "@backstage/shared";
import { Activity, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
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
import { CompareTable, CreativesGrid, FiltersBar, LEVEL_LABELS, useMonitorFilters } from "./compare.tsx";
import { NotifySettings } from "./NotifySettings.tsx";
import { RulesSettings } from "./RulesSettings.tsx";

/** Abas entregues até agora (o histórico completo e a central de tratamento entram nas fases 37.4 a 37.6, sem botões de mentira). */
const TABS = [
  { value: "visao-geral", label: "Visão geral" },
  { value: "alertas", label: "Alertas" },
  { value: "comparativos", label: "Comparativos" },
  { value: "campanhas", label: "Campanhas" },
  { value: "criativos", label: "Criativos" },
  { value: "configuracoes", label: "Configurações" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export function MonitoringPage() {
  const [params, updateParams] = useSearchParamsUpdater();
  const tab: Tab = TABS.some((t) => t.value === params.get("aba")) ? (params.get("aba") as Tab) : "visao-geral";
  const setTab = (value: Tab) =>
    updateParams((latest) => {
      if (value === "visao-geral") latest.delete("aba");
      else latest.set("aba", value);
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
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "configuracoes" ? (
        <div className="space-y-8">
          <EngineSettings />
          <RulesSettings />
          <NotifySettings />
        </div>
      ) : tab === "alertas" ? (
        <AlertsTab />
      ) : tab === "visao-geral" ? (
        <Overview onOpenSettings={() => setTab("configuracoes")} onOpenAlerts={() => setTab("alertas")} />
      ) : (
        <CompareTabs tab={tab} />
      )}
    </div>
  );
}

const COMPARE_LEVELS = ["account", "campaign", "ad_group", "ad"] as const;
type CompareTabLevel = (typeof COMPARE_LEVELS)[number];

/** Comparativos, Campanhas e Criativos: mesmos filtros (no endereço), compartilhados entre as abas. */
function CompareTabs({ tab }: { tab: "comparativos" | "campanhas" | "criativos" }) {
  const f = useMonitorFilters();
  const nivel = f.params.get("nivel");
  const level: CompareTabLevel = (COMPARE_LEVELS as readonly string[]).includes(nivel ?? "") ? (nivel as CompareTabLevel) : "campaign";
  return (
    <div className="space-y-4">
      <FiltersBar {...f} />
      {tab === "comparativos" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Nível da comparação">
            {COMPARE_LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={level === l}
                onClick={() => f.set({ nivel: l === "campaign" ? null : l })}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium", level === l ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
              >
                {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>
          {f.filters.campaignId && (
            <button type="button" onClick={() => f.set({ campanha: null })} className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100" data-testid="filtro-campanha">
              Só uma campanha ✕
            </button>
          )}
        </div>
      )}
      {tab === "criativos" ? (
        <CreativesGrid {...f} />
      ) : (
        // Na aba Campanhas, todas as campanhas (o filtro "só uma campanha" é do Comparativos).
        <CompareTable key={tab === "campanhas" ? "campaign" : level} level={tab === "campanhas" ? "campaign" : level} {...f}
          filters={tab === "campanhas" ? { ...f.filters, campaignId: null } : f.filters} />
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
        <p className="text-xs text-slate-500">
          Atribuir, comentar e registrar providências nos alertas, as notificações e a integração com o dashboard entram nas próximas fases desta etapa.
        </p>
      </section>
    </div>
  );
}
