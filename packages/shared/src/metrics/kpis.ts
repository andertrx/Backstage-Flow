// Indicadores do resumo geral (cards do Dashboard): o que cada um significa,
// como é calculado e se subir é bom ou ruim.
import { cpc, cpl, cpm, ctr, percentChange, roas } from "./formulas.ts";

/** Totais de um período, como vêm do banco (dinheiro em micros; null = não disponível). */
export interface MetricTotals {
  spend_micros: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
}

export type KpiKey = "spend" | "leads" | "messages" | "conversions" | "cpl" | "cpc" | "cpm" | "ctr" | "roas";
export type KpiFormat = "money" | "integer" | "decimal" | "percent" | "ratio";
/** up = subir é bom · down = subir é ruim (custo) · neutral = depende do objetivo. */
export type KpiDirection = "up" | "down" | "neutral";

export interface KpiDefinition {
  key: KpiKey;
  label: string;
  description: string;
  format: KpiFormat;
  direction: KpiDirection;
}

export const KPI_DEFINITIONS: KpiDefinition[] = [
  { key: "spend", label: "Investimento", format: "money", direction: "neutral",
    description: "Quanto foi gasto em anúncios no período, somando as contas filtradas." },
  { key: "leads", label: "Leads", format: "decimal", direction: "up",
    description: "Cadastros recebidos (formulários e leads informados pela plataforma)." },
  { key: "messages", label: "Mensagens", format: "integer", direction: "up",
    description: "Conversas iniciadas pelos anúncios (WhatsApp, Messenger, Direct). O Google Ads não informa esta métrica." },
  { key: "conversions", label: "Conversões", format: "decimal", direction: "up",
    description: "Ações valiosas registradas pela plataforma (compras, cadastros, contatos...). O Google pode ter valores fracionados." },
  { key: "cpl", label: "CPL", format: "money", direction: "down",
    description: "Custo por lead = investimento ÷ leads. Quanto menor, melhor." },
  { key: "cpc", label: "CPC", format: "money", direction: "down",
    description: "Custo por clique = investimento ÷ cliques. Quanto menor, melhor." },
  { key: "cpm", label: "CPM", format: "money", direction: "down",
    description: "Custo por mil impressões = investimento ÷ impressões × 1.000. Mostra quanto custa aparecer." },
  { key: "ctr", label: "CTR", format: "percent", direction: "up",
    description: "Taxa de cliques = cliques ÷ impressões × 100. Mostra o quanto o anúncio chama atenção." },
  { key: "roas", label: "ROAS", format: "ratio", direction: "up",
    description: "Retorno sobre o investimento = valor das conversões ÷ investimento. 3,5x = R$ 3,50 de receita para cada R$ 1 investido." },
];

/** Valores dos indicadores (null = não dá para calcular / não disponível). */
export function computeKpis(t: MetricTotals): Record<KpiKey, number | null> {
  return {
    spend: t.spend_micros == null ? null : t.spend_micros / 1_000_000,
    leads: t.leads,
    messages: t.messages,
    conversions: t.conversions,
    cpl: cpl(t.spend_micros, t.leads),
    cpc: cpc(t.spend_micros, t.clicks),
    cpm: cpm(t.spend_micros, t.impressions),
    ctr: ctr(t.clicks, t.impressions),
    // ROAS só quando a plataforma informou valor de conversão maior que zero.
    roas: t.conversion_value_micros ? roas(t.conversion_value_micros, t.spend_micros) : null,
  };
}

export type VariationTone = "good" | "bad" | "neutral";

export interface Variation {
  /** Variação em %, ou null quando não dá para comparar. */
  percent: number | null;
  trend: "up" | "down" | "flat" | null;
  tone: VariationTone;
}

/** Compara com o período anterior e diz se a mudança é boa, ruim ou neutra. */
export function kpiVariation(current: number | null, previous: number | null, direction: KpiDirection): Variation {
  const percent = percentChange(current, previous);
  if (percent == null) return { percent: null, trend: null, tone: "neutral" };
  if (Math.abs(percent) < 0.05) return { percent: 0, trend: "flat", tone: "neutral" };
  const trend = percent > 0 ? "up" : "down";
  if (direction === "neutral") return { percent, trend, tone: "neutral" };
  const good = (trend === "up") === (direction === "up");
  return { percent, trend, tone: good ? "good" : "bad" };
}
