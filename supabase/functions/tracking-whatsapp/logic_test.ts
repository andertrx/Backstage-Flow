import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildMarkIngest, type Click, MarkError, markSchema, normalizeCode } from "./logic.ts";

const click: Click = {
  code: "K7Q2M9", container_id: "c1", client_id: "cl1", visitor_id: "visitante01", session_id: "sessao0001",
  page_url: "https://loja.com.br/planos?utm_source=facebook", fbp: "fb.1.1790000000000.123", fbc: "fb.1.1790000000000.IwAR",
};
const opts = { test: false, now: new Date("2026-09-27T12:00:00Z"), randomId: "abc12345" };

Deno.test("código: aceita o que a pessoa digitar, do jeito que vier", () => {
  assertEquals(normalizeCode("ref. k7q-2m9 "), "K7Q2M9");
  assertEquals(normalizeCode("K7Q2M9"), "K7Q2M9");
  assertEquals(normalizeCode("REFA23"), "REFA23"); // código que começa com REF não é cortado
  assertEquals(normalizeCode("K7Q2M"), null);
  assertEquals(normalizeCode("K7Q2M1"), null); // 1, 0, O e I não existem no código (evita confusão)
});

Deno.test("Lead do WhatsApp: evento com id fixo (marcar 2x não duplica) e Meta como 'chat'", () => {
  const p = buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "lead" }), click, opts);
  assertEquals(p.event.event_id, "wa.K7Q2M9.lead");
  assertEquals(p.event.name, "Lead");
  assertEquals(p.event.page_path, "/planos");
  assertEquals(p.capi, { user_agent: null, ip: null, fbp: click.fbp, fbc: click.fbc, action_source: "chat" });
  assertEquals(p.event.custom_data, { canal: "whatsapp", ref: "K7Q2M9" });
  assertEquals(p.user, null);
});

Deno.test("Venda: valor em micros, moeda, nº do pedido; sem valor/moeda é recusada", () => {
  const p = buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "venda", value: 350.5, currency: "brl", orderId: "PED-9" }), click, opts);
  assertEquals([p.event.name, p.event.event_id, (p.event as any).value_micros, (p.event as any).currency, (p.event as any).transaction_id],
    ["Purchase", "wa.K7Q2M9.venda.PED-9", 350_500_000, "BRL", "PED-9"]);
  const sem = buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "venda", value: 10, currency: "BRL" }), click, opts);
  assertEquals(sem.event.event_id, "wa.K7Q2M9.venda.abc12345");
  assertThrows(() => buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "venda" }), click, opts), MarkError);
});

Deno.test("contato do cliente só em hash", () => {
  const H = "b".repeat(64);
  assertEquals(buildMarkIngest(markSchema.parse({ action: "mark", code: "K7Q2M9", kind: "lead", ud: { ph: H } }), click, opts).user, { ph: H });
  assertEquals(markSchema.safeParse({ action: "mark", code: "K7Q2M9", kind: "lead", ud: { ph: "45999998888" } }).success, false);
});
