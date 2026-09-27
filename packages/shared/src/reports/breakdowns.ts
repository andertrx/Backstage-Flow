// Divisões do dashboard do cliente (Etapa 19.3): nomes em português, ordem de
// exibição e cálculo da fatia de cada valor. Nada inventado: fatias que a
// plataforma não identificou aparecem como "Não informado".
import { type MainResult, mainResultValue } from "./clientReport.ts";

export type BreakdownDimension = "age" | "gender" | "publisher_platform" | "device" | "hour" | "region" | "city";

export interface BreakdownRow {
  ad_account_id: string;
  dimension: BreakdownDimension;
  value: string;
  spend_micros: number;
  impressions: number;
  clicks: number;
  link_clicks: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  actions: Record<string, number> | null;
}

export const BREAKDOWN_TITLES: Record<BreakdownDimension, string> = {
  age: "Idade",
  gender: "Gênero",
  publisher_platform: "Onde o anúncio apareceu",
  device: "Aparelho",
  hour: "Horário do dia",
  region: "Estados",
  city: "Cidades",
};

const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const VALUE_LABELS: Partial<Record<BreakdownDimension, Record<string, string>>> = {
  gender: { female: "Mulheres", male: "Homens" },
  publisher_platform: { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger", threads: "Threads", whatsapp: "WhatsApp" },
  device: {
    mobile_app: "Celular (aplicativo)", mobile_web: "Celular (navegador)", desktop: "Computador", mobile: "Celular", tablet: "Tablet",
    connected_tv: "TV conectada", other: "Outros aparelhos",
  },
};

export function breakdownLabel(dimension: BreakdownDimension, value: string): string {
  if (value === "unknown") return "Não informado";
  if (dimension === "hour") return `${value}h`;
  return VALUE_LABELS[dimension]?.[value] ?? value;
}

export type BreakdownMetric = "result" | "spend" | "impressions" | "clicks";
export const BREAKDOWN_METRIC_LABELS: Record<BreakdownMetric, string> = {
  result: "Resultado", spend: "Investimento", impressions: "Impressões", clicks: "Cliques",
};

export interface BreakdownItem {
  value: string;
  label: string;
  /** Valor da métrica escolhida (null = a plataforma não informa esta métrica). */
  amount: number | null;
  /** Fatia do total (0–100) quando dá para calcular. */
  share: number | null;
  spend: number;
  result: number | null;
  costPerResult: number | null;
  ctr: number | null;
}

function amountOf(r: BreakdownRow, metric: BreakdownMetric, main: MainResult): number | null {
  switch (metric) {
    case "spend": return r.spend_micros / 1_000_000;
    case "impressions": return r.impressions;
    case "clicks": return r.link_clicks ?? r.clicks;
    case "result": return mainResultValue(r, main);
  }
}

/**
 * Linhas de uma dimensão, na ordem certa: idade na ordem das faixas, horário
 * de 0 a 23, os demais do maior para o menor. "Não informado" sempre por último.
 * Localização: só as `top` maiores; o resto vira "Outros" (soma honesta).
 */
export function breakdownItems(rows: BreakdownRow[], dimension: BreakdownDimension, metric: BreakdownMetric, main: MainResult, top = 10): BreakdownItem[] {
  const list = rows.filter((r) => r.dimension === dimension);
  const total = list.reduce((t, r) => t + (amountOf(r, metric, main) ?? 0), 0);
  let items: BreakdownItem[] = list.map((r) => {
    const amount = amountOf(r, metric, main);
    const result = mainResultValue(r, main);
    const clicks = r.link_clicks ?? r.clicks;
    return {
      value: r.value,
      label: breakdownLabel(dimension, r.value),
      amount,
      share: amount != null && total > 0 ? (amount / total) * 100 : null,
      spend: r.spend_micros / 1_000_000,
      result,
      costPerResult: result ? r.spend_micros / 1_000_000 / result : null,
      ctr: r.impressions ? (clicks / r.impressions) * 100 : null,
    };
  });
  const unknownLast = (a: BreakdownItem, b: BreakdownItem) => Number(a.value === "unknown") - Number(b.value === "unknown");
  if (dimension === "age") {
    items.sort((a, b) => unknownLast(a, b) || AGE_ORDER.indexOf(a.value) - AGE_ORDER.indexOf(b.value));
  } else if (dimension === "hour") {
    const byHour = new Map(items.map((i) => [i.value, i]));
    items = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")).map((h) => byHour.get(h) ?? {
      value: h, label: `${h}h`, amount: 0, share: total > 0 ? 0 : null, spend: 0, result: 0, costPerResult: null, ctr: null,
    });
  } else {
    items.sort((a, b) => unknownLast(a, b) || (b.amount ?? 0) - (a.amount ?? 0));
    if ((dimension === "region" || dimension === "city") && items.length > top + 1) {
      const known = items.filter((i) => i.value !== "unknown");
      const unknown = items.filter((i) => i.value === "unknown");
      const rest = known.slice(top);
      const sum = (k: "amount" | "spend" | "result") => rest.reduce((t, i) => t + (i[k] ?? 0), 0);
      const restResult = sum("result");
      items = [...known.slice(0, top), {
        value: "_outros", label: `Outros (${rest.length})`, amount: sum("amount"), share: total > 0 ? (sum("amount") / total) * 100 : null,
        spend: sum("spend"), result: restResult, costPerResult: restResult ? sum("spend") / restResult : null, ctr: null,
      }, ...unknown];
    }
  }
  return items;
}

/** A métrica padrão das divisões: o resultado principal, se houve algum; senão, impressões. */
export function defaultBreakdownMetric(rows: BreakdownRow[], main: MainResult): BreakdownMetric {
  const any = rows.some((r) => (mainResultValue(r, main) ?? 0) > 0);
  return any ? "result" : "impressions";
}

/** O período pedido está todo coberto? (as divisões começaram a ser guardadas depois) */
export function coverageGap(range: { from: string; to: string }, cov: { covered_from: string; covered_to: string } | null | undefined):
  { kind: "none" } | { kind: "full" } | { kind: "partial"; from: string } {
  if (!cov) return { kind: "none" };
  if (cov.covered_from <= range.from) return { kind: "full" };
  if (cov.covered_from > range.to) return { kind: "none" };
  return { kind: "partial", from: cov.covered_from };
}
