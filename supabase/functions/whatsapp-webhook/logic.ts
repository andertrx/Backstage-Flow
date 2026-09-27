/**
 * Regras puras do webhook do WhatsApp (API oficial) — Etapa 34.5-W2.
 * Conferir a assinatura do Meta e tirar de cada aviso só o necessário.
 * O texto da mensagem é lido na memória apenas para achar "(ref. XXXXXX)";
 * nada do texto é guardado. O número do cliente vira hash SHA-256.
 */

export const MAX_BODY_BYTES = 1024 * 1024;

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

/** Comparação em tempo constante (não dá pista de quantos caracteres acertou). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cabeçalho X-Hub-Signature-256 = "sha256=" + HMAC do corpo com o segredo do app. */
export async function validSignature(header: string | null, body: string, appSecret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  return safeEqual(header.slice(7).toLowerCase(), await hmacSha256Hex(appSecret, body));
}

const REF = /\(ref\.\s*([2-9A-HJ-NP-Z]{6})\)/i;

export interface Inbound {
  wa_hash: string;
  message_key: string;
  at: string;
  ref_code: string | null;
  referral: { ctwa_clid: string | null; source_id: string | null; source_type: string | null; source_url: string | null } | null;
}

interface MetaMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  referral?: { ctwa_clid?: string; source_id?: string; source_type?: string; source_url?: string };
}

/**
 * Tira do aviso do Meta as mensagens recebidas no número configurado.
 * Status de entrega e mensagens de outros números são ignorados.
 */
export async function extractInbound(payload: unknown, phoneNumberId: string): Promise<Inbound[]> {
  const out: Inbound[] = [];
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; messages?: MetaMessage[] } }[] }[] };
  if (p?.object !== "whatsapp_business_account") return out;
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || change.value?.metadata?.phone_number_id !== phoneNumberId) continue;
      for (const m of change.value.messages ?? []) {
        const digits = (m.from ?? "").replace(/\D/g, "");
        if (digits.length < 8 || !m.id) continue;
        const text = m.text?.body ?? m.button?.text ?? "";
        const ref = REF.exec(text);
        const seconds = Number(m.timestamp);
        const r = m.referral;
        out.push({
          wa_hash: await sha256Hex(digits),
          message_key: (await sha256Hex(m.id)).slice(0, 40),
          at: new Date(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now()).toISOString(),
          ref_code: ref ? ref[1].toUpperCase() : null,
          referral: r
            ? {
              ctwa_clid: r.ctwa_clid ? r.ctwa_clid.slice(0, 500) : null,
              source_id: r.source_id && /^\d{1,32}$/.test(r.source_id) ? r.source_id : null,
              source_type: r.source_type ? r.source_type.slice(0, 40) : null,
              source_url: r.source_url && /^https?:\/\//.test(r.source_url) ? r.source_url.slice(0, 2000) : null,
            }
            : null,
        });
      }
    }
  }
  return out;
}
