/**
 * Como cada plataforma exibe o ID da conta:
 *   Meta:   act_1234567890   (o banco guarda só os números)
 *   Google: 123-456-7890     (Customer ID com traços)
 */
export function formatAccountId(platform: string, externalId: string): string {
  if (platform === "meta") return `act_${externalId}`;
  if (platform === "google") {
    const d = externalId.replace(/\D/g, "");
    return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : externalId;
  }
  return externalId;
}

/** Nome do "agrupador" de contas em cada plataforma. */
export const BUSINESS_LABELS: Record<string, string> = {
  meta: "Business Manager",
  google: "MCC (conta administradora)",
};
