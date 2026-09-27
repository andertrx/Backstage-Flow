import { type Channel, CHANNEL_LABELS } from "@backstage/shared";
import { GitBranch } from "lucide-react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatMoney } from "@/lib/format.ts";
import type { AttributionRow, QualityRow } from "./api.ts";
import { ATTRIBUTION_MODEL_LABELS, type AttributionModel, attributionMetrics, qualityReport, summarizeByChannel } from "./logic.ts";

const channelName = (c: string | null) => (c ? CHANNEL_LABELS[c as Channel] ?? c : "Sem origem identificada");
const money = (micros: number, currency: string) => formatMoney(micros / 1_000_000, currency);
const revenueText = (revenue: Record<string, number>) =>
  Object.keys(revenue).length === 0 ? "—" : Object.entries(revenue).map(([cur, v]) => money(Number(v), cur)).join(" + ");
const num = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

const MATCH: Record<string, { label: string; tone: "success" | "warning" | "neutral"; hint: string }> = {
  id: { label: "ID da campanha", tone: "success", hint: "Ligada pelo ID da campanha que veio no link do anúncio." },
  nome: { label: "Pelo nome", tone: "warning", hint: "Ligada pelo nome em utm_campaign (só uma campanha com esse nome). Use o ID no link para ter certeza." },
  sem_conversao: { label: "Sem conversão no site", tone: "neutral", hint: "Teve investimento no período, mas nenhum lead ou compra no site foi creditado a ela." },
};
const QUALITY_TONE = { sem_dados: "neutral", boa: "success", atencao: "warning", fraca: "danger" } as const;

/**
 * De onde vêm as conversões do site (Etapa 34.4): cada lead e cada compra
 * creditados a UMA origem (primeiro ou último contato), ligados à campanha
 * pelo ID do anúncio, com o investimento e o que a plataforma contou ao lado.
 */
export function AttributionSection({ rows, quality, model, onModel, isLoading, error, siteName }: {
  rows: AttributionRow[];
  quality: QualityRow[];
  model: AttributionModel;
  onModel: (m: AttributionModel) => void;
  isLoading: boolean;
  error: unknown;
  siteName: (id: string) => string;
}) {
  const channels = summarizeByChannel(rows);
  return (
    <section aria-label="Atribuição" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <GitBranch className="size-4 text-brand-600" aria-hidden /> De onde vêm as conversões
        </h2>
        <div role="group" aria-label="Modelo de atribuição" className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
          {(Object.keys(ATTRIBUTION_MODEL_LABELS) as AttributionModel[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={model === m}
              onClick={() => onModel(m)}
              className={`rounded-md px-3 py-1 font-medium ${model === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              {ATTRIBUTION_MODEL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-500">
        {model === "last"
          ? "Cada lead e cada compra contam para a última origem antes da conversão."
          : "Cada lead e cada compra contam para a primeira origem da pessoa (como ela conheceu o cliente)."}{" "}
        A plataforma conta do jeito dela (janelas de clique e visualização), por isso os números podem ser diferentes.
      </p>
      {error ? <Alert tone="error">{errorMessage(error)}</Alert> : null}

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Canal</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Compras</th>
                  <th className="px-3 py-2 text-right font-medium">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100" data-testid="attr-channels">
                {channels.map((c) => (
                  <tr key={c.channel ?? "-"} data-testid="attr-channel-row">
                    <td className="px-3 py-2 font-medium text-slate-900">{channelName(c.channel)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.purchases}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{revenueText(c.revenue)}</td>
                  </tr>
                ))}
                {channels.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Nenhum lead ou compra no período.</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Campanha</th>
                  <th className="px-3 py-2 text-right font-medium">Leads no site</th>
                  <th className="px-3 py-2 text-right font-medium" title="O que a própria plataforma contou para esta campanha no período.">Leads (plataforma)</th>
                  <th className="px-3 py-2 text-right font-medium">Compras</th>
                  <th className="px-3 py-2 text-right font-medium">Receita no site</th>
                  <th className="px-3 py-2 text-right font-medium">Investimento</th>
                  <th className="px-3 py-2 text-right font-medium">Custo por lead</th>
                  <th className="px-3 py-2 text-right font-medium" title="Receita do site ÷ investimento, só na mesma moeda.">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100" data-testid="attr-campaigns">
                {rows.map((r, i) => {
                  const m = attributionMetrics(r);
                  const match = r.match ? MATCH[r.match] : null;
                  return (
                    <tr key={`${r.client_id}-${r.channel}-${r.campaign_id ?? r.campaign_label ?? i}`} data-testid="attr-campaign-row">
                      <td className="px-3 py-2">
                        <span className="block font-medium text-slate-900">
                          {r.campaign_label ?? (r.channel ? `${channelName(r.channel)} — campanha não identificada` : "Sem origem identificada")}
                        </span>
                        <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                          {r.channel && channelName(r.channel)}
                          {match ? (
                            <Badge tone={match.tone}><span title={match.hint}>{match.label}</span></Badge>
                          ) : r.channel && r.campaign_label ? (
                            <Badge tone="neutral"><span title="Não achamos esta campanha nas contas conectadas (ou há mais de uma com o mesmo nome).">Não ligada a uma campanha</span></Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(r.platform_leads)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.purchases}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{revenueText(r.revenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.spend_micros != null && r.spend_currency ? money(Number(r.spend_micros), r.spend_currency) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.costPerLeadMicros != null && r.spend_currency ? money(m.costPerLeadMicros, r.spend_currency) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.roas != null ? `${m.roas.toLocaleString("pt-BR")}×` : "—"}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Nada para mostrar no período.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {quality.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2" aria-label="Qualidade do tracking">
          {quality.map((q) => {
            const rep = qualityReport(q);
            return (
              <Card key={q.container_id} className="space-y-2 p-4" data-testid="quality-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">Qualidade do tracking · {siteName(q.container_id)}</p>
                  <Badge tone={QUALITY_TONE[rep.level]}>{rep.label}</Badge>
                </div>
                {rep.reasons.length === 0 ? (
                  <p className="text-sm text-slate-600">Origem identificada na maioria das visitas, leads com contato e compras com nº do pedido.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {rep.reasons.map((r) => <li key={r.text}>{r.text}</li>)}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
