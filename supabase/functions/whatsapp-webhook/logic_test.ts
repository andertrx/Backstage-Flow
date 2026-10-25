import { assert, assertEquals } from "jsr:@std/assert@1";
import { extractEchoes, extractInbound, hasEchoes, phoneNumberIds, hmacSha256Hex, safeEqual, sha256Hex, validSignature } from "./logic.ts";

const payload = (messages: unknown[], phoneNumberId = "106540352242922") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "102290129340398", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId }, contacts: [{ wa_id: "5545999998888", profile: { name: "Ana" } }], messages } }] }],
});

Deno.test("assinatura do Meta: só aceita o corpo assinado com o segredo do app", async () => {
  const body = JSON.stringify(payload([]));
  const sig = "sha256=" + await hmacSha256Hex("segredo-do-app", body);
  assert(await validSignature(sig, body, "segredo-do-app"));
  assert(!(await validSignature(sig, body, "outro-segredo")));
  assert(!(await validSignature(sig, body + " ", "segredo-do-app")));
  assert(!(await validSignature(null, body, "segredo-do-app")));
  assert(safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "abcd"));
});

Deno.test("anúncio de clique para o WhatsApp: pega ctwa_clid e o ID do anúncio; número vira hash", async () => {
  const [m] = await extractInbound(payload([{
    from: "5545999998888", id: "wamid.HBgMNTU0NTk5OTk5ODg4OBUCABIYFjNFQjA", timestamp: "1790000000", type: "text",
    text: { body: "Olá! Vi o anúncio" },
    referral: { source_url: "https://fb.me/abc", source_id: "120210000000001", source_type: "ad", ctwa_clid: "ARAkLkA8rmlFeiCktEJQ-QTwRiyYHAFDLMNDBH0CD3qpjd0HR4irJ6LEkR7JwFF4XvnO2E4Nx0-eM-GABDLOPaOdRMv-_zfUQ2a" },
  }]), "106540352242922");
  assertEquals(m.wa_hash, await sha256Hex("5545999998888"));
  assertEquals(m.referral?.source_id, "120210000000001");
  assert(m.referral?.ctwa_clid?.startsWith("ARAk"));
  assertEquals(m.at, new Date(1790000000 * 1000).toISOString());
  assertEquals(m.message_key.length, 40);
  assert(!JSON.stringify(m).includes("5545999998888") && !JSON.stringify(m).includes("Vi o anúncio"));
});

Deno.test("código do botão do site dentro da mensagem", async () => {
  const [m] = await extractInbound(payload([{ from: "5545999998888", id: "wamid.2", timestamp: "1790000000", type: "text", text: { body: "Olá! Quero saber mais (ref. k7q2m9)" } }]), "106540352242922");
  assertEquals([m.ref_code, m.referral], ["K7Q2M9", null]);
});

Deno.test("ignora status de entrega, outro número e objeto que não é do WhatsApp", async () => {
  assertEquals(await extractInbound(payload([{ from: "5545999998888", id: "wamid.3", text: { body: "oi" } }], "999"), "106540352242922"), []);
  assertEquals(await extractInbound({ object: "page", entry: [] }, "106540352242922"), []);
  const statusOnly = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "106540352242922" }, statuses: [{ id: "wamid.x", status: "read" }] } }] }] };
  assertEquals(await extractInbound(statusOnly, "106540352242922"), []);
});

// Tracking T4.1: frases que o atendente manda (como no Tintim)
const echoes = (items: unknown[], field = "smb_message_echoes", phoneNumberId = "106540352242922") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "102290129340398", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId }, message_echoes: items } }] }],
});
const TRIGGERS = [
  { id: "t-venda", phrase: "Parabéns pela sua compra", kind: "venda" as const, currency: "BRL" },
  { id: "t-loja", phrase: "cadastro de lojista", kind: "perfil" as const, currency: "BRL" },
];

Deno.test("frase do atendente: acha a frase e o valor; número vira hash (com o 9 de volta); texto não sai", async () => {
  const p = echoes([{ from: "554530001111", to: "554599998888", id: "wamid.E1", timestamp: "1790000000", type: "text",
    text: { body: "Maria, parabéns pela sua compra de R$ 297,50! Seu cadastro de lojista está ativo." } }]);
  assert(hasEchoes(p));
  const [e] = await extractEchoes(p, "106540352242922", TRIGGERS);
  assertEquals(e.wa_hash, await sha256Hex("554599998888"));
  assertEquals(e.ph_hash, await sha256Hex("5545999998888"));
  assertEquals(e.matches, [{ trigger_id: "t-loja", value: undefined, currency: undefined }, { trigger_id: "t-venda", value: 297.5, currency: "BRL" }]);
  const out = JSON.stringify(e);
  assert(!out.includes("Maria") && !out.includes("99998888") && !out.includes("parab"));
});

Deno.test("mensagem do atendente sem frase, de outro número ou sem frases cadastradas: nada", async () => {
  const p = echoes([{ to: "5545999998888", id: "wamid.E2", type: "text", text: { body: "Bom dia! Tudo bem?" } }]);
  assertEquals(await extractEchoes(p, "106540352242922", TRIGGERS), []);
  const outro = echoes([{ to: "5545999998888", id: "wamid.E3", type: "text", text: { body: "Parabéns pela sua compra de R$ 10" } }], "smb_message_echoes", "999");
  assertEquals(await extractEchoes(outro, "106540352242922", TRIGGERS), []);
  assertEquals(await extractEchoes(echoes([{ to: "5545999998888", id: "wamid.E4", type: "text", text: { body: "Parabéns pela sua compra" } }]), "106540352242922", []), []);
  assert(!hasEchoes(payload([])));
});

Deno.test("mensagem enviada por ferramenta pela API (message_echoes) e legenda de imagem também valem", async () => {
  const p = echoes([{ to: "5545999998888", id: "wamid.E5", type: "image", image: { caption: "Parabéns pela sua compra! Total R$ 89,90" } }], "message_echoes");
  const [e] = await extractEchoes(p, "106540352242922", TRIGGERS);
  assertEquals(e.matches[0].value, 89.9);
});

Deno.test("T4.2: webhook do app da agência separa os avisos por número", () => {
  const p = { object: "whatsapp_business_account", entry: [
    { id: "1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "106540352242922" } } }, { field: "smb_message_echoes", value: { metadata: { phone_number_id: "106540352242922" } } }] },
    { id: "2", changes: [{ field: "messages", value: { metadata: { phone_number_id: "990000000042001" } } }] },
    { id: "3", changes: [{ field: "messages", value: { metadata: { phone_number_id: "lixo" } } }] },
  ] };
  assertEquals(phoneNumberIds(p), ["106540352242922", "990000000042001"]);
  assertEquals(phoneNumberIds({ object: "page" }), []);
});
