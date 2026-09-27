import {
  ACTION_CATEGORY_LABELS, type ActionCategory, type ActionRow, actionRows, type ClientReportSettings, computeReportKpis, ENTITY_STATUS_LABELS, funnelStages,
  type KpiDirection, kpiVariation, mainResultFor, mainResultValue, PLATFORM_LABELS, reportKpiDefinitions, summaryParts, toReportTotals,
} from "@backstage/shared";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart.tsx";
import { Card } from "@/components/ui/card.tsx";
import { KpiCard } from "@/features/dashboard/KpiCard.tsx";
import { platformLook } from "@/features/platforms/look.ts";
import { cn } from "@/lib/cn.ts";
import { formatAxisValue, formatChange, formatKpi } from "@/lib/format.ts";
import type { ReportAccount, ReportCampaignRow, ReportDailyRow } from "./api.ts";
import { type DailyMetric, dailyValues, joinPt, rangeText, summarySentence } from "./logic.ts";

/** Uma cor só (série única): azul validado da paleta do sistema. */
const LINE = "#2a78d6";
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const toneText = { good: "text-emerald-700", bad: "text-red-700", neutral: "text-slate-600" };

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

function Change({ cur, prev, direction }: { cur: number | null; prev: number | null; direction: KpiDirection }) {
  const v = kpiVariation(cur, prev, direction);
  if (v.percent == null) return <span className="text-slate-400">—</span>;
  return <span className={cn("tabular-nums", toneText[v.tone])}>{formatChange(v.percent)}</span>;
}

