/**
 * Lógica do lead-webhook (Tracking T5.2b), separada para ser testada sem banco.
 * O aviso de um formulário de outro sistema vira o MESMO pacote que o script do site mandaria
 * (tracking_ingest): origem, lead e envio do Lead ao Meta seguem as regras de sempre.
 * Telefone, e-mail e nome são cifrados (SHA-256) aqui; o texto legível nunca é guardado nem vai para log.
 */
import { normalizeLeadEmail, normalizeLeadName, normalizeLeadPhone, sha256Hex, splitFullName } from "../../../packages/shared/src/tracking/identity.ts";
import { collectPaths, extractLead, LEAD_PARAM_KEYS, type LeadMapping, parseWebhookBody } from "../../../packages/shared/src/tracking/leadWebhook.ts";
import { isHostAllowed } from "../../../packages/shared/src/tracking/params.ts";
import { type Beacon, buildIngest, type Container } from "../track/logic.ts";

export { LIMIT, MAX_BODY_BYTES, readCredentials } from "../sales-webhook/logic.ts";

export type LeadReceive =
  | { keys: string[]; result: "recusado" | "ignorado" | "teste"; reason: string }
  | { keys: string[]; result: "enviar"; ingest: ReturnType<typeof buildIngest> };

const FBC = /^fb\.1\.\d{13}\.[\x21-\x7e]{1,480}$/;

/** Endereço da página: o do formulário (se for do domínio do site) ou a raiz do 1º domínio autorizado. */
function pageBase(pageUrl: string | null, container: Container): string | null {
  try {
    if (pageUrl) {
      const u = new URL(pageUrl);
      if ((u.protocol === "https:" || u.protocol === "http:") && isHostAllowed(u.hostname, container.allowed_domains)) return `${u.origin}${u.pathname}`;
    }
  } catch { /* usa o domínio do site */ }
  const host = container.allowed_domains[0]?.replace(/^\*?\./, "");
  return host ? `https://${host}/` : null;
}

const yyyymmdd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");

export async function buildLeadReceive(
  webhookId: string,
  text: string,
  contentType: string | null,
  mapping: LeadMapping | null,
  container: Container,
  nowMs: number,
  webhookTestMode: boolean,
): Promise<LeadReceive> {
  const body = parseWebhookBody(text, contentType);
  if (!body) return { keys: [], result: "recusado", reason: "Formato do aviso não reconhecido (aceito: JSON ou formulário)." };
  const keys = collectPaths(body);
  const lead = extractLead(body, mapping ?? {});
  if (!lead.ok) return { keys, result: lead.result, reason: lead.reason };
  const phone = normalizeLeadPhone(lead.phone);
  const email = normalizeLeadEmail(lead.email);
  if (!phone && !email) return { keys, result: "recusado", reason: "Telefone e e-mail do aviso são inválidos." };
  if (container.consent_mode === "aguardar_consentimento") {
    return { keys, result: "ignorado", reason: "O site exige consentimento e um formulário de outro sistema não informa isso. Troque o site para 'não exigir' se o consentimento for coletado no formulário." };
  }
  const base = pageBase(lead.page_url, container);
  if (!base) return { keys, result: "recusado", reason: "O site do Tracking não tem domínio cadastrado." };

  const { first, last } = splitFullName(lead.name);
  const fn = normalizeLeadName(first), ln = normalizeLeadName(last);
  const ud: Record<string, string> = {};
  if (email) ud.em = await sha256Hex(email);
  if (phone) ud.ph = await sha256Hex(phone);
  if (fn) ud.fn = await sha256Hex(fn);
  if (ln) ud.ln = await sha256Hex(ln);

  const q = new URLSearchParams();
  for (const k of LEAD_PARAM_KEYS) if (lead.params[k]) q.set(k, lead.params[k]!);
  const hasOrigin = [...q.keys()].length > 0;
  const url = `${base}${q.toString() ? `?${q}` : ""}`;

  const person = ud.ph ?? ud.em!;
  const day = yyyymmdd(nowMs);
  const beacon: Beacon = {
    k: "bf_000000000000000000000000",
    v: `lw${person.slice(0, 24)}`,
    s: `lw${person.slice(0, 12)}${day}`,
    // Mesma pessoa, mesmo endereço e mesmo dia: o evento não se repete (nem no Meta).
    e: `lw.${webhookId.slice(0, 8)}.${person.slice(0, 24)}.${day}`,
    n: "Lead",
    t: nowMs,
    u: url,
    ...(hasOrigin ? { nt: true } : {}),
    cd: { canal: "formulario_externo" },
    ud,
    ...(lead.params.fbclid && FBC.test(`fb.1.${nowMs}.${lead.params.fbclid}`) ? { fbc: `fb.1.${nowMs}.${lead.params.fbclid}` } : {}),
  };
  if (webhookTestMode) return { keys, result: "teste", reason: `Modo teste: conferido e não registrado. Origem lida: ${hasOrigin ? [...q.keys()].join(", ") : "nenhuma"}.` };
  return { keys, result: "enviar", ingest: buildIngest(beacon, container, { nowMs, userAgent: null, ip: null }) };
}
