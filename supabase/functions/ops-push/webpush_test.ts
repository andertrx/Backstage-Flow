import { assert, assertEquals } from "jsr:@std/assert@1";
import { b64u, encryptPayload, generateVapidKeys, reminderPayload, sendPush, vapidAuthorization } from "./webpush.ts";

// Exemplo oficial da RFC 8291 (apêndice A).
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

Deno.test("cifra igual ao exemplo oficial da RFC 8291", async () => {
  const pub = b64u.decode(RFC.asPublic);
  const jwk = { kty: "EC", crv: "P-256", d: RFC.asPrivate, x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), ext: true };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const out = await encryptPayload(new TextEncoder().encode(RFC.plaintext), RFC.uaPublic, RFC.auth,
    { asKeys: { privateKey, publicKey }, salt: b64u.decode(RFC.salt) });
  assertEquals(b64u.encode(out), RFC.body);
});

Deno.test("VAPID: assinatura confere com a chave pública; vale para o serviço de push do navegador", async () => {
  const keys = await generateVapidKeys();
  assertEquals(b64u.decode(keys.publicKey).length, 65);
  const auth = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys.publicKey, keys.privateJwk, "https://www.backstageflow.com.br", 1_800_000_000);
  const [, token, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assertEquals(k, keys.publicKey);
  const [h, c, s] = token.split(".");
  const claims = JSON.parse(new TextDecoder().decode(b64u.decode(c)));
  assertEquals([claims.aud, claims.exp, claims.sub], ["https://fcm.googleapis.com", 1_800_043_200, "https://www.backstageflow.com.br"]);
  const pub = await crypto.subtle.importKey("raw", b64u.decode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64u.decode(s), new TextEncoder().encode(`${h}.${c}`)));
});

Deno.test("envio: cabeçalhos certos; 410 = navegador cancelou", async () => {
  const keys = await generateVapidKeys();
  const seen: RequestInit[] = [];
  const fake = (status: number) => ((_u: string | URL | Request, init?: RequestInit) => { seen.push(init!); return Promise.resolve(new Response(null, { status })); }) as unknown as typeof fetch;
  const sub = { id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: RFC.uaPublic, auth: RFC.auth };
  const ok = await sendPush(sub, { title: "x" }, { ...keys, subject: "https://www.backstageflow.com.br" }, fake(201));
  assertEquals(ok, { ok: true, gone: false, status: 201 });
  const h = seen[0].headers as Record<string, string>;
  assertEquals([h["Content-Encoding"], h.Urgency], ["aes128gcm", "high"]);
  assert(h.Authorization.startsWith("vapid t="));
  assertEquals(await sendPush(sub, { title: "x" }, { ...keys, subject: "https://x" }, fake(410)), { ok: false, gone: true, status: 410 });
});

Deno.test("texto do lembrete: uma ou várias tarefas; abre a tarefa certa", () => {
  const one = reminderPayload([{ id: "t1", number: 11, title: "Enviar relatório", days_late: 3 }], "https://www.backstageflow.com.br");
  assertEquals(one.title, "Tarefa vencida");
  assertEquals(one.body, "#11 Enviar relatório (venceu há 3 dias)");
  assertEquals(one.url, "https://www.backstageflow.com.br/operacoes/tarefas?tarefa=t1");
  const many = reminderPayload([{ id: "t1", number: 11, title: "A", days_late: 0 }, { id: "t2", number: 12, title: "B", days_late: 1 }], "https://x");
  assertEquals([many.title, many.url], ["2 tarefas vencidas", "https://x/operacoes/tarefas"]);
});
