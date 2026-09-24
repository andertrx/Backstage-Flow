// Fórmulas das métricas calculadas. Regra única: se o denominador é 0 ou
// algum valor não está disponível (null), o resultado é null, que a tela mostra
// como "não disponível". Nunca inventamos um número.
//
// Dinheiro chega em micros (R$ 1,00 = 1.000.000), como está no banco.

export const MICROS_PER_UNIT = 1_000_000;

type Value = number | null | undefined;

function ratio(numerator: Value, denominator: Value, factor = 1): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return (numerator / denominator) * factor;
}

/** Micros → valor da moeda (ex.: 12_340_000 → 12.34). */
export function microsToAmount(micros: Value): number | null {
  return micros == null ? null : micros / MICROS_PER_UNIT;
}

/** Valor da moeda → micros, sem erro de arredondamento. */
export function amountToMicros(amount: number): number {
  return Math.round(amount * MICROS_PER_UNIT);
}

/** CTR em % = cliques ÷ impressões × 100. */
export const ctr = (clicks: Value, impressions: Value) => ratio(clicks, impressions, 100);

/** CPC (moeda) = investimento ÷ cliques. */
export const cpc = (spendMicros: Value, clicks: Value) => ratio(microsToAmount(spendMicros), clicks);

/** CPM (moeda) = investimento ÷ impressões × 1000. */
export const cpm = (spendMicros: Value, impressions: Value) => ratio(microsToAmount(spendMicros), impressions, 1000);

/** CPL (moeda) = investimento ÷ leads. */
export const cpl = (spendMicros: Value, leads: Value) => ratio(microsToAmount(spendMicros), leads);

/** CPA (moeda) = investimento ÷ conversões. */
export const cpa = (spendMicros: Value, conversions: Value) => ratio(microsToAmount(spendMicros), conversions);

/** Custo por conversa iniciada (moeda). */
export const costPerMessage = (spendMicros: Value, messages: Value) => ratio(microsToAmount(spendMicros), messages);

/** ROAS = valor das conversões ÷ investimento (ex.: 3.5 = R$ 3,50 para cada R$ 1). */
export const roas = (conversionValueMicros: Value, spendMicros: Value) => ratio(conversionValueMicros, spendMicros);

/** Frequência = impressões ÷ alcance. Só faz sentido com alcance DO PERÍODO. */
export const frequency = (impressions: Value, reach: Value) => ratio(impressions, reach);

/** Taxa de conversão em % = conversões ÷ cliques × 100. */
export const conversionRate = (conversions: Value, clicks: Value) => ratio(conversions, clicks, 100);

/** Variação em % entre dois períodos. null quando não dá para comparar (anterior 0 ou ausente). */
export const percentChange = (current: Value, previous: Value) =>
  current == null ? null : ratio(current - (previous ?? 0), previous, 100);
