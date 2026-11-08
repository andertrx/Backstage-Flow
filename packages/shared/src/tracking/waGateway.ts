/**
 * Tracking T5.3 (08/11/2026): ler as mensagens que um servidor de WhatsApp NÃO OFICIAL (estilo Evolution API / Baileys)
 * avisa por webhook. Cada servidor manda num formato um pouco diferente, então a leitura é tolerante e só tira o necessário:
 * quem mandou, se é grupo, se foi a agência que enviou, o código "(ref. XXXXXX)" do botão do site, a origem do anúncio de
 * WhatsApp (ctwaClid) e o texto (lido só na memória, para achar o código e as frases; nunca guardado).
 */

export type GatewayMessage =
  | { kind: "ignore"; reason: string }
  | {
      kind: "inbound" | "echo";
      /** Número da PESSOA (cliente final), só dígitos. Em "echo", é para quem a agência mandou. */
      phone: string;
      id: string;
      at: number | null;
      text: string;
      ctwa: string | null;
      adId: string | null;
      sourceType: string | null;
      sourceUrl: string | null;
    };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** "messages.upsert", "MESSAGES_UPSERT" e "messages-upsert" são o mesmo evento. */
const eventName = (v: unknown) => str(v).toLowerCase().replace(/[_-]/g, ".");

/** Tira as "capas" (mensagem temporária, ver uma vez, editada…) até chegar na mensagem de verdade. */
function unwrap(message: unknown): Obj {
  let m = isObj(message) ? message : {};
  for (let i = 0; i < 4; i++) {
    const inner = [m.ephemeralMessage, m.viewOnceMessage, m.viewOnceMessageV2, m.documentWithCaptionMessage, m.editedMessage]
      .map((w) => (isObj(w) && isObj(w.message) ? w.message : null)).find(Boolean);
    if (!inner) break;
    m = inner;
  }
  return m;
}

function textOf(m: Obj): string {
  const ext = isObj(m.extendedTextMessage) ? m.extendedTextMessage : {};
  const cap = [m.imageMessage, m.videoMessage, m.documentMessage].map((x) => (isObj(x) ? str(x.caption) : "")).find(Boolean) ?? "";
  const btn = isObj(m.buttonsResponseMessage) ? str(m.buttonsResponseMessage.selectedDisplayText) : "";
  return str(m.conversation) || str(ext.text) || cap || btn;
}

function contextOf(m: Obj): Obj {
  const parts = [m.extendedTextMessage, m.imageMessage, m.videoMessage, m.documentMessage, m.buttonsResponseMessage, m.conversation];
  for (const p of parts) if (isObj(p) && isObj(p.contextInfo)) return p.contextInfo;
  return isObj(m.contextInfo) ? m.contextInfo : {};
}

/** Número em dígitos a partir de "5545999998888@s.whatsapp.net". Id "@lid" (sem telefone) → "". */
function digitsOf(jid: string): string {
  if (!jid || /@(lid|g\.us|broadcast|newsletter)$/.test(jid) || jid.startsWith("status@")) return "";
  const d = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : "";
}

function one(msg: unknown): GatewayMessage {
  if (!isObj(msg)) return { kind: "ignore", reason: "mensagem vazia" };
  const key = isObj(msg.key) ? msg.key : {};
  const jid = str(key.remoteJid);
  if (/@g\.us$/.test(jid) || isObj(msg.groupInfo)) return { kind: "ignore", reason: "grupo" };
  if (/@(broadcast|newsletter)$/.test(jid) || jid.startsWith("status@")) return { kind: "ignore", reason: "lista de transmissão ou status" };
  // Servidores novos mandam "@lid" e põem o telefone em outro campo.
  const phone = digitsOf(jid) || digitsOf(str(key.remoteJidAlt)) || digitsOf(str(key.senderPn)) || digitsOf(str(msg.senderPn));
  if (!phone) return { kind: "ignore", reason: "sem número de telefone na mensagem" };
  const id = str(key.id);
  if (!id) return { kind: "ignore", reason: "mensagem sem id" };

  const m = unwrap(msg.message);
  const text = textOf(m);
  const ctx = contextOf(m);
  const ad = isObj(ctx.externalAdReply) ? ctx.externalAdReply : {};
  const ctwa = str(ad.ctwaClid) || str(ad.ctwa_clid) || str(ctx.ctwaClid) || str(msg.ctwaClid);
  const adId = str(ad.sourceId);
  const ts = Number(isObj(msg.messageTimestamp) ? (msg.messageTimestamp as Obj).low : msg.messageTimestamp);
  return {
    kind: key.fromMe === true ? "echo" : "inbound",
    phone,
    id,
    at: Number.isFinite(ts) && ts > 0 ? (ts > 1e12 ? ts : ts * 1000) : null,
    text,
    ctwa: ctwa ? ctwa.slice(0, 500) : null,
    adId: /^\d{1,32}$/.test(adId) ? adId : null,
    sourceType: str(ad.sourceType).slice(0, 40) || null,
    sourceUrl: /^https?:\/\//.test(str(ad.sourceUrl)) ? str(ad.sourceUrl).slice(0, 2000) : null,
  };
}

/** Lê um aviso do servidor: pode trazer uma mensagem ou uma lista. Só o evento de mensagem recebida/enviada vale. */
export function parseGatewayPayload(payload: unknown): GatewayMessage[] {
  if (!isObj(payload)) return [];
  const ev = eventName(payload.event);
  if (ev && ev !== "messages.upsert") return [{ kind: "ignore", reason: `evento ${ev.slice(0, 40)} não é mensagem` }];
  const data = payload.data;
  const list: unknown[] = Array.isArray(data) ? data
    : isObj(data) && Array.isArray(data.messages) ? data.messages
    : isObj(data) ? [data] : [];
  return list.slice(0, 50).map(one);
}

/** Código "(ref. K7Q2M9)" que o botão do site põe no fim da mensagem. */
export function refCodeOf(text: string): string | null {
  const m = /\(ref\.\s*([2-9A-HJ-NP-Z]{6})\)/i.exec(text);
  return m ? m[1].toUpperCase() : null;
}
