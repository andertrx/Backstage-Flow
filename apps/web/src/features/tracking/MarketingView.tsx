import { CHANNEL_LABELS, type Channel } from "@backstage/shared";
import { AlertTriangle, Route, Target, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatMoney } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { type AttributionRow, type JourneySummaryRow, useAttribution, useJourneySummary, useTrackingContainers } from "./api.ts";
import {
  ATTRIBUTION_MODEL_LABELS,
  type AttributionModel,
  marketingCampaigns,
  marketingOrigins,
  marketingTotals,
  mergeJourneySummaries,
  PERIOD_LABELS,
  type PeriodPreset,
  periodRange,
} from "./logic.ts";

const channelName = (c: string | null) => (c ? CHANNEL_LABELS[c as Channel] ?? c : "Sem origem identificada");
const money = (micros: number, currency: string) => formatMoney(micros / 1_000_000, currency);
const num = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

/** Texto de uma lista de valores por moeda (nunca soma moedas diferentes). */
const porMoeda = (valores: Record<string, number>, fmt: (v: number, cur: string) => string) => {
  const chaves = Object.keys(valores);
  if (chaves.length === 0) return "—";
  return chaves.map((cur) => fmt(valores[cur], cur)).join(" + ");
};

function Stat({ label, value, hint, testid }: { label: string; value: string; hint?: string; testid?: string }) {
  return (
    <div role="listitem" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-testid={testid}>
      <span className="block text-sm font-medium text-slate-500">{label}</span>
      <span className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
    </div>
  );
}

/**
 * T5.35 (etapa 4): a visão de marketing do Tracking — de onde veio cada venda.
 *
 * Três perguntas, na ordem em que o gestor de tráfego faz:
 *  1. De onde vieram os leads, as compras e a receita (origem × resultado)?
 *  2. Qual foi o caminho da pessoa até comprar (quantas origens, quantos dias)?
 *  3. Onde foi o dinheiro e o que ainda não voltou (investimento sem lead)?
 *
 * Só leitura: os números saem do que o tracking já gravou (tracking_attribution e
 * tracking_journey_summary). Nada é inventado e nada é coletado do cliente.
 */
