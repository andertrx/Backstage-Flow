import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { callGateway, gatewayProblem, gatewayUrl, mapConnectionState, normalizePhone, parseConnectResponse, safeBaseUrl } from "./logic.ts";

const cfg = { baseUrl: "https://whats.exemplo.com.br", instance: "meu chip", key: "CHAVE-SECRETA-123456" };

Deno.test("endereço da rota: instância codificada e barra final tirada", () => {
  assertEquals(gatewayUrl({ ...cfg, baseUrl: "https://whats.exemplo.com.br/" }, "/instance/connect/{instance}", { number: "5511999990000" }),
    "https://whats.exemplo.com.br/instance/connect/meu%20chip?number=5511999990000");
});

Deno.test("só aceita https com domínio (nunca IP, localhost, http)", () => {
  assert(safeBaseUrl("https://whats.exemplo.com.br"));
  assert(safeBaseUrl("https://a.b.com.br:8443"));
  for (const bad of ["http://x.com.br", "https://127.0.0.1", "https://localhost", "https://10.0.0.5:8080", "https://x.com.br/caminho", "ftp://x.com"]) assert(!safeBaseUrl(bad), bad);
});

Deno.test("estado da conexão", () => {
  assertEquals(mapConnectionState({ instance: { instanceName: "a", state: "open" } }), "conectado");
  assertEquals(mapConnectionState({ state: "close" }), "desconectado");
  assertEquals(mapConnectionState({ instance: { state: "connecting" } }), "aguardando_leitura");
  assertEquals(mapConnectionState({}), "desconhecido");
  assertEquals(mapConnectionState(null), "desconhecido");
});

Deno.test("resposta de conectar: QR e código só no formato seguro; create traz dentro de qrcode", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assertEquals(parseConnectResponse({ base64: png, pairingCode: "wzyeh1yy", count: 1 }), { qr: png, pairingCode: "WZYEH1YY", alreadyConnected: false });
  assertEquals(parseConnectResponse({ qrcode: { base64: png, pairingCode: null } }).qr, png);
  assertEquals(parseConnectResponse({ base64: "javascript:alert(1)" }).qr, null);
  assertEquals(parseConnectResponse({ base64: "data:text/html;base64,AAAA" }).qr, null);
  assertEquals(parseConnectResponse({ pairingCode: "<script>" }).pairingCode, null);
  assertEquals(parseConnectResponse({ instance: { state: "open" } }).alreadyConnected, true);
});

Deno.test("telefone do chip: só dígitos, 55 automático", () => {
  assertEquals(normalizePhone("(11) 98765-4321"), "5511987654321");
  assertEquals(normalizePhone("+55 11 98765-4321"), "5511987654321");
  assertEquals(normalizePhone("123"), null);
});

Deno.test("chamada: chave só no cabeçalho, método e corpo certos", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fake = ((url: string, init: RequestInit) => { seen = { url, init }; return Promise.resolve(new Response(JSON.stringify({ ok: 1 }), { status: 201 })); }) as unknown as typeof fetch;
  const r = await callGateway(cfg, "POST", "/instance/create", { body: { instanceName: "x" }, fetchImpl: fake });
  assertEquals(r, { status: 201, body: { ok: 1 } });
  assertEquals((seen!.init.headers as Record<string, string>).apikey, cfg.key);
  assert(!seen!.url.includes(cfg.key));
  assertEquals(seen!.init.redirect, "error");
});

Deno.test("falhas não vazam a chave nem o corpo", async () => {
  const down = (() => Promise.reject(new Error(`falhou com ${cfg.key}`))) as unknown as typeof fetch;
  const err = await assertRejects(() => callGateway(cfg, "GET", "/x", { fetchImpl: down }));
  assertEquals((err as Error).message, "SEM_CONEXAO");
  await assertRejects(() => callGateway({ ...cfg, baseUrl: "http://10.0.0.1" }, "GET", "/x"), Error, "ENDERECO_INSEGURO");
});

Deno.test("mensagens de problema em português", () => {
  assert(gatewayProblem(401).includes("recusou a chave"));
  assert(gatewayProblem("sem_conexao").includes("Confira o endereço"));
  assert(gatewayProblem(503).includes("deu erro"));
});
