/**
 * Central de Operações (Etapa 36.4): Kanban comercial. Nomes em português e
 * somas por moeda (nunca somar BRL com USD). As regras ficam no banco.
 */
export const OPS_LEAD_CATEGORIES = ["aberto", "ganho", "perdido"] as const;
export type OpsLeadCategory = (typeof OPS_LEAD_CATEGORIES)[number];
export const OPS_LEAD_CATEGORY_LABELS: Record<OpsLeadCategory, string> = {
  aberto: "Em aberto (negociação)",
  ganho: "Ganho (pode virar cliente)",
  perdido: "Perdido (exige motivo)",
};

export const OPS_LEAD_KINDS = ["contato", "reuniao", "proposta", "contrato", "observacao"] as const;
export type OpsLeadKind = (typeof OPS_LEAD_KINDS)[number];
export const OPS_LEAD_KIND_LABELS: Record<OpsLeadKind, string> = {
  contato: "Contato realizado",
  reuniao: "Reunião",
  proposta: "Proposta",
  contrato: "Contrato",
  observacao: "Observação",
};

export const OPS_LEAD_CURRENCIES = ["BRL", "USD", "EUR"] as const;

/** Sugestões de origem (o campo aceita qualquer texto). */
export const OPS_LEAD_ORIGIN_SUGGESTIONS = ["Indicação", "Instagram", "Meta Ads", "Google Ads", "Site", "WhatsApp", "Evento", "Prospecção ativa"];

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

/**
 * Soma o valor potencial separado por moeda (ex.: { BRL: 1500, USD: 300 }).
 * Valores sem número não entram. Nunca converte nem junta moedas.
 */
export function opsSumByCurrency(items: readonly { potential_value: number | string | null; currency: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    if (i.potential_value === null || i.potential_value === "") continue;
    const v = Number(i.potential_value);
    if (!Number.isFinite(v)) continue;
    out[i.currency] = Math.round(((out[i.currency] ?? 0) + v) * 100) / 100;
  }
  return out;
}
