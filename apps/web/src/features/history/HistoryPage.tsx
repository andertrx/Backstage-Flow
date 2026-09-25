import { computeKpis, DEFAULT_TIMEZONE, isValidRange, KPI_DEFINITIONS, type KpiKey, PLATFORM_LABELS, todayIn } from "@backstage/shared";
import { ArrowLeft, CalendarRange, Database, History } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { useClients } from "@/features/clients/api.ts";
import { useDashboardSummary, useDashboardTimeseries, useFilterAccounts } from "@/features/dashboard/api.ts";
import { CurrencyTabs } from "@/features/dashboard/CurrencyTabs.tsx";
import { type DashboardFilters, PLATFORM_OPTIONS } from "@/features/dashboard/filters.ts";
import { KpiCard } from "@/features/dashboard/KpiCard.tsx";
import { missingReason, pickCurrency } from "@/features/dashboard/summary.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatKpi } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { useHistoryCoverage } from "./api.ts";
import {
  answerSentence,
  checkCoverage,
  coverageText,
  importProgress,
  monthLabel,
  monthOptions,
  previousRange,
  whenText,
} from "./logic.ts";

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string | null) => (v && UUID_RE.test(v) ? v : null);
const KPIS: KpiKey[] = ["spend", "leads", "cpl", "messages", "conversions", "cpa", "impressions", "clicks", "ctr", "cpc", "cpm", "roas"];
const DEF = Object.fromEntries(KPI_DEFINITIONS.map((d) => [d.key, d]));
/** Meta padrão de 13 meses enquanto a cobertura não carrega (mesma regra do banco). */
const fallbackTarget = (today: string) => {
  const [y, m] = today.split("-").map(Number);
  const total = y * 12 + (m - 1) - 12;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
};