export function AccountReport({ account, daily, campaigns, settings, days }: {
  account: ReportAccount;
  daily: ReportDailyRow[];
  campaigns: ReportCampaignRow[];
  settings: ClientReportSettings;
  days: string[];
}) {
  const main = mainResultFor(settings.main_result, account.platform_id);
  const defs = reportKpiDefinitions(main);
  const cur = computeReportKpis(account.cur, main);
  const prev = computeReportKpis(account.prev, main);
  const currency = account.currency;
  const look = platformLook(account.platform_id);
  const Icon = look.icon;
  const on = settings.sections;

  const shown = settings.kpis.filter((k) => cur[k] != null);
  const missing = settings.kpis.filter((k) => cur[k] == null).map((k) => defs[k].label);
  const funnel = funnelStages(account.cur, main);
  const actions = actionRows(account.cur?.actions, account.prev?.actions);
  const prevRange = { from: account.prev_from, to: account.prev_to };

  const charts = useMemo(() => {
    const list: { metric: DailyMetric; title: string; format: "money" | "decimal" | "percent" }[] = [
      { metric: "spend", title: "Investimento por dia", format: "money" },
      { metric: "result", title: `${main.label} por dia`, format: "decimal" },
      { metric: "cost_per_result", title: "Custo por resultado por dia", format: "money" },
      { metric: "ctr", title: account.cur?.link_clicks != null ? "CTR do link por dia" : "CTR por dia", format: "percent" },
    ];
    return list.map((c) => ({ ...c, values: dailyValues(daily, days, c.metric, main) }))
      .filter((c) => c.values.some((v) => v != null));
  }, [daily, days, main, account.cur?.link_clicks]);
  const xLabels = days.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`);
  const titles = days.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} (${WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]})`);

  const byCategory = new Map<ActionCategory, ActionRow[]>();
  for (const a of actions) byCategory.set(a.category, [...(byCategory.get(a.category) ?? []), a]);

  return (
    <section className="space-y-5" aria-label={`Conta ${account.name}`} data-testid="report-account">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3">
        <span className={cn("grid size-9 place-items-center rounded-lg", look.className)}><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-900">{PLATFORM_LABELS[account.platform_id] ?? account.platform_id} · {account.name}</h2>
          <p className="text-xs text-slate-500">
            Valores em {currency} · comparado com {rangeText(prevRange)}
            {main !== settings.main_result && " · no Google Ads o resultado é Conversões"}
          </p>
        </div>
      </div>

      {!account.cur ? (
        <p className="text-sm text-slate-500" data-testid="report-empty">Sem dados desta conta no período.</p>
      ) : (
        <>
          {on.summary && (
            <Card className="print-avoid-break border-l-4 border-l-brand-600 p-4">
              <p className="text-base leading-relaxed text-slate-800" data-testid="report-summary">
                {summarySentence(summaryParts(account.cur, account.prev, main), main, currency)}
              </p>
            </Card>
          )}

          {on.kpis && shown.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 print:grid-cols-4" data-testid="report-kpis">
                {shown.map((k) => (
                  <div key={k} className="print-avoid-break" data-kpi={k}>
                    <KpiCard definition={defs[k]} value={cur[k]} previous={prev[k]} currency={currency} missing="" />
                  </div>
                ))}
              </div>
              {missing.length > 0 && (
                <p className="text-xs text-slate-500" data-testid="report-missing">
                  {joinPt(missing)}: informação não disponível pela plataforma para este período.
                  {missing.includes("Alcance") && " O alcance (pessoas únicas) só aparece quando a plataforma informa para o período exato, em geral nos períodos prontos, como os últimos 7 dias."}
                </p>
              )}
            </div>
          )}

          {on.funnel && funnel.length >= 2 && (
            <div className="print-avoid-break space-y-2">
              <SectionTitle>Do anúncio ao resultado</SectionTitle>
              <Card className="p-4">
                <ol className="flex flex-col gap-2 md:flex-row md:items-stretch" data-testid="report-funnel">
                  {funnel.map((s, i) => (
                    <li key={s.label} className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
                      {i > 0 && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 md:w-28 md:flex-col md:text-center">
                          <ChevronRight className="size-4 rotate-90 text-slate-300 md:rotate-0" aria-hidden />
                          {s.rate != null ? (
                            <span><span className="font-semibold tabular-nums text-slate-700">{formatKpi(s.rate, "percent", currency)}</span> {s.rateLabel}</span>
                          ) : <span>—</span>}
                        </div>
                      )}
                      <div className="flex-1 rounded-lg bg-brand-50 px-3 py-2">
                        <p className="text-xs font-medium text-slate-600">{s.label}</p>
                        <p className="text-xl font-semibold tabular-nums text-slate-900">{formatKpi(s.value, "integer", currency)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          )}

          {on.daily && charts.length > 0 && days.length > 1 && (
            <div className="space-y-2">
              <SectionTitle>Dia a dia</SectionTitle>
              <div className="grid gap-3 lg:grid-cols-2 print:grid-cols-1" data-testid="report-daily">
                {charts.map((c) => (
                  <Card key={c.metric} className="print-avoid-break space-y-2 p-4">
                    <p className="text-sm font-medium text-slate-700">{c.title}</p>
                    <TimeSeriesChart
                      lines={[{ key: c.metric, label: c.title, color: LINE, values: c.values }]}
                      xLabels={xLabels}
                      pointTitles={titles}
                      formatValue={(v) => formatKpi(v, c.format, currency)}
                      formatAxis={(v) => formatAxisValue(v, c.format, currency)}
                      ariaLabel={`${c.title}, ${rangeText({ from: days[0], to: days[days.length - 1] })}`}
                      height={200}
                    />
                  </Card>
                ))}
              </div>
            </div>
          )}

          {on.actions && actions.length > 0 && (
            <div className="space-y-2">
              <SectionTitle>Ações por tipo</SectionTitle>
              <Card className="overflow-x-auto">
                <table className="min-w-full text-sm" data-testid="report-actions">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Ação</th>
                      <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                      <th className="px-3 py-2 text-right font-medium">Custo por ação</th>
                      <th className="px-3 py-2 text-right font-medium">Antes</th>
                      <th className="px-3 py-2 text-right font-medium">Variação</th>
                    </tr>
                  </thead>
                  {[...byCategory].map(([cat, rows]) => (
                    <tbody key={cat} className="divide-y divide-slate-100 print-avoid-break">
                      <tr><th colSpan={5} className="bg-white px-3 pb-1 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{ACTION_CATEGORY_LABELS[cat]}</th></tr>
                      {rows.map((a) => (
                        <tr key={a.id} data-testid="report-action-row">
                          <td className="px-3 py-2 text-slate-900">{a.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatKpi(a.value, "integer", currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.value && cur.spend != null ? formatKpi(cur.spend / a.value, "money", currency) : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{a.previous == null ? "—" : formatKpi(a.previous, "integer", currency)}</td>
                          <td className="px-3 py-2 text-right text-xs"><Change cur={a.value} prev={a.previous} direction={a.id === "messaging_block" ? "down" : "up"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </Card>
              <p className="text-xs text-slate-500">
                Cada ação aparece uma vez (o Meta repete a mesma ação com nomes diferentes). O custo por ação usa o investimento total da conta.
              </p>
            </div>
          )}

          {on.campaigns && campaigns.length > 0 && (
            <div className="space-y-2">
              <SectionTitle>Campanhas</SectionTitle>
              <Card className="overflow-x-auto">
                <table className="min-w-full text-sm" data-testid="report-campaigns">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Campanha</th>
                      <th className="px-3 py-2 text-right font-medium">Investimento</th>
                      <th className="px-3 py-2 text-right font-medium">{main.label}</th>
                      <th className="px-3 py-2 text-right font-medium">Custo por resultado</th>
                      <th className="px-3 py-2 text-right font-medium">Impressões</th>
                      <th className="px-3 py-2 text-right font-medium">Cliques</th>
                      <th className="px-3 py-2 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {campaigns.map((c) => {
                      const t = toReportTotals({ ...c, reach: null, frequency: null, video_views: null })!;
                      const k = computeReportKpis(t, main);
                      const clicks = c.link_clicks ?? c.clicks;
                      const result = mainResultValue(t, main);
                      return (
                        <tr key={c.campaign_id} className="print-avoid-break" data-testid="report-campaign-row">
                          <td className="px-3 py-2">
                            <span className="block font-medium text-slate-900">{c.name}</span>
                            <span className="text-xs text-slate-500">{ENTITY_STATUS_LABELS[c.status] ?? c.status}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{k.spend == null ? "—" : formatKpi(k.spend, "money", currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{result == null ? "—" : formatKpi(result, "decimal", currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{k.cost_per_result == null ? "—" : formatKpi(k.cost_per_result, "money", currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{c.impressions == null ? "—" : formatKpi(c.impressions, "integer", currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{clicks == null ? "—" : formatKpi(clicks, "integer", currency)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{clicks == null || !c.impressions ? "—" : formatKpi((clicks / c.impressions) * 100, "percent", currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
              {account.cur?.link_clicks != null && <p className="text-xs text-slate-500">Cliques e CTR usam os cliques no link.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
