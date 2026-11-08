/**
 * Tracking T5.2b (08/11/2026): LEAD que chega por webhook de um formulário de outro sistema
 * (Responde App e parecidos), com a origem da campanha vinda dos parâmetros de URL do próprio formulário.
 *
 * A agência diz, no CRM, onde está cada dado do aviso (mapeamento por caminho, como nas vendas).
 * Nada é inventado: sem origem no aviso, o lead entra "sem origem identificada".
 * Telefone, e-mail e nome saem daqui legíveis só para serem cifrados na hora pelo servidor.
 */
import { collectPaths, getPath, parseWebhookBody } from "./salesWebhook.ts";

export { collectPaths, parseWebhookBody };

/** Parâmetros de campanha que podem ser mapeados (os mesmos que o script do site lê). */
export const LEAD_PARAM_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "bf_c", "bf_s", "bf_a",
] as const;
export type LeadParamKey = (typeof LEAD_PARAM_KEYS)[number];

export interface LeadMapping {
  phone?: string;
  email?: string;
  name?: string;
  /** Endereço da página do formulário (opcional): usado só se for do domínio do site do cliente. */
  page_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  bf_c?: string;
  bf_s?: string;
  bf_a?: string;
}

export const LEAD_MAPPING_FIELDS: { key: keyof LeadMapping; label: string; group: "contato" | "origem" }[] = [
  { key: "phone", label: "Telefone", group: "contato" },
  { key: "email", label: "E-mail", group: "contato" },
  { key: "name", label: "Nome", group: "contato" },
  { key: "utm_source", label: "utm_source (origem)", group: "origem" },
  { key: "utm_medium", label: "utm_medium (meio)", group: "origem" },
  { key: "utm_campaign", label: "utm_campaign (campanha)", group: "origem" },
  { key: "utm_content", label: "utm_content (anúncio)", group: "origem" },
  { key: "utm_term", label: "utm_term", group: "origem" },
  { key: "fbclid", label: "fbclid (clique no Meta)", group: "origem" },
  { key: "gclid", label: "gclid (clique no Google)", group: "origem" },
  { key: "bf_c", label: "bf_c (ID da campanha)", group: "origem" },
  { key: "bf_s", label: "bf_s (ID do conjunto)", group: "origem" },
  { key: "bf_a", label: "bf_a (ID do anúncio)", group: "origem" },
  { key: "page_url", label: "Página do formulário (opcional)", group: "origem" },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const last = (p: string) => norm(p.split(".").filter((x) => !/^\d+$/.test(x)).at(-1) ?? "").replace(/[\s-]+/g, "_");

/** Sugestão pelos nomes mais comuns (a agência confere). Nomes iguais ao parâmetro de URL valem direto. */
export function suggestLeadMapping(paths: string[]): LeadMapping {
  const find = (names: string[]) => {
    for (const n of names) {
      const hit = paths.find((p) => last(p) === n);
      if (hit) return hit;
    }
    return undefined;
  };
  const m: LeadMapping = {
    phone: find(["phone", "phone_number", "telefone", "celular", "whatsapp", "fone", "mobile", "tel"]),
    email: find(["email", "e_mail", "mail"]),
    name: find(["name", "nome", "full_name", "nome_completo", "first_name"]),
    page_url: find(["page_url", "url", "pagina", "page", "landing_page", "source_url"]),
  };
  for (const k of LEAD_PARAM_KEYS) m[k] = find([k]);
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v)) as LeadMapping;
}

export type LeadExtract =
  | {
      ok: true;
      phone: string | null;
      email: string | null;
      name: string | null;
      page_url: string | null;
      params: Partial<Record<LeadParamKey, string>>;
    }
  | { ok: false; result: "recusado"; reason: string };

const asText = (v: unknown) => (v == null || typeof v === "object" ? null : String(v).trim() || null);

/** Lê o lead do aviso pelo mapeamento. Faltou telefone e e-mail: recusado, com o motivo. */
export function extractLead(body: Record<string, unknown>, m: LeadMapping): LeadExtract {
  if (!m.phone && !m.email) {
    return { ok: false, result: "recusado", reason: "Mapeamento incompleto: diga no CRM onde estão o telefone e/ou o e-mail." };
  }
  const phone = asText(getPath(body, m.phone));
  const email = asText(getPath(body, m.email));
  if (!phone && !email) {
    return { ok: false, result: "recusado", reason: "O aviso veio sem telefone nem e-mail (confira o mapeamento)." };
  }
  const params: Partial<Record<LeadParamKey, string>> = {};
  for (const k of LEAD_PARAM_KEYS) {
    const v = asText(getPath(body, m[k]));
    if (v) params[k] = v.slice(0, 200);
  }
  return { ok: true, phone, email, name: asText(getPath(body, m.name)), page_url: asText(getPath(body, m.page_url)), params };
}
