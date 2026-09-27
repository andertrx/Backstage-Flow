// Tracking (Etapa 34): leitura dos parâmetros de uma URL e classificação da
// origem de uma visita. Regra central: NUNCA inventar origem. Quando não há
// evidência suficiente, a origem fica "provável" ou "desconhecida".

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

/** Identificadores de clique das plataformas (preservados sempre que chegarem). */
export const CLICK_ID_KEYS = ["fbclid", "gclid", "wbraid", "gbraid", "msclkid", "ttclid", "li_fat_id"] as const;
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

/**
 * IDs do anúncio enviados pelos parâmetros dinâmicos das plataformas:
 * Meta {{campaign.id}} / {{adset.id}} / {{ad.id}} e Google {campaignid} / {adgroupid} / {creative}.
 * É o que permite ligar a visita à campanha do CRM com certeza.
 */
export const AD_ID_KEYS = { bf_c: "campaign", bf_s: "adset", bf_a: "ad" } as const;
export type AdIdKey = keyof typeof AD_ID_KEYS;

export interface CapturedParams {
  utm: Partial<Record<UtmKey, string>>;
  clickIds: Partial<Record<ClickIdKey, string>>;
  adIds: { campaign?: string; adset?: string; ad?: string };
}

const MAX_VALUE = 500;
const clean = (v: string | null) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, MAX_VALUE) : undefined;
};

/** Lê UTMs, click IDs e IDs do anúncio de uma URL (valores brutos, sem alterar). */
export function captureParams(url: string): CapturedParams {
  const out: CapturedParams = { utm: {}, clickIds: {}, adIds: {} };
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return out;
  }
  for (const k of UTM_KEYS) {
    const v = clean(params.get(k));
    if (v) out.utm[k] = v;
  }
  for (const k of CLICK_ID_KEYS) {
    const v = clean(params.get(k));
    if (v) out.clickIds[k] = v;
  }
  for (const [k, field] of Object.entries(AD_ID_KEYS) as [AdIdKey, keyof CapturedParams["adIds"]][]) {
    const v = clean(params.get(k));
    // IDs de campanha/conjunto/anúncio são numéricos nas duas plataformas.
    if (v && /^\d{1,32}$/.test(v)) out.adIds[field] = v;
  }
  return out;
}

export function hasCampaignSignal(p: CapturedParams): boolean {
  return Object.keys(p.utm).length > 0 || Object.keys(p.clickIds).length > 0 || Object.keys(p.adIds).length > 0;
}

// -----------------------------------------------------------------------------
// Classificação da origem
// -----------------------------------------------------------------------------

export const CHANNELS = [
  "meta", "google", "tiktok", "microsoft", "linkedin",
  "busca_organica", "social_organico", "email", "whatsapp", "referral", "direto", "outros",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok",
  microsoft: "Microsoft Ads",
  linkedin: "LinkedIn",
  busca_organica: "Busca orgânica",
  social_organico: "Redes sociais (orgânico)",
  email: "E-mail",
  whatsapp: "WhatsApp",
  referral: "Outros sites",
  direto: "Direto",
  outros: "Outros",
};

/** Força da evidência: confirmada (prova técnica), provável (sinais fortes) ou desconhecida. */
export type Evidence = "confirmada" | "provavel" | "desconhecida";

export const EVIDENCE_LABELS: Record<Evidence, string> = {
  confirmada: "Confirmada",
  provavel: "Provável",
  desconhecida: "Desconhecida",
};

export interface TouchClassification {
  channel: Channel;
  /** true = mídia paga; false = orgânico/direto; null = não dá para saber. */
  paid: boolean | null;
  evidence: Evidence;
  /** Explicação curta em português (aparece na tela). */
  reason: string;
  /** utm_source normalizado (o bruto continua guardado). */
  sourceNormalized: string | null;
}

const SOURCE_ALIASES: Record<string, Channel> = {
  facebook: "meta", fb: "meta", instagram: "meta", ig: "meta", meta: "meta", messenger: "meta", an: "meta",
  facebook_ads: "meta", fb_ads: "meta", ig_ads: "meta", meta_ads: "meta", facebookads: "meta",
  google: "google", adwords: "google", google_ads: "google", googleads: "google", gads: "google", youtube: "google",
  tiktok: "tiktok", tiktok_ads: "tiktok",
  bing: "microsoft", microsoft: "microsoft", microsoft_ads: "microsoft",
  linkedin: "linkedin", linkedin_ads: "linkedin",
  whatsapp: "whatsapp", wa: "whatsapp", zap: "whatsapp",
  email: "email", "e-mail": "email", newsletter: "email", mailchimp: "email", rdstation: "email",
};

const PAID_MEDIUMS = new Set([
  "cpc", "ppc", "paid", "paid_social", "paidsocial", "paid-social", "social_paid", "cpm", "cpv", "ads", "display",
  "paid_search", "sem", "trafego_pago", "pago",
]);

const SEARCH_HOSTS = [/(^|\.)google\./, /(^|\.)bing\.com$/, /(^|\.)duckduckgo\.com$/, /(^|\.)yahoo\./, /(^|\.)ecosia\.org$/, /(^|\.)yandex\./];
const SOCIAL_HOSTS: [RegExp, Channel][] = [
  [/(^|\.)(facebook|instagram)\.com$/, "meta"], [/(^|\.)fb\.me$/, "meta"], [/(^|\.)l\.instagram\.com$/, "meta"],
  [/(^|\.)(tiktok)\.com$/, "tiktok"], [/(^|\.)linkedin\.com$/, "linkedin"], [/(^|\.)lnkd\.in$/, "linkedin"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "google"], [/(^|\.)(x\.com|twitter\.com|t\.co)$/, "outros"], [/(^|\.)pinterest\./, "outros"],
];
const WHATSAPP_HOSTS = /(^|\.)(wa\.me|whatsapp\.com)$/;

