/**
 * CNPJ — normalização, validação e formatação.
 *
 * Aceita o formato numérico e o NOVO formato alfanumérico da Receita Federal
 * (letras nas 12 primeiras posições, vigente a partir de julho/2026).
 * Regra do dígito verificador: valor de cada caractere = código ASCII − 48,
 * pesos 5..2,9..2 (1º dígito) e 6..2,9..2 (2º dígito), módulo 11.
 *
 * A mesma regra existe no banco (private.is_valid_cnpj) — o banco é a garantia final.
 */

const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Remove pontuação e espaços e deixa em maiúsculas: "12.abc.345/01de-35" → "12ABC34501DE35". */
export function normalizeCnpj(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

function checkDigit(base: string, weights: number[]): number {
  const sum = weights.reduce((acc, w, i) => acc + (base.charCodeAt(i) - 48) * w, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;
  const d1 = checkDigit(cnpj.slice(0, 12), W1);
  const d2 = checkDigit(cnpj.slice(0, 13), W2);
  return cnpj[12] === String(d1) && cnpj[13] === String(d2);
}

/** "11222333000181" → "11.222.333/0001-81" (também para o alfanumérico). */
export function formatCnpj(value: string): string {
  const c = normalizeCnpj(value);
  if (c.length !== 14) return value;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
