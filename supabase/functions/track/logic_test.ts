import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildIngest,
  checkOrigin,
  type Container,
  deviceFromUserAgent,
  eventTime,
  ipBucket,
  parseBeacon,
  purchaseOf,
  sanitizeUrl,
  stripPersonalData,
  TrackError,
} from "./logic.ts";

const container: Container = {
  id: "c1",
  client_id: "cl1",
  allowed_domains: ["cliente.com.br"],
  status: "ativo",
  test_mode: true,
  consent_mode: "nao_exigir",
};
const NOW = Date.parse("2026-09-27T12:00:00Z");
const base = {
  k: "bf_0123456789abcdef01234567",
  v: "visitante01",
  s: "sessao0001",
  e: "evt_00000001",
  n: "PageView",
  t: NOW - 1000,
  u: "https://www.cliente.com.br/?utm_source=facebook&bf_c=123&email=ana@x.com",
};

Deno.test("aceita o envio do script e recusa campos fora do formato", () => {
  assertEquals(parseBeacon(JSON.stringify(base)).n, "PageView");
  for (const bad of [{ ...base, k: "chave" }, { ...base, v: "a" }, { ...base, n: "1ruim" }, { ...base, u: "javascript:alert(1)" }]) {
    const err = assertThrows(() => parseBeacon(JSON.stringify(bad)), TrackError);
    assertEquals(err.status, 400);
  }
  assertEquals(assertThrows(() => parseBeacon("{"), TrackError).code, "INVALID_JSON");
  assertEquals(assertThrows(() => parseBeacon("x".repeat(9000)), TrackError).status, 413);
});

Deno.test("só domínios autorizados (e subdomínios) podem enviar", () => {
  assertEquals(checkOrigin("https://www.cliente.com.br", base.u, container), "https://www.cliente.com.br");
  assertEquals(assertThrows(() => checkOrigin("https://golpe.com", base.u, container), TrackError).code, "DOMAIN_NOT_ALLOWED");
  assertEquals(assertThrows(() => checkOrigin("https://www.cliente.com.br", "https://golpe.com/", container), TrackError).code, "DOMAIN_NOT_ALLOWED");
  assertEquals(assertThrows(() => checkOrigin(null, base.u, container), TrackError).code, "ORIGIN_REQUIRED");
});

Deno.test("a URL gravada perde tudo que não é campanha (evita dado pessoal)", () => {
  assertEquals(sanitizeUrl(base.u), { url: "https://www.cliente.com.br/?utm_source=facebook&bf_c=123", path: "/" });
  assertEquals(sanitizeUrl("https://s.com/obrigado?nome=Ana&tel=11999").url, "https://s.com/obrigado");
});

Deno.test("origem recalculada no servidor, só na chegada", () => {
  const withTouch = buildIngest({ ...parseBeacon(JSON.stringify(base)), nt: true }, container, { nowMs: NOW, userAgent: null });
  assertEquals(withTouch.touch?.channel, "meta");
  assertEquals(withTouch.touch?.evidence, "confirmada");
  assertEquals(withTouch.touch?.ad_campaign_id, "123");
  assertEquals(withTouch.touch?.utm_source, "facebook");
  assertEquals(withTouch.test, true);
  assertEquals(withTouch.event.referrer_host, null);
  const noTouch = buildIngest(parseBeacon(JSON.stringify(base)), container, { nowMs: NOW, userAgent: null });
  assertEquals(noTouch.touch, null);
  const internal = buildIngest({ ...parseBeacon(JSON.stringify(base)), u: "https://cliente.com.br/p", r: "https://cliente.com.br/", nt: true }, container, { nowMs: NOW, userAgent: null });
  assertEquals(internal.touch, null);
  const other = buildIngest({ ...parseBeacon(JSON.stringify(base)), u: "https://cliente.com.br/?ttclid=T1", nt: true }, container, { nowMs: NOW, userAgent: null });
  assertEquals(other.touch?.other_click_ids, { ttclid: "T1" });
});

Deno.test("horário do navegador, salvo relógio muito errado", () => {
  assertEquals(eventTime(NOW - 5000, NOW), new Date(NOW - 5000).toISOString());
  assertEquals(eventTime(NOW + 24 * 3600 * 1000, NOW), new Date(NOW).toISOString());
  assertEquals(eventTime(Date.parse("2020-01-01"), NOW), new Date(NOW).toISOString());
});

Deno.test("tipo de aparelho pelo navegador (não gravado)", () => {
  assertEquals(deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), "mobile");
  assertEquals(deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assertEquals(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
  assertEquals(deviceFromUserAgent(null), "desconhecido");
});

Deno.test("IP vira um código que muda todo dia (não dá para voltar ao IP)", async () => {
  const a = await ipBucket("200.1.2.3", "sal", "2026-09-27");
  assertEquals(a.length, 35);
  assertEquals(a === (await ipBucket("200.1.2.3", "sal", "2026-09-28")), false);
  assertEquals(a.includes("200"), false);
});

const H = "a".repeat(64);

Deno.test("dados de contato: só aceita hash (texto legível é recusado)", () => {
  const b = parseBeacon(JSON.stringify({ ...base, n: "Lead", ud: { em: H, ph: H } }));
  assertEquals(buildIngest(b, container, { nowMs: NOW, userAgent: null }).user, { em: H, ph: H });
  assertEquals(assertThrows(() => parseBeacon(JSON.stringify({ ...base, n: "Lead", ud: { em: "ana@x.com" } })), TrackError).status, 400);
  assertEquals(assertThrows(() => parseBeacon(JSON.stringify({ ...base, n: "Lead", ud: { email: H } })), TrackError).status, 400);
  assertEquals(buildIngest(parseBeacon(JSON.stringify(base)), container, { nowMs: NOW, userAgent: null }).user, null);
});

Deno.test("dados extras: o que parece dado pessoal é descartado", () => {
  assertEquals(
    stripPersonalData({ formulario: "contato", email: "a@b.com", obs: "me liga 45 99999-8888", produto_nome: "Plano", nota: "x@y.com.br", valor: 10 }),
    { formulario: "contato", produto_nome: "Plano", valor: 10 },
  );
});

Deno.test("compra: valor e moeda obrigatórios, valor em micros e nº do pedido", () => {
  const b = parseBeacon(JSON.stringify({ ...base, n: "Purchase", cd: { value: 199.9, currency: "brl", transaction_id: "P-1" } }));
  const ev = buildIngest(b, container, { nowMs: NOW, userAgent: null }).event as Record<string, unknown>;
  assertEquals([ev.value_micros, ev.currency, ev.transaction_id], [199_900_000, "BRL", "P-1"]);
  assertEquals(purchaseOf({ ...b, cd: { value: 10, currency: "USD" } }).transaction_id, null);
  for (const cd of [{ currency: "BRL" }, { value: 10 }, { value: -1, currency: "BRL" }, { value: 10, currency: "REAL" }, { value: 1, currency: "BRL", transaction_id: "pedido 1" }]) {
    assertEquals(assertThrows(() => parseBeacon(JSON.stringify({ ...base, n: "Purchase", cd })), TrackError).code, "INVALID_PURCHASE");
  }
});