/** Normaliza o utm_source para comparar (minúsculas, sem espaços). O bruto não muda. */
export function normalizeSource(source: string | undefined): string | null {
  if (!source) return null;
  return source.trim().toLowerCase().replace(/\s+/g, "_");
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classifica a origem de uma chegada ao site.
 * Retorna null quando é navegação interna (o visitante já estava no site).
 */
export function classifyTouch(input: { params: CapturedParams; referrer?: string | null; pageUrl: string }): TouchClassification | null {
  const { params } = input;
  const src = normalizeSource(params.utm.utm_source);
  const medium = normalizeSource(params.utm.utm_medium);
  const aliased = src ? SOURCE_ALIASES[src] : undefined;
  const paidMedium = medium != null && PAID_MEDIUMS.has(medium);
  const refHost = hostOf(input.referrer);
  const pageHost = hostOf(input.pageUrl);

  // 1) Identificadores de clique do Google Ads: só existem em cliques de anúncio.
  if (params.clickIds.gclid || params.clickIds.wbraid || params.clickIds.gbraid) {
    return { channel: "google", paid: true, evidence: "confirmada", reason: "Clique em anúncio do Google (identificador de clique do Google Ads).", sourceNormalized: src };
  }
  // 2) Meta: IDs do anúncio na URL, ou fbclid + UTM de mídia paga.
  const metaIds = Object.keys(params.adIds).length > 0 && (aliased === "meta" || params.clickIds.fbclid != null);
  if (metaIds || (params.clickIds.fbclid && aliased === "meta" && paidMedium)) {
    return { channel: "meta", paid: true, evidence: "confirmada", reason: metaIds ? "IDs do anúncio do Meta na URL." : "fbclid + UTM de mídia paga do Meta.", sourceNormalized: src };
  }
  if (params.clickIds.fbclid) {
    // O Facebook/Instagram também põe fbclid em links orgânicos: não dá para afirmar que foi anúncio.
    return { channel: "meta", paid: aliased === "meta" && paidMedium ? true : null, evidence: "provavel", reason: "fbclid presente (pode ser anúncio ou link orgânico do Facebook/Instagram).", sourceNormalized: src };
  }
  for (const [key, channel] of [["ttclid", "tiktok"], ["msclkid", "microsoft"], ["li_fat_id", "linkedin"]] as const) {
    if (params.clickIds[key]) return { channel, paid: true, evidence: "confirmada", reason: `Identificador de clique da plataforma (${key}).`, sourceNormalized: src };
  }
  // 3) Só UTMs: escritas à mão, então "provável".
  if (src) {
    const channel = aliased ?? "outros";
    return {
      channel,
      paid: paidMedium ? true : medium ? false : null,
      evidence: "provavel",
      reason: aliased ? `UTM de origem "${params.utm.utm_source}".` : `UTM de origem não reconhecida ("${params.utm.utm_source}").`,
      sourceNormalized: src,
    };
  }
  // 4) Sem parâmetros: olhar de onde veio (referrer).
  if (refHost) {
    if (pageHost && (refHost === pageHost || refHost.endsWith(`.${pageHost}`) || pageHost.endsWith(`.${refHost}`))) return null;
    if (SEARCH_HOSTS.some((r) => r.test(refHost))) {
      return { channel: "busca_organica", paid: false, evidence: "provavel", reason: `Veio de um buscador (${refHost}).`, sourceNormalized: null };
    }
    if (WHATSAPP_HOSTS.test(refHost)) {
      return { channel: "whatsapp", paid: null, evidence: "provavel", reason: `Veio do WhatsApp (${refHost}).`, sourceNormalized: null };
    }
    const social = SOCIAL_HOSTS.find(([r]) => r.test(refHost));
    if (social) {
      return { channel: "social_organico", paid: false, evidence: "provavel", reason: `Veio de rede social sem parâmetros de campanha (${refHost}).`, sourceNormalized: null };
    }
    return { channel: "referral", paid: false, evidence: "provavel", reason: `Veio de outro site (${refHost}).`, sourceNormalized: null };
  }
  // 5) Nada: "direto" — mas pode ser origem perdida (app, bloqueador), então desconhecida.
  return { channel: "direto", paid: null, evidence: "desconhecida", reason: "Sem parâmetros nem site de origem (acesso direto ou origem perdida).", sourceNormalized: null };
}

// -----------------------------------------------------------------------------
// Domínios autorizados de um container
// -----------------------------------------------------------------------------

/** Formato aceito para um domínio autorizado (ex.: "cliente.com.br"). */
export const DOMAIN_PATTERN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Limpa o que a pessoa digitou ("https://www.Cliente.com.br/loja" → "www.cliente.com.br"). */
export function normalizeDomain(input: string): string | null {
  let t = input.trim().toLowerCase();
  if (!t) return null;
  if (!/^https?:\/\//.test(t)) t = `https://${t}`;
  const host = hostOf(t);
  return host && DOMAIN_PATTERN.test(host) ? host : null;
}

/** O host pode enviar eventos? Aceita o domínio e seus subdomínios ("cliente.com.br" libera "www.cliente.com.br"). */
export function isHostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((d) => h === d || h.endsWith(`.${d}`));
}
