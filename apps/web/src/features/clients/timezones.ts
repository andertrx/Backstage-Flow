/** Fusos mais comuns; o padrão é o de Brasília. */
export const TIMEZONES = [
  ["America/Sao_Paulo", "Brasília (BRT)"],
  ["America/Manaus", "Manaus (AMT)"],
  ["America/Cuiaba", "Cuiabá (AMT)"],
  ["America/Rio_Branco", "Rio Branco (ACT)"],
  ["America/Noronha", "Fernando de Noronha"],
  ["America/New_York", "Nova York (EUA)"],
  ["Europe/Lisbon", "Lisboa (Portugal)"],
] as const;

export function timezoneLabel(tz: string): string {
  return TIMEZONES.find(([id]) => id === tz)?.[1] ?? tz;
}
