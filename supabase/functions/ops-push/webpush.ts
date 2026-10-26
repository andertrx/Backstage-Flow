/**
 * Web Push (padrão aberto usado pelo Chrome, Edge, Firefox e Safari) só com a criptografia do próprio servidor:
 *  - cifra do conteúdo: RFC 8291 (aes128gcm), conferida com o exemplo oficial da RFC no teste;
 *  - identificação do remetente: VAPID (RFC 8292), JWT ES256.
 * A chave privada VAPID fica só no cofre; nada daqui vai para log.
 */
const enc = new TextEncoder();
/** Bytes num ArrayBuffer comum (é o que a criptografia do servidor aceita). */
type Bytes = Uint8Array<ArrayBuffer>;
const bytes = (u: Uint8Array): Bytes => new Uint8Array(u);

export const b64u = {
  encode(data: Uint8Array): string {
    let s = "";
    for (const b of data) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(text: string): Bytes {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
    return bytes(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  },
};

const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** Cifra o conteúdo para um navegador (p256dh + auth da inscrição). Opções só para o teste com o exemplo da RFC. */
export async function encryptPayload(
  plaintext: Bytes,
  uaPublicB64: string,
  authB64: string,
  opts: { asKeys?: CryptoKeyPair; salt?: Uint8Array } = {},
): Promise<Bytes> {
  const uaPublic = b64u.decode(uaPublicB64);
  const authSecret = b64u.decode(authB64);
  const as = opts.asKeys ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(authSecret, bytes(shared));
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const salt = bytes(opts.salt ?? crypto.getRandomValues(new Uint8Array(16)));
  const prk = await hmac(salt, bytes(ikm.slice(0, 32)));
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** Par de chaves VAPID novo: a pública (para o navegador) e a privada em JWK (para o cofre). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateJwk: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: b64u.encode(raw), privateJwk: JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)) };
}

/** Cabeçalho Authorization do VAPID para o serviço de push daquele navegador (vale 12 horas). */
export async function vapidAuthorization(endpoint: string, publicKey: string, privateJwk: string, subject: string, nowSec: number): Promise<string> {
  const header = b64u.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(privateJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64u.encode(sig)}, k=${publicKey}`;
}

export interface Subscription { id: string; endpoint: string; p256dh: string; auth: string }
export interface SendResult { ok: boolean; gone: boolean; status: number }

/** Envia uma notificação. 404/410 = o navegador cancelou a inscrição (desligar o aparelho). */
export async function sendPush(
  sub: Subscription,
  payload: Record<string, unknown>,
  vapid: { publicKey: string; privateJwk: string; subject: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub.p256dh, sub.auth);
  const auth = await vapidAuthorization(sub.endpoint, vapid.publicKey, vapid.privateJwk, vapid.subject, Math.floor(Date.now() / 1000));
  let res: Response;
  try {
    res = await fetchImpl(sub.endpoint, {
      method: "POST",
      headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "14400", Urgency: "high", Authorization: auth },
      body,
    });
  } catch {
    return { ok: false, gone: false, status: 0 };
  }
  await res.body?.cancel();
  return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status };
}

/** Texto da notificação (nada de dado pessoal: só número e título da tarefa). */
export function reminderPayload(tasks: { id: string; number: number; title: string; days_late: number }[], appUrl: string) {
  const n = tasks.length;
  const first = tasks[0];
  return {
    title: n === 1 ? "Tarefa vencida" : `${n} tarefas vencidas`,
    body: n === 1
      ? `#${first.number} ${first.title}${first.days_late > 0 ? ` (venceu há ${first.days_late} dia${first.days_late === 1 ? "" : "s"})` : " (vence hoje)"}`
      : `#${first.number} ${first.title} e mais ${n - 1}. Abra para conferir.`,
    url: n === 1 ? `${appUrl}/operacoes/tarefas?tarefa=${first.id}` : `${appUrl}/operacoes/tarefas`,
    tag: "ops-tarefas-vencidas",
  };
}
