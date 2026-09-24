/**
 * Telefone — guardado só com dígitos, sempre com o código do país.
 * Números brasileiros digitados sem DDI (10 ou 11 dígitos) ganham o "55".
 * Quem digita "+" já informou o DDI, então o número é mantido como está.
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function isValidPhone(value: string): boolean {
  return /^[0-9]{10,15}$/.test(normalizePhone(value));
}

/** "5545999998888" → "+55 (45) 99999-8888". Outros países: "+<dígitos>". */
export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const split = rest.length === 9 ? 5 : 4;
    return `+55 (${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
  }
  return d ? `+${d}` : "";
}
