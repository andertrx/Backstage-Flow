import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { buildReceive, readCredentials } from "./logic.ts";

const ID = "0f8e6c2a-1b2c-4d3e-8f90-123456789abc";
const KEY = "a".repeat(48);
const mapping = { order: "order.id", value: "order.total", phone: "buyer.phone", email: "buyer.email", status: "status", status_values: ["paid"] };
const sha = async (t: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))), (b) => b.toString(16).padStart(2, "0")).join("");

Deno.test("credenciais: cabeçalho ou endereço; formato errado é recusado", () => {
  assertEquals(readCredentials(new URL(`https://x/?w=${ID}`), new Headers({ "x-webhook-key": KEY })), { id: ID, key: KEY });
  assertEquals(readCredentials(new URL(`https://x/?w=${ID}&k=${KEY}`), new Headers()), { id: ID, key: KEY });
  assertEquals(readCredentials(new URL(`https://x/?w=${ID}&k=curta`), new Headers()), null);
  assertEquals(readCredentials(new URL(`https://x/?w=nada`), new Headers({ "x-webhook-key": KEY })), null);
});

Deno.test("venda: telefone e e-mail viram só hash; nomes dos campos sem valores", async () => {
  const body = JSON.stringify({ status: "paid", order: { id: "P-1", total: "297,50" }, buyer: { phone: "(45) 99999-8888", email: " Maria@Loja.com " } });
  const p = await buildReceive(ID, body, "application/json", mapping);
  assertEquals(p.order_id, "P-1");
  assertEquals(p.value, 297.5);
  assertEquals(p.currency, "BRL");
  assertEquals(p.ph_hash, await sha("5545999998888"));
  assertEquals(p.em_hash, await sha("maria@loja.com"));
  assertEquals(p.keys, ["status", "order.id", "order.total", "buyer.phone", "buyer.email"]);
  const out = JSON.stringify(p);
  assertEquals(out.includes("99999") || out.includes("Maria"), false);
});

Deno.test("aviso fora do formato, sem mapeamento ou status que não conta", async () => {
  assertEquals((await buildReceive(ID, "<xml/>", "text/xml", mapping)).result, "recusado");
  const noMap = await buildReceive(ID, '{"a":1}', "application/json", null);
  assertEquals(noMap.result, "recusado");
  assertEquals(noMap.keys, ["a"]);
  const pend = await buildReceive(ID, JSON.stringify({ status: "pending", order: { id: "P", total: 1 } }), null, mapping);
  assertEquals(pend.result, "ignorado");
  assertMatch(String(pend.reason), /pending/);
});
