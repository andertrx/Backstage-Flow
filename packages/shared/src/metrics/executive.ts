// Dashboard executivo (Etapa 29): a cadeia Investimento → Resultados → Custo →
// Conversões → ROAS, no consolidado e por cliente / plataforma.
// Regras: nunca somar moedas diferentes; null = a plataforma não informou.
import { roas } from "./formulas.ts";

/** Uma linha de public.executive_breakdown (cliente × plataforma × moeda). */
export interface ExecutiveRow {
  client_id: string;
  client_name: string;
  platform_id: string;
  currency: string;
  spend_micros: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  accounts: number;
}

export interface ExecutiveTotals {
  spend_micros: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  accounts: number;
}

export type ExecutiveKey = "spend" | "results" | "cost_per_result" | "conversions" | "roas";

export interface ExecutiveStep {
  key: ExecutiveKey;
  label: string;
  description: string;
  format: "money" | "decimal" | "ratio";
  /** up = subir é bom · down = subir é ruim · neutral = depende. */
  direction: "up" | "down" | "neutral";
}

/** A cadeia, na ordem pedida. */
export const EXECUTIVE_STEPS: ExecutiveStep[] = [
  { key: "spend", label: "Investimento total", format: "money", direction: "neutral",
    description: "Quanto foi gasto em anúncios no período, somando as contas (sempre dentro da mesma moeda)." },
  { key: "results", label: "Resultados", format: "decimal", direction: "up",
    description: "Leads + mensagens + conversões, como cada plataforma informa. O Google Ads só informa conversões." },
  { key: "cost_per_result", label: "Custo por resultado", format: "money", direction: "down",
    description: "Investimento ÷ resultados. Quanto menor, melhor." },
  { key: "conversions", label: "Conversões", format: "decimal", direction: "up",
    description: "Ações valiosas registradas pela plataforma (compras, cadastros no site...). Faz parte dos resultados." },
  { key: "roas", label: "ROAS", format: "ratio", direction: "up",
    description: "Valor das conversões ÷ investimento. 3,5x = R$ 3,50 de receita para cada R$ 1 investido. Só existe quando a conta informa o valor das conversões." },
];

const add = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : a + b);

/** Soma linhas da MESMA moeda (quem chama agrupa por moeda antes). */
export function sumExecutive(rows: Pick<ExecutiveRow, keyof ExecutiveTotals>[]): ExecutiveTotals {
  return rows.reduce<ExecutiveTotals>(
    (t, r) => ({
      spend_micros: add(t.spend_micros, r.spend_micros),
      leads: add(t.leads, r.leads),
      messages: add(t.messages, r.messages),
      conversions: add(t.conversions, r.conversions),
      conversion_value_micros: add(t.conversion_value_micros, r.conversion_value_micros),
      accounts: t.accounts + r.accounts,
    }),
    { spend_micros: null, leads: null, messages: null, conversions: null, conversion_value_micros: null, accounts: 0 },
  );
}

/** Leads + mensagens + conversões; null se nenhuma das três foi informada. */
export function totalResults(t: Pick<ExecutiveTotals, "leads" | "messages" | "conversions">): number | null {
  return add(add(t.leads, t.messages), t.conversions);
}

export function computeExecutive(t: ExecutiveTotals): Record<ExecutiveKey, number | null> {
  const results = totalResults(t);
  return {
    spend: t.spend_micros == null ? null : t.spend_micros / 1_000_000,
    results,
    cost_per_result: t.spend_micros == null || !results ? null : t.spend_micros / 1_000_000 / results,
    conversions: t.conversions,
    // Sem valor de conversão informado (comum em contas de leads) não é "retorno zero".
    roas: t.conversion_value_micros ? roas(t.conversion_value_micros, t.spend_micros) : null,
  };
}

/** Por que um passo está sem valor (nunca inventamos número). */
export function executiveMissingReason(key: ExecutiveKey, t: ExecutiveTotals): string {
  const results = totalResults(t);
  if (key === "cost_per_result" && results === 0) return "Sem resultados no período.";
  if (key === "roas") {
    if (t.conversion_value_micros === 0) return "Sem valor de conversão informado no período.";
    if (t.spend_micros === 0) return "Sem investimento no período.";
  }
  return "Informação não disponível pela API.";
}

/** Moedas presentes, da de maior investimento para a menor. */
export function executiveCurrencies(rows: ExecutiveRow[]): string[] {
  const spend = new Map<string, number>();
  for (const r of rows) spend.set(r.currency, (spend.get(r.currency) ?? 0) + (r.spend_micros ?? 0));
  return [...spend].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

export interface ExecutiveGroup {
  id: string;
  name: string;
  totals: ExecutiveTotals;
}

/** Agrupa as linhas de UMA moeda por cliente ou por plataforma, do maior investimento ao menor. */
export function groupExecutive(
  rows: ExecutiveRow[],
  currency: string,
  by: "client" | "platform",
  platformName: (id: string) => string = (id) => id,
): ExecutiveGroup[] {
  const groups = new Map<string, { name: string; rows: ExecutiveRow[] }>();
  for (const r of rows) {
    if (r.currency !== currency) continue;
    const id = by === "client" ? r.client_id : r.platform_id;
    const name = by === "client" ? r.client_name : platformName(r.platform_id);
    const g = groups.get(id) ?? { name, rows: [] };
    g.rows.push(r);
    groups.set(id, g);
  }
  return [...groups]
    .map(([id, g]) => ({ id, name: g.name, totals: sumExecutive(g.rows) }))
    .sort((a, b) => (b.totals.spend_micros ?? 0) - (a.totals.spend_micros ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
}
