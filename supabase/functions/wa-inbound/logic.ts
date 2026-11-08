/**
 * Lógica do wa-inbound (Tracking T5.3), separada para ser testada sem banco.
 * Transforma o aviso do servidor de WhatsApp NÃO OFICIAL no mesmo pacote que a API oficial usa
 * (tracking_whatsapp_inbound / wa_echo). O texto é lido só na memória (para achar o código "(ref. …)" e as frases);
 * nada dele é guardado. O número vira hash SHA-256.
 */
import { matchTriggers, normalizeWhatsAppNumber, type WaTrigger } from "../../../packages/shared/src/tracking/waTriggers.ts";
import { isHistoryPayload, parseGatewayPayload, refCodeOf } from "../../../packages/shared/src/tracking/waGateway.ts";
import { sha256Hex } from "../whatsapp-webhook/logic.ts";

export { LIMIT, MAX_BODY_BYTES, readCredentials } from "../sales-webhook/logic.ts";

/** T5.8: o aviso com o histórico do aparelho pode ser grande (até 1000 mensagens). */
export const HISTORY_MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface InboundOut {
  wa_hash: string;
  message_key: string;
  at: string;
  ref_code: string | null;
  referral: { ctwa_clid: string | null; source_id: string | null; source_type: string | null; source_url: string | null } | null;
}
export interface EchoOut {
  wa_hash: string;
  ph_hash: string;
  message_key: string;
  matches: { trigger_id: string; value?: number; currency?: string }[];
}

/** Texto de uma mensagem para a caixa de conversas (só com a opção ligada no site e o aviso confirmado). */
export interface StoreOut {
  wa_hash: string;
  direction: "recebida" | "enviada";
  message_key: string;
  at: string;
  body: string;
  push_name: string | null;
  phone_tail: string | null;
  /** Telefone completo da pessoa (só dígitos). Guardado só com a opção ligada (T5.7). */
  phone: string;
  /** T5.8: mensagem do histórico antigo do aparelho (a data antiga é aceita). */
  history?: boolean;
}

const iso = (ms: number | null, nowMs: number) => new Date(ms ?? nowMs).toISOString();

/** Separa o aviso em: mensagens recebidas (prontas) e mensagens enviadas (precisam das frases do cliente). */
export async function planGatewayPayload(payload: unknown, nowMs: number) {
  const inbound: InboundOut[] = [];
  const echoRaw: { phone: string; id: string; text: string }[] = [];
  const store: StoreOut[] = [];
  let ignored = 0;
  /** Só para diagnóstico: motivos pelos quais mensagens foram ignoradas (sem nenhum dado pessoal). */
  const reasons: Record<string, number> = {};
  let withText = 0;
  // T5.8: o histórico antigo só alimenta a caixa de conversas. Nunca conta conversa nova, lead, venda nem frase.
  const history = isHistoryPayload(payload);
  for (const m of parseGatewayPayload(payload)) {
    if (m.kind === "ignore") {
      ignored++;
      const why = m.reason.slice(0, 60);
      reasons[why] = (reasons[why] ?? 0) + 1;
      continue;
    }
    if (m.text.trim() || m.media) {
      store.push({
        wa_hash: await sha256Hex(m.phone),
        direction: m.kind === "echo" ? "enviada" : "recebida",
        message_key: (await sha256Hex(m.id)).slice(0, 40),
        at: iso(m.at, nowMs),
        body: (m.text.trim() ? m.text : (m.media ?? "")).slice(0, 4000),
        push_name: m.pushName || null,
        phone_tail: m.phone.slice(-4),
        phone: m.phone,
        ...(history ? { history: true } : {}),
      });
    }
    if (history) continue;
    if (m.kind === "echo") {
      if (m.text) echoRaw.push({ phone: m.phone, id: m.id, text: m.text });
      continue;
    }
    inbound.push({
      wa_hash: await sha256Hex(m.phone),
      message_key: (await sha256Hex(m.id)).slice(0, 40),
      at: iso(m.at, nowMs),
      ref_code: refCodeOf(m.text),
      referral: m.ctwa || m.adId || m.sourceUrl
        ? { ctwa_clid: m.ctwa, source_id: m.adId, source_type: m.sourceType, source_url: m.sourceUrl }
        : null,
    });
  }
  withText = store.length;
  return { inbound, echoRaw, store, ignored, reasons, withText };
}

/** Acha as frases do cliente nas mensagens que a agência mandou. Sem frase, nada sai. */
export async function echoesFor(echoRaw: { phone: string; id: string; text: string }[], triggers: WaTrigger[]): Promise<EchoOut[]> {
  const out: EchoOut[] = [];
  if (!triggers.length) return out;
  for (const e of echoRaw) {
    const matches = matchTriggers(e.text, triggers);
    if (!matches.length) continue;
    out.push({
      wa_hash: await sha256Hex(e.phone),
      ph_hash: await sha256Hex(normalizeWhatsAppNumber(e.phone)),
      message_key: (await sha256Hex(e.id)).slice(0, 40),
      matches: matches.map(({ trigger_id, value, currency }) => ({ trigger_id, value, currency })),
    });
  }
  return out;
}
