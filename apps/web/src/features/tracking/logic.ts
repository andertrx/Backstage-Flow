import { normalizeDomain } from "@backstage/shared";

/** Endereço público do script (fica no site do CRM, na Vercel). */
export const TRACKING_SCRIPT_URL = "https://web-ivory-three-49.vercel.app/t.js";

export type ContainerStatus = "ativo" | "pausado";
export type ConsentMode = "nao_exigir" | "aguardar_consentimento";

export const CONSENT_LABELS: Record<ConsentMode, string> = {
  nao_exigir: "Não exigir (coleta logo ao abrir o site)",
  aguardar_consentimento: "Aguardar o aceite de cookies do site",
};
export const RETENTION_OPTIONS = [90, 180, 365, 730] as const;
export const RETENTION_LABELS: Record<(typeof RETENTION_OPTIONS)[number], string> = {
  90: "3 meses",
  180: "6 meses",
  365: "1 ano",
  730: "2 anos",
};

export interface ContainerFormValues {
  client_id: string;
  name: string;
  domains: string;
  status: ContainerStatus;
  test_mode: boolean;
  consent_mode: ConsentMode;
  retention_days: number;
}

export interface ContainerInput {
  client_id: string;
  name: string;
  allowed_domains: string[];
  status: ContainerStatus;
  test_mode: boolean;
  consent_mode: ConsentMode;
  retention_days: number;
}

export const emptyContainerForm: ContainerFormValues = {
  client_id: "",
  name: "",
  domains: "",
  status: "ativo",
  test_mode: true,
  consent_mode: "nao_exigir",
  retention_days: 180,
};

/** Um domínio por linha (ou separados por vírgula). Limpa "https://", "www." é mantido. */
export function parseDomains(text: string): { domains: string[]; invalid: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\n,;\s]+/)) {
    if (!raw.trim()) continue;
    const d = normalizeDomain(raw);
    if (!d) invalid.push(raw.trim());
    else if (!domains.includes(d)) domains.push(d);
  }
  return { domains, invalid };
}

export function parseContainerForm(v: ContainerFormValues): { data: ContainerInput } | { error: string } {
  if (!v.client_id) return { error: "Escolha o cliente." };
  const name = v.name.trim();
  if (name.length < 2 || name.length > 80) return { error: "Informe o nome do site (2 a 80 caracteres)." };
  const { domains, invalid } = parseDomains(v.domains);
  if (invalid.length) return { error: `Domínio inválido: ${invalid.join(", ")}. Use só o endereço, ex.: loja.com.br` };
  if (domains.length === 0) return { error: "Informe pelo menos um domínio autorizado (ex.: loja.com.br)." };
  if (domains.length > 20) return { error: "No máximo 20 domínios por container." };
  return {
    data: {
      client_id: v.client_id,
      name,
      allowed_domains: domains,
      status: v.status,
      test_mode: v.test_mode,
      consent_mode: v.consent_mode,
      retention_days: v.retention_days,
    },
  };
}

/** Código para colar no site, antes de </head>. */
export function installSnippet(publicKey: string, consentMode: ConsentMode, scriptUrl = TRACKING_SCRIPT_URL): string {
  const consent = consentMode === "aguardar_consentimento" ? ' data-consent="aguardar"' : "";
  return `<script async src="${scriptUrl}" data-key="${publicKey}"${consent}></script>`;
}

export const EVENT_EXAMPLE = `<script>\n  window.bf = window.bf || function () { (window.bf.q = window.bf.q || []).push(arguments); };\n  bf("track", "Lead", { formulario: "contato" });\n</script>`;
export const CONSENT_EXAMPLE = `bf("consent", true);  // quando a pessoa aceitar os cookies`;

/**
 * Parâmetros de URL para colar nos anúncios. Os IDs do anúncio (bf_c, bf_s,
 * bf_a) permitem ligar a visita à campanha com certeza.
 */
export const META_URL_PARAMS =
  "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&bf_c={{campaign.id}}&bf_s={{adset.id}}&bf_a={{ad.id}}";
export const GOOGLE_TRACKING_TEMPLATE =
  "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&bf_c={campaignid}&bf_s={adgroupid}&bf_a={creative}";

export type PeriodPreset = "hoje" | "7d" | "30d";
export const PERIOD_LABELS: Record<PeriodPreset, string> = { hoje: "Hoje", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias" };

/** Período em horário local do navegador: de 00:00 do primeiro dia até agora. */
export function periodRange(preset: PeriodPreset, now = new Date()): { from: string; to: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (preset === "7d") start.setDate(start.getDate() - 6);
  if (preset === "30d") start.setDate(start.getDate() - 29);
  const end = new Date(now.getTime() + 60_000);
  return { from: start.toISOString(), to: end.toISOString() };
}
