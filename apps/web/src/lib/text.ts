/** Deixa o texto pronto para busca: minúsculo e sem acentos ("Açaí" → "acai"). */
export function searchable(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
