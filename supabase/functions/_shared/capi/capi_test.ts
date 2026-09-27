import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildMetaEvent, looksLikeToken, parseMetaResponse, type QueueRow, requestBody, sha256Hex } from "./meta.ts";
import { runSender } from "./sender.ts";

const H = "a".repeat(64);
const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  id: 1, destination_id: "d1", client_id: "c1", pixel_id: "123456789", test_event_code: null,
  event_id: "evt.1", event_name: "Purchase", occurred_at: "2026-09-27T12:00:00Z", visitor_id: "visitante01",
  page_url: "https://loja.com.br/pedido", custom_data: { value: 199.9, currency: "BRL", order_id: "P-1", formulario: "x", lista: [1] as unknown as string },
  user_agent: "Mozilla/5.0", ip_address: "200.1.2.3", fbp: "fb.1.1790000000000.123", fbc: "fb.1.1790000000000.IwAR", test: false, attempts: 1,
  em_hash: H, ph_hash: null, fn_hash: null, ln_hash: null, ...over,
});

Deno.test("evento no formato do Meta: mesmo event_id do navegador (deduplicação) e contato só em hash", async () => {
  const e = await buildMetaEvent(row()) as Record<string, any>;
  assertEquals(e.event_name, "Purchase");
  assertEquals(e.event_id, "evt.1");
  assertEquals(e.event_time, Math.floor(Date.parse("2026-09-27T12:00:00Z") / 1000));
  assertEquals(e.action_source, "website");
  assertEquals(e.event_source_url, "https://loja.com.br/pedido");
  assertEquals(e.user_data.em, [H]);
  assertEquals(e.user_data.external_id, [await sha256Hex("visitante01")]);
  assertEquals([e.user_data.client_ip_address, e.user_data.client_user_agent, e.user_data.fbp, e.user_data.fbc], ["200.1.2.3", "Mozilla/5.0", "fb.1.1790000000000.123", "fb.1.1790000000000.IwAR"]);
  assertEquals(e.custom_data, { value: 199.9, currency: "BRL", order_id: "P-1", formulario: "x" });
  assert(!("ph" in e.user_data));
});

Deno.test("token vai no corpo (nunca na URL) e o código de teste só quando existe", () => {
  assertEquals(JSON.parse(requestBody([{}], "TOKEN", null)), { data: [{}], access_token: "TOKEN" });
  assertEquals(JSON.parse(requestBody([{}], "TOKEN", "TEST123")).test_event_code, "TEST123");
});

Deno.test("resposta do Meta vira mensagem em português, sem token", () => {
  assertEquals(parseMetaResponse(200, { events_received: 2, fbtrace_id: "abc" }).eventsReceived, 2);
  const auth = parseMetaResponse(400, { error: { code: 190, message: "Invalid OAuth access_token=EAAsecret" } });
  assert(!auth.ok && auth.authProblem && auth.message!.includes("Token inválido"));
  assert(!JSON.stringify(auth).includes("EAAsecret"));
  const bad = parseMetaResponse(400, { error: { code: 100, message: "Invalid parameter", error_user_msg: "event_time muito antigo" } });
  assert(bad.invalidParameter && bad.message!.includes("event_time muito antigo"));
  assert(parseMetaResponse(503, {}).message!.includes("instável"));
  assert(looksLikeToken("EAA" + "x".repeat(100)) && !looksLikeToken("abc") && !looksLikeToken("EAA x y"));
});

function fakeDb(rows: QueueRow[], token: string | null = "EAA" + "t".repeat(60)) {
  const calls: { fn: string; args: any }[] = [];
  const db = {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === "tracking_capi_claim") return Promise.resolve({ data: rows, error: null });
      if (fn === "tracking_destination_secret_get") return Promise.resolve({ data: token, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

Deno.test("envio: lote ok → todos 'enviado' e registro sem token", async () => {
  const { db, calls } = fakeDb([row({ id: 1 }), row({ id: 2, event_id: "evt.2" })]);
  const bodies: any[] = [];
  const r = await runSender(db, (_u, init) => {
    bodies.push(JSON.parse(String(init.body)));
    return Promise.resolve(new Response(JSON.stringify({ events_received: 2, fbtrace_id: "t1" }), { status: 200 }));
  });
  assertEquals(r, { claimed: 2, sent: 2, failed: 0 });
  assertEquals(bodies[0].data.length, 2);
  assertEquals(calls.find((c) => c.fn === "tracking_capi_finish")!.args.p_results, [{ id: 1, ok: true }, { id: 2, ok: true }]);
  const log = calls.find((c) => c.fn === "tracking_capi_log_add")!.args.p;
  assertEquals([log.ok, log.events_count, log.events_received], [true, 2, 2]);
  assert(!JSON.stringify(log).includes("EAA"));
});

Deno.test("envio: dado inválido no lote → reenvia um a um e só o culpado falha", async () => {
  const { db, calls } = fakeDb([row({ id: 1 }), row({ id: 2, event_id: "evt.2" })]);
  const r = await runSender(db, (_u, init) => {
    const body = JSON.parse(String(init.body));
    const bad = body.data.some((e: any) => e.event_id === "evt.2");
    return Promise.resolve(bad
      ? new Response(JSON.stringify({ error: { code: 100, message: "Invalid parameter" } }), { status: 400 })
      : new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
  });
  assertEquals(r, { claimed: 2, sent: 1, failed: 1 });
  const res = calls.find((c) => c.fn === "tracking_capi_finish")!.args.p_results;
  assertEquals(res[0], { id: 1, ok: true });
  assertEquals(res[1].ok, false);
});

Deno.test("envio: sem token ou Meta fora do ar → erro (tenta de novo depois)", async () => {
  const noToken = fakeDb([row()], null);
  assertEquals(await runSender(noToken.db, () => Promise.reject(new Error("não deveria chamar"))), { claimed: 1, sent: 0, failed: 1 });
  const down = fakeDb([row()]);
  await runSender(down.db, () => Promise.reject(new Error("rede")));
  const res = down.calls.find((c) => c.fn === "tracking_capi_finish")!.args.p_results;
  assert(!res[0].ok && res[0].error.includes("Não conseguimos falar com o Meta"));
});

Deno.test("fila vazia: não chama o Meta", async () => {
  const { db, calls } = fakeDb([]);
  assertEquals(await runSender(db, () => Promise.reject(new Error("x"))), { claimed: 0, sent: 0, failed: 0 });
  assertEquals(calls.map((c) => c.fn), ["tracking_capi_claim"]);
});
