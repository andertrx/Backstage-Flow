import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildMarkIngest, connectionSchema, MarkError, markSchema, type MarkTarget, normalizeCode, webhookUrl } from "./logic.ts";

const site: MarkTarget = {
  eventPrefix: "wa.K7Q2M9", code: "K7Q2M9", container_id: "c1", client_id: "cl1", visitor_id: "visitante01", session_id: "sessao0001",
  page_url: "https://loja.com.br/planos?utm_source=facebook", fbp: "fb.1.1790000000000.123", fbc: "fb.1.1790000000000.IwAR",
  action_source: "chat", ctwa_clid: null, waba_id: null, ph_hash: null,
};
const opts = { test: false, now: new Date("2026-09-27T12:00:00Z"), randomId: "abc12345" };

Deno.test("código: aceita o que a pessoa digitar, do jeito que vier", () => {
  assertEquals(normalizeCode("ref. k7q-2m9 "), "K7Q2M9");
  assertEquals(normalizeCode("K7Q2M9"), "K7Q2M9");
  assertEquals(normalizeCode("REFA23"), "REFA23"); // código que começa com REF não é cortado
  assertEquals(normalizeCode("K7Q2M"), null);
  assertEquals(normalizeCode("K7Q2M1"), null); // 1, 0, O e I não existem no código (evita confusão)
});

Deno.test("Lead do WhatsApp (app comum): evento com id fixo (marcar 2x não duplica) e Meta como 'chat'", () => {
  const p = buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "lead" }), site, opts);
  assertEquals(p.event.event_id, "wa.K7Q2M9.lead");
  assertEquals(p.event.name, "Lead");
  assertEquals(p.event.page_path, "/planos");
  assertEquals(p.capi.action_source, "chat");
  assertEquals([p.capi.fbp, p.capi.fbc], [site.fbp, site.fbc]);
  assertEquals(p.event.custom_data, { canal: "whatsapp", ref: "K7Q2M9" });
  assertEquals(p.user, null);
});

Deno.test("Venda: valor em micros, moeda, nº do pedido; sem valor/moeda é recusada", () => {
  const p = buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "venda", value: 350.5, currency: "brl", orderId: "PED-9" }), site, opts);
  assertEquals([p.event.name, p.event.event_id, (p.event as any).value_micros, (p.event as any).currency, (p.event as any).transaction_id],
    ["Purchase", "wa.K7Q2M9.venda.PED-9", 350_500_000, "BRL", "PED-9"]);
  const sem = buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "venda", value: 10, currency: "BRL" }), site, opts);
  assertEquals(sem.event.event_id, "wa.K7Q2M9.venda.abc12345");
  assertThrows(() => buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "venda" }), site, opts), MarkError);
});

Deno.test("contato do cliente só em hash", () => {
  const H = "b".repeat(64);
  assertEquals(buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "lead", ud: { ph: H } }), site, opts).user, { ph: H });
  assertEquals(markSchema.safeParse({ action: "mark", code: "K7Q2M9", kind: "lead", ud: { ph: "45999998888" } }).success, false);
});

Deno.test("API oficial: conversa de anúncio vai como business_messaging, com o número (hash) do WhatsApp", () => {
  const conv: MarkTarget = { ...site, eventPrefix: "wac.77", code: null, fbp: null, fbc: null, action_source: "business_messaging",
    ctwa_clid: "ARAkLkA8", waba_id: "102290129340398", ph_hash: "c".repeat(64), page_url: null };
  const p = buildMarkIngest(markSchema.parse({ action: "mark", conversationId: 77, kind: "venda", value: 90, currency: "BRL", orderId: "P-1" }), conv, opts);
  assertEquals(p.event.event_id, "wac.77.venda.P-1");
  assertEquals([p.capi.action_source, p.capi.ctwa_clid, p.capi.waba_id], ["business_messaging", "ARAkLkA8", "102290129340398"]);
  assertEquals(p.user, { ph: "c".repeat(64) });
  assertEquals(p.event.custom_data, { canal: "whatsapp" });
});

Deno.test("marcação pede o código OU a conversa (não os dois, nem nenhum)", () => {
  assertEquals(markSchema.safeParse({ action: "mark", kind: "lead" }).success, false);
  assertEquals(markSchema.safeParse({ action: "mark", kind: "lead", code: "K7Q2M9", conversationId: 1 }).success, false);
});

Deno.test("conexão da API oficial: IDs só com números; endereço do webhook por conexão", () => {
  const ok = connectionSchema.safeParse({ action: "connection_save", containerId: "00000000-0000-4000-8000-000000000001", phoneNumberId: "106540352242922", wabaId: "102290129340398", enabled: true });
  assertEquals(ok.success, true);
  assertEquals(connectionSchema.safeParse({ action: "connection_save", containerId: "00000000-0000-4000-8000-000000000001", phoneNumberId: "+55 45", wabaId: "1", enabled: true }).success, false);
  assertEquals(webhookUrl("https://x.supabase.co/", "abc"), "https://x.supabase.co/functions/v1/whatsapp-webhook?c=abc");
});
