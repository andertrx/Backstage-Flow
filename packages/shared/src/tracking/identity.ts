// Tracking (Etapa 34.2): dados de quem converteu (e-mail, telefone, nome).
// Regra: o valor legível NUNCA é guardado. O script do site normaliza e cifra
// (SHA-256, sem volta) no navegador; só o hash sai de lá. As mesmas regras
// estão repetidas em apps/web/public/t.js (o teste e2e confere que batem).
// Normalização no padrão pedido pelo Meta (Advanced Matching / CAPI).

/** Hash SHA-256 em hexadecimal minúsculo (64 caracteres). */
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** E-mail: sem espaços, minúsculo. Inválido → null. */
export function normalizeLeadEmail(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(t) && t.length <= 254 ? t : null;
}

/**
 * Telefone: só dígitos, com código do país. Sem "+" na frente, número de
 * 10 ou 11 dígitos (DDD + número brasileiro) ganha o 55. Inválido → null.
 */
export function normalizeLeadPhone(raw: string | null | undefined, defaultCountry = "55"): string | null {
  const international = /^\s*(\+|00)/.test(raw ?? "");
  let d = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!international && (d.length === 10 || d.length === 11)) d = defaultCountry + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** Nome: minúsculo, só letras (acentos mantidos, em UTF-8). */
export function normalizeLeadName(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase().normalize("NFC").replace(/[^\p{L}]/gu, "");
  return t ? t.slice(0, 100) : null;
}

/** "Ana Maria Souza" → primeiro e último nome. */
export function splitFullName(full: string | null | undefined): { first: string | null; last: string | null } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : null };
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UserDataInput {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/** Os códigos que o Meta usa: em, ph, fn, ln. Campo vazio ou inválido fica de fora. */
export interface HashedUserData {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
}

export async function hashUserData(input: UserDataInput): Promise<HashedUserData> {
  const out: HashedUserData = {};
  const em = normalizeLeadEmail(input.email);
  const ph = normalizeLeadPhone(input.phone);
  const fn = normalizeLeadName(input.firstName);
  const ln = normalizeLeadName(input.lastName);
  if (em) out.em = await sha256Hex(em);
  if (ph) out.ph = await sha256Hex(ph);
  if (fn) out.fn = await sha256Hex(fn);
  if (ln) out.ln = await sha256Hex(ln);
  return out;
}

// -----------------------------------------------------------------------------
// Eventos
// -----------------------------------------------------------------------------

/** Eventos padrão (mesmos nomes do Meta). Outros nomes são aceitos como personalizados. */
export const STANDARD_EVENTS = [
  "PageView", "ViewContent", "Contact", "Lead", "CompleteRegistration", "SubmitApplication", "Schedule",
  "AddToCart", "InitiateCheckout", "Purchase",
] as const;

/** Eventos que transformam o visitante em lead (entra na lista de leads). */
export const CONVERSION_EVENTS = ["Lead", "CompleteRegistration", "SubmitApplication", "Schedule", "Purchase"] as const;

export const EVENT_LABELS: Record<string, string> = {
  PageView: "Página vista",
  ViewContent: "Viu conteúdo",
  Contact: "Contato",
  Lead: "Lead",
  CompleteRegistration: "Cadastro",
  SubmitApplication: "Inscrição",
  Schedule: "Agendamento",
  AddToCart: "Adicionou ao carrinho",
  InitiateCheckout: "Iniciou a compra",
  Purchase: "Compra",
};

export const eventLabel = (name: string) => EVENT_LABELS[name] ?? name;
