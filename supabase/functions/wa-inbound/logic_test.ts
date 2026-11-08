import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { echoesFor, planGatewayPayload } from "./logic.ts";
import type { WaTrigger } from "../../../packages/shared/src/tracking/waTriggers.ts";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const upsert = (key: Record<string, unknown>, message: Record<string, unknown>) =>
  ({ event: "messages.upsert", data: { key: { remoteJid: "5545999998888@s.whatsapp.net", fromMe: false, id: "ID1", ...key }, message, messageTimestamp: 1762603200 } });
const trig: WaTrigger[] = [{ id: "t1", phrase: "Parabéns pela sua compra", kind: "venda", currency: "BRL" }];

Deno.test("anúncio de WhatsApp: ctwa e id do anúncio; número e id da mensagem viram hash; texto não sai", async () => {
  const p = upsert({}, { extendedTextMessage: { text: "Oi, vim do anúncio (ref. K7Q2M9)", contextInfo: { externalAdReply: { ctwaClid: "ARAk-teste", sourceId: "120210000000001", sourceType: "ad", sourceUrl: "https://fb.me/x" } } } });
  const r = await planGatewayPayload(p, NOW);
  assertEquals(r.inbound.length, 1);
  const m = r.inbound[0];
  assertMatch(m.wa_hash, /^[0-9a-f]{64}$/);
  assertMatch(m.message_key, /^[0-9a-f]{40}$/);
  assertEquals(m.ref_code, "K7Q2M9");
  assertEquals(m.referral, { ctwa_clid: "ARAk-teste", source_id: "120210000000001", source_type: "ad", source_url: "https://fb.me/x" });
  assertEquals(m.at, new Date(1762603200000).toISOString());
  const txt = JSON.stringify(r.inbound);
  assertEquals(txt.includes("5545999998888") || txt.includes("vim do anúncio"), false);
});

Deno.test("mensagem sem anúncio nem código: referral e ref_code nulos", async () => {
  const r = await planGatewayPayload(upsert({}, { conversation: "Bom dia" }), NOW);
  assertEquals(r.inbound[0].referral, null);
  assertEquals(r.inbound[0].ref_code, null);
});

Deno.test("grupo e evento que não é mensagem são ignorados; mensagem da agência vai para as frases", async () => {
  const g = await planGatewayPayload(upsert({ remoteJid: "1203@g.us" }, { conversation: "oi" }), NOW);
  assertEquals([g.inbound.length, g.echoRaw.length, g.ignored], [0, 0, 1]);
  const c = await planGatewayPayload({ event: "connection.update", data: { state: "open" } }, NOW);
  assertEquals(c.ignored, 1);
  const e = await planGatewayPayload(upsert({ fromMe: true, id: "ID2" }, { conversation: "Parabéns pela sua compra de R$ 297" }), NOW);
  assertEquals([e.inbound.length, e.echoRaw.length], [0, 1]);
  const echoes = await echoesFor(e.echoRaw, trig);
  assertEquals(echoes.length, 1);
  assertEquals(echoes[0].matches[0].trigger_id, "t1");
  assertEquals(echoes[0].matches[0].value, 297);
  assertMatch(echoes[0].ph_hash, /^[0-9a-f]{64}$/);
  assertEquals(JSON.stringify(echoes).includes("compra"), false);
});

Deno.test("mensagem da agência sem frase, ou cliente sem frases cadastradas: nada sai", async () => {
  const e = await planGatewayPayload(upsert({ fromMe: true }, { conversation: "Bom dia, tudo bem?" }), NOW);
  assertEquals((await echoesFor(e.echoRaw, trig)).length, 0);
  const f = await planGatewayPayload(upsert({ fromMe: true }, { conversation: "Parabéns pela sua compra de R$ 10" }), NOW);
  assertEquals((await echoesFor(f.echoRaw, [])).length, 0);
});

Deno.test("texto para guardar (conversas, T5.7): recebida com nome e telefone completo; enviada sem nome; anexo vira marcador; desconhecida não vai", async () => {
  const r = await planGatewayPayload({ event: "messages.upsert", data: { pushName: "João", key: { remoteJid: "5545999998888@s.whatsapp.net", fromMe: false, id: "ID7" }, message: { conversation: "Quero comprar" }, messageTimestamp: 1762603200 } }, NOW);
  assertEquals(r.store.length, 1);
  assertEquals([r.store[0].direction, r.store[0].body, r.store[0].push_name, r.store[0].phone_tail], ["recebida", "Quero comprar", "João", "8888"]);
  assertEquals(r.store[0].phone, "5545999998888");
  assertMatch(r.store[0].wa_hash, /^[0-9a-f]{64}$/);
  assertEquals(r.store[0].message_key, r.inbound[0].message_key);
  const e = await planGatewayPayload(upsert({ fromMe: true, id: "ID8" }, { conversation: "Fechado!" }), NOW);
  assertEquals([e.store[0].direction, e.store[0].push_name], ["enviada", null]);
  const v = await planGatewayPayload(upsert({ id: "ID9" }, { imageMessage: {} }), NOW);
  assertEquals([v.store.length, v.store[0].body], [1, "[imagem]"]);
  const a = await planGatewayPayload(upsert({ id: "ID10" }, { audioMessage: {} }), NOW);
  assertEquals(a.store[0].body, "[áudio]");
  const x = await planGatewayPayload(upsert({ id: "ID11" }, { protocolMessage: {} }), NOW);
  assertEquals(x.store.length, 0);
});