export function MarketingView({ clientId }: { clientId: string | null }) {
  const [params, updateParams] = useSearchParamsUpdater();
  const period = (["hoje", "7d", "30d"] as const).find((p) => p === params.get("periodo")) ?? "7d";
  const model: AttributionModel = params.get("atribuicao") === "primeiro" ? "first" : "last";
  const set = (key: string, value: string | null) =>
    updateParams((latest) => {
      if (value) latest.set(key, value);
      else latest.delete(key);
      return latest;
    });

  const range = useMemo(() => periodRange(period), [period]);
  const attribution = useAttribution(range.from, range.to, model, true);
  const journey = useJourneySummary(range.from, range.to, true);
  const containers = useTrackingContainers();
  /** Sem site (nem WhatsApp) não há de onde tirar origem: a tela diz isso em vez de mostrar zeros. */
  const semSite = (containers.data ?? [])
    .filter((c) => !clientId || c.client_id === clientId)
    .filter((c) => c.kind !== "whatsapp" && !c.excluded_at).length === 0;

  const rows: AttributionRow[] = (attribution.data ?? []).filter((r) => !clientId || r.client_id === clientId);
  const jRows: JourneySummaryRow[] = (journey.data ?? []).filter((r) => !clientId || r.client_id === clientId);

  const origins = marketingOrigins(rows);
  const campaigns = marketingCampaigns(rows);
  const totals = marketingTotals(rows);
  const caminho = mergeJourneySummaries(jRows);

  const erro = attribution.error ?? journey.error;
  const carregando = attribution.isLoading || journey.isLoading;

  return (
    <section aria-label="Visão de marketing" className="space-y-6" data-testid="marketing-view">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Target className="size-4 text-brand-600" aria-hidden /> De onde veio cada venda
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Quem converteu, por onde chegou e o que o investimento rendeu. Os números saem do que o tracking já gravou:
            nada é estimado e nada é coletado do cliente.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Período</span>
            <Select value={period} onChange={(e) => set("periodo", e.target.value === "7d" ? null : e.target.value)} aria-label="Período">
              {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
            </Select>
          </label>
          <div role="group" aria-label="Modelo de atribuição" className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {(Object.keys(ATTRIBUTION_MODEL_LABELS) as AttributionModel[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={model === m}
                onClick={() => set("atribuicao", m === "first" ? "primeiro" : null)}
                className={`rounded-md px-3 py-1 font-medium ${model === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                {ATTRIBUTION_MODEL_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {erro ? <Alert tone="error">{errorMessage(erro)}</Alert> : null}

      {semSite && !carregando ? (
        <Card className="space-y-1 p-6" data-testid="mk-sem-site">
          <p className="font-medium text-slate-900">
            {clientId ? "Este cliente ainda não tem site configurado." : "Nenhum site configurado ainda."}
          </p>
          <p className="text-sm text-slate-500">
            A visão de marketing mostra o que o tracking coletou dos sites. Cadastre o site do cliente em
            Configurações do Tracking e cole o código de instalação para os dados começarem a chegar.
          </p>
        </Card>
      ) : carregando ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" role="list" aria-label="Resumo do período">
            <Stat label="Leads" value={String(totals.leads)} hint="Pessoas que viraram lead." testid="mk-leads" />
            <Stat label="Compras" value={String(totals.purchases)} hint="Vendas registradas no site." testid="mk-purchases" />
            <Stat label="Receita" value={porMoeda(totals.revenue, money)} hint="Soma por moeda, nunca misturada." testid="mk-receita" />
            <Stat label="Investimento" value={porMoeda(totals.spend, money)} hint="Das campanhas conectadas." testid="mk-investimento" />
            <Stat
              label="Custo por lead"
              value={totals.costPerLeadMicros != null && Object.keys(totals.spend)[0] ? money(totals.costPerLeadMicros, Object.keys(totals.spend)[0]) : "—"}
              hint={Object.keys(totals.spend).length > 1 ? "Há campanhas em mais de uma moeda." : "Investimento ÷ leads."}
              testid="mk-custo-lead"
            />
            <Stat
              label="ROAS"
              value={porMoeda(totals.roas as Record<string, number>, (v) => `${v.toLocaleString("pt-BR")}×`)}
              hint="Receita ÷ investimento, na mesma moeda."
              testid="mk-roas"
            />
          </div>

          {/* 1) Origem × resultado */}
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <TrendingUp className="size-4 text-brand-600" aria-hidden /> Origem × resultado
              </h3>
              <p className="text-xs text-slate-500">
                {model === "last" ? "Cada lead e cada compra contam para a última origem antes da conversão." : "Cada lead e cada compra contam para a primeira origem da pessoa."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 text-right font-medium">Leads</th>
                    <th className="px-3 py-2 text-right font-medium">Compras</th>
                    <th className="px-3 py-2 text-right font-medium">Receita</th>
                    <th className="px-3 py-2 font-medium">Peso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" data-testid="mk-origens">
                  {origins.map((o) => (
                    <tr key={o.channel ?? "-"} data-testid="mk-origem-row">
                      <td className="px-3 py-2 font-medium text-slate-900">{channelName(o.channel)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{o.leads}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{o.purchases}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{porMoeda(o.revenue, money)}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${o.share}%` }} />
                          </span>
                          <span className="text-xs tabular-nums text-slate-500">{o.share}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                  {origins.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nenhum lead ou compra no período escolhido.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 2) O caminho até a venda */}
          <Card className="space-y-3 p-4" data-testid="mk-caminho">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Route className="size-4 text-brand-600" aria-hidden /> O caminho até a venda
            </h3>
            {caminho.leads === 0 ? (
              <p className="text-sm text-slate-500">Nenhum lead no período escolhido, então ainda não há caminho para mostrar.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="Média de origens antes de comprar" value={num(caminho.media_toques)} hint="Quantas vezes a pessoa voltou por um caminho." testid="mk-media-toques" />
                  <Stat label="Dias até a conversão" value={caminho.media_dias != null ? `${num(caminho.media_dias)} dias` : "—"} hint="Da primeira origem até o lead." testid="mk-media-dias" />
                  <Stat label="Caminho mais curto" value={caminho.mais_rapido_dias != null ? `${caminho.mais_rapido_dias} ${caminho.mais_rapido_dias === 1 ? "dia" : "dias"}` : "—"} hint="O menor tempo entre a origem e a conversão." testid="mk-mais-rapido" />
                  <Stat label="Vieram de anúncio" value={`${caminho.origem_paga} de ${caminho.leads}`} hint="Origem paga (confirmada ou provável)." testid="mk-paga" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-600">Como as origens se distribuem antes da conversão</p>
                  <ul className="space-y-1 text-sm text-slate-700" data-testid="mk-distribuicao">
                    <li><strong>{caminho.toques_1}</strong> lead(s) chegaram numa origem só</li>
                    <li><strong>{caminho.toques_2_3}</strong> lead(s) passaram por 2 ou 3 origens</li>
                    <li><strong>{caminho.toques_4p}</strong> lead(s) passaram por 4 ou mais origens</li>
                    {caminho.toques_0 > 0 && <li><strong>{caminho.toques_0}</strong> lead(s) entraram sem origem registrada (acesso direto)</li>}
                  </ul>
                </div>
              </>
            )}
          </Card>

          {/* 3) Onde foi o dinheiro */}
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Target className="size-4 text-brand-600" aria-hidden /> Onde foi o dinheiro
              </h3>
              <p className="text-xs text-slate-500">Campanhas do período, com o investimento e o que elas trouxeram.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Campanha</th>
                    <th className="px-3 py-2 text-right font-medium">Investimento</th>
                    <th className="px-3 py-2 text-right font-medium">Leads</th>
                    <th className="px-3 py-2 text-right font-medium">Compras</th>
                    <th className="px-3 py-2 text-right font-medium">Receita</th>
                    <th className="px-3 py-2 text-right font-medium">Custo por lead</th>
                    <th className="px-3 py-2 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" data-testid="mk-campanhas">
                  {campaigns.map((c, i) => (
                    <tr key={c.campaign_id ?? `sem-${i}`} data-testid="mk-campanha-row">
                      <td className="px-3 py-2">
                        <span className="block font-medium text-slate-900">{c.label}</span>
                        <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                          {c.channel ? channelName(c.channel) : null}
                          {c.sem_lead ? <Badge tone="warning">Sem lead no site</Badge> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.spend_micros != null && c.spend_currency ? money(c.spend_micros, c.spend_currency) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.leads}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.purchases}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{porMoeda(c.revenue, money)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.costPerLeadMicros != null && c.spend_currency ? money(c.costPerLeadMicros, c.spend_currency) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.roas != null ? `${c.roas.toLocaleString("pt-BR")}×` : "—"}</td>
                    </tr>
                  ))}
                  {campaigns.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Nada para mostrar no período escolhido.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 4) O que o investimento não devolveu */}
          {totals.sem_lead.length > 0 && (
            <Card className="space-y-2 border-l-4 border-l-amber-400 p-4" data-testid="mk-sem-lead">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <AlertTriangle className="size-4 text-amber-500" aria-hidden /> Investimento que ainda não voltou
              </h3>
              <p className="text-sm text-slate-600">
                {totals.sem_lead.length} campanha(s) gastaram no período e nenhum lead chegou no site. Pode ser o site sem o script
                instalado, o link sem os parâmetros do anúncio ou a campanha realmente sem resultado — o painel de qualidade do site
                diz qual é o caso.
              </p>
              <ul className="space-y-1 text-sm text-slate-700">
                {totals.sem_lead.map((c, i) => (
                  <li key={c.campaign_id ?? `sem-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{c.label}</span>
                    <span className="tabular-nums text-slate-500">
                      {c.spend_micros != null && c.spend_currency ? `${money(c.spend_micros, c.spend_currency)} sem lead` : "Sem lead"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