export function HistoryPage() {
  const [params, update] = useSearchParamsUpdater();
  const set = (patch: Record<string, string | null>) =>
    update((latest) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v) latest.set(k, v);
        else latest.delete(k);
      }
      return latest;
    });

  const today = todayIn(DEFAULT_TIMEZONE);
  const clientId = uuid(params.get("cliente"));
  const platform = PLATFORM_OPTIONS.some((o) => o.value === params.get("plataforma")) ? params.get("plataforma") : null;
  const accountId = uuid(params.get("conta"));
  const currencyParam = params.get("moeda");

  const { data: clients = [] } = useClients();
  const { data: accounts = [] } = useFilterAccounts();
  const coverage = useHistoryCoverage(clientId, platform, accountId);
  const target = coverage.data?.[0]?.target ?? fallbackTarget(today);
  const months = useMemo(() => monthOptions(target, today), [target, today]);

  // Quando: um mês (padrão: o mês passado) ou um período livre.
  const custom = params.get("de") && params.get("ate") ? { from: params.get("de") as string, to: params.get("ate") as string } : null;
  const customOk = custom && isValidRange(custom) && custom.from <= custom.to && custom.to <= today;
  const ym = customOk ? null : (months.find((m) => m.value === params.get("mes"))?.value ?? months[1]?.value ?? months[0].value);
  const range = customOk ? (custom as { from: string; to: string }) : (months.find((m) => m.value === ym)?.range ?? months[0].range);
  const previous = previousRange(range, ym);

  const filters: DashboardFilters = {
    period: "custom", from: range.from, to: range.to, clientId, platform, accountId, campaignId: null, status: null, currency: null,
  };
  const summary = useDashboardSummary(range, previous, filters);
  const yearRange = { from: months.at(-1)?.range.from ?? range.from, to: today };
  const monthly = useDashboardTimeseries(yearRange, filters, "month", false);

  const currencies = summary.data?.current.map((r) => r.currency) ?? [];
  const currency = pickCurrency(currencies, currencyParam) ?? currencies[0] ?? null;
  const row = summary.data?.current.find((r) => r.currency === currency);
  const prevRow = summary.data?.previous.find((r) => r.currency === currency);
  const now = row ? computeKpis(row) : null;
  const before = prevRow ? computeKpis(prevRow) : null;

  const check = checkCoverage(range, coverage.data ?? []);
  const progress = importProgress(coverage.data ?? [], today);
  const account = accounts.find((a) => a.id === accountId);
  const client = clients.find((c) => c.id === clientId);
  const who = account ? `a conta ${account.name}` : client ? client.name : platform ? `o ${PLATFORM_LABELS[platform]}` : "o total das contas";
  const when = whenText(range, ym);
  const accountOptions = accounts.filter((a) => (!clientId || a.client_id === clientId) && (!platform || a.platform_id === platform));

  const monthRows = useMemo(() => {
    const byMonth = new Map((monthly.data ?? []).filter((r) => r.currency === currency).map((r) => [r.bucket.slice(0, 7), r]));
    const rows = coverage.data ?? [];
    return months.map((m) => {
      const r = byMonth.get(m.value);
      const cov = checkCoverage(m.range, rows).state;
      return { month: m, kpis: r ? computeKpis(r) : null, coverage: cov };
    });
  }, [monthly.data, currency, months, coverage.data]);

  // Enquanto os números novos não chegam, nada de misturar a pergunta nova com a resposta antiga.
  const loading = summary.isLoading || summary.isPlaceholderData || coverage.isLoading || coverage.isPlaceholderData;
  const error = summary.error ?? coverage.error ?? monthly.error;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="size-4" aria-hidden /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pergunte sobre qualquer mês: quanto gastou, quantos leads, qual o CPL. As respostas vêm do histórico guardado no banco, sem depender da API na hora.
        </p>
      </div>

      <Card className="space-y-4 p-4" role="search" aria-label="Pergunta">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Cliente</span>
            <Select value={clientId ?? ""} onChange={(e) => set({ cliente: e.target.value || null, conta: null })}>
              <option value="">Todos os clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Plataforma</span>
            <Select value={platform ?? ""} onChange={(e) => set({ plataforma: e.target.value || null, conta: null })}>
              <option value="">Todas as plataformas</option>
              {PLATFORM_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Conta</span>
            <Select value={accountId ?? ""} onChange={(e) => set({ conta: e.target.value || null })}>
              <option value="">Todas as contas</option>
              {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div role="radiogroup" aria-label="Quando" className="inline-flex rounded-lg bg-slate-100 p-1">
            {([["mes", "Um mês"], ["periodo", "Um período"]] as const).map(([value, label]) => {
              const active = value === "periodo" ? Boolean(customOk) : !customOk;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() =>
                    value === "periodo"
                      ? set({ de: range.from, ate: range.to, mes: null })
                      : set({ de: null, ate: null, mes: ym ?? months[1]?.value ?? null })}
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium", active ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {customOk ? (
            <>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">De</span>
                <Input type="date" value={range.from} max={today}
                  onChange={(e) => e.target.value && set({ de: e.target.value, ...(e.target.value > range.to ? { ate: e.target.value } : {}) })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Até</span>
                <Input type="date" value={range.to} max={today}
                  onChange={(e) => e.target.value && set({ ate: e.target.value, ...(e.target.value < range.from ? { de: e.target.value } : {}) })} />
              </label>
            </>
          ) : (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Mês</span>
              <Select value={ym ?? ""} onChange={(e) => set({ mes: e.target.value })}>
                {months.map((m) => <option key={m.value} value={m.value}>{capitalize(m.label)}</option>)}
              </Select>
            </label>
          )}
        </div>
      </Card>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      <CurrencyTabs currencies={currencies} value={currency} onChange={(c) => set({ moeda: c })} />

      {!loading && check.state !== "completo" && (coverage.data?.length ?? 0) > 0 && (
        <div data-testid="coverage-warning"><Alert tone="warning">
          {check.state === "sem_historico" ? (
            <>
              <strong>Ainda não temos o histórico deste período.</strong> {check.beforeTarget
                ? "O sistema guarda os últimos 13 meses importados das plataformas."
                : "A importação do passado está em andamento: volte daqui a pouco."}
            </>
          ) : (
            <>
              <strong>Resposta parcial:</strong> {check.missing.length === 1 ? "uma conta ainda não tem" : `${check.missing.length} contas ainda não têm`} todo o período no histórico
              {" "}({check.missing.slice(0, 3).map((m) => `${m.name}${m.from ? ` desde ${formatDate(m.from)}` : ""}`).join("; ")}{check.missing.length > 3 ? "…" : ""}).
              {" "}Os números abaixo somam só os dias já guardados.
            </>
          )}
        </Alert></div>
      )}

      <section aria-labelledby="resposta" className="space-y-3">
        <h2 id="resposta" className="sr-only">Resposta</h2>
        <Card className="flex items-start gap-3 p-5" data-testid="history-answer">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><History className="size-5" aria-hidden /></span>
          <div className="min-w-0">
            {loading ? (
              <div className="h-6 w-72 max-w-full animate-pulse rounded bg-slate-100" aria-label="Carregando" />
            ) : row && currency && check.state !== "sem_historico" ? (
              <p className="text-lg font-medium leading-snug text-slate-900" data-testid="history-sentence">{answerSentence(when, who, row, currency)}</p>
            ) : check.state === "sem_historico" && (coverage.data?.length ?? 0) > 0 ? (
              <p className="text-lg font-medium leading-snug text-slate-900" data-testid="history-sentence">{when}: informação ainda não disponível no histórico.</p>
            ) : (
              <p className="text-lg font-medium leading-snug text-slate-900" data-testid="history-sentence">{when}, {who} não teve investimento registrado.</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(range.from)} a {formatDate(range.to)} · comparado com {formatDate(previous.from)} a {formatDate(previous.to)}
            </p>
          </div>
        </Card>

        {!loading && row && currency && now && check.state !== "sem_historico" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="history-kpis">
            {KPIS.map((k) => (
              <KpiCard key={k} definition={DEF[k]} value={now[k]} previous={before?.[k] ?? null} currency={currency} missing={missingReason(k, row)} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="mes-a-mes" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="mes-a-mes" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Mês a mês</h2>
          {currency && <p className="text-xs text-slate-500">Valores em {currency}. Clique num mês para ver os detalhes.</p>}
        </div>
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm" data-testid="history-months">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Mês</th>
                {(["spend", "leads", "cpl", "conversions", "cpa", "roas"] as KpiKey[]).map((k) => (
                  <th key={k} scope="col" className="px-3 py-2 text-right font-medium">{DEF[k].label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthRows.map(({ month, kpis, coverage: cov }) => {
                const selected = month.value === ym;
                return (
                  <tr
                    key={month.value}
                    className={cn("cursor-pointer hover:bg-slate-50", selected && "bg-brand-50/60 hover:bg-brand-50")}
                    onClick={() => set({ mes: month.value, de: null, ate: null })}
                    data-testid="history-month-row"
                    data-month={month.value}
                    aria-selected={selected}
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="font-medium text-slate-800">{capitalize(monthLabel(month.value))}</span>
                      {cov !== "completo" && (
                        <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs", cov === "parcial" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500")}>
                          {cov === "parcial" ? "parcial" : "sem histórico"}
                        </span>
                      )}
                    </td>
                    {(["spend", "leads", "cpl", "conversions", "cpa", "roas"] as KpiKey[]).map((k) => {
                      const v = cov === "sem_historico" ? null : (kpis?.[k] ?? (k === "spend" && !monthly.isLoading ? 0 : null));
                      return (
                        <td key={k} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                          {v == null || !currency ? "—" : formatKpi(v, DEF[k].format, currency)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-slate-500">— = informação não disponível pela API ou mês ainda não importado.</p>
      </section>

      <section aria-labelledby="cobertura" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cobertura" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Database className="size-4" aria-hidden /> Histórico guardado
          </h2>
          {progress != null && (
            <p className="text-xs text-slate-500" data-testid="history-progress">
              {progress >= 100 ? "Últimos 13 meses completos." : `Importação do passado: ${progress}% dos últimos 13 meses.`}
            </p>
          )}
        </div>
        {progress != null && progress < 100 && (
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Importação do histórico">
            <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        )}
        <Card className="divide-y divide-slate-100" data-testid="history-coverage">
          {(coverage.data ?? []).length === 0 && !coverage.isLoading ? (
            <p className="p-4 text-sm text-slate-500">Nenhuma conta vinculada com estes filtros.</p>
          ) : (
            (coverage.data ?? []).map((r) => (
              <div key={r.ad_account_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{r.name}</span>
                  <span className="text-slate-500"> · {r.client_name} · {PLATFORM_LABELS[r.platform_id] ?? r.platform_id}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <CalendarRange className="size-3.5 shrink-0" aria-hidden /> {coverageText(r)}
                </span>
              </div>
            ))
          )}
        </Card>
        <p className="text-xs text-slate-500">
          A cada hora o sistema guarda os últimos dias e, com o tempo que sobra, importa o passado (30 dias por vez) até completar 13 meses.
          Nada é apagado.
        </p>
      </section>
    </div>
  );
}
