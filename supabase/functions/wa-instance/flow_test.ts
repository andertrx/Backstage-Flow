import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { altBrNumber, connect, type Deps, GatewayFailure, logout, remove, setWebhook, status } from "./flow.ts";

type Call = { instance: string; method: string; path: string; body?: unknown; query?: Record<string, string> };

/** Servidor de WhatsApp simulado: responde por rota, na ordem em que foi configurado. */
function fake(routes: Record<string, Array<{ status: number; body?: unknown }>>) {
  const calls: Call[] = [];
  const states: Array<{ state: string; enable: boolean | null }> = [];
  let cleared = 0;
  const cur = { instance: "bf-aaaaaaaaaaaa" as string | null, state: null as string | null, enabled: false };
  const d: Deps = {
    inboundUrl: "https://x.supabase.co/functions/v1/wa-inbound?c=11111111-1111-4111-8111-111111111111",
    problem: (s) => `erro ${s}`,
    wait: () => Promise.resolve(),
    gw(instance, method, path, opts = {}) {
      calls.push({ instance, method, path, body: opts.body, query: opts.query });
      const list = routes[`${method} ${path}`];
      if (!list || list.length === 0) return Promise.resolve({ status: 500, body: null });
      const r = list.length > 1 ? list.shift()! : list[0];
      return Promise.resolve({ status: r.status, body: r.body ?? null });
    },
    prepare: () => Promise.resolve({ instance: "bf-aaaaaaaaaaaa", key: "chave-secreta-123", phone: "5581950678760" }),
    get: () => Promise.resolve({ ...cur }),
    setState: (state, enable) => { states.push({ state, enable }); return Promise.resolve(); },
    clear: () => { cleared++; return Promise.resolve(); },
  };
  return { d, calls, states, cur, cleared: () => cleared };
}

Deno.test("connect: instância nova (404) → cria já pedindo o QR, configura o aviso com a chave e devolve o QR", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 404 }],
    "POST /instance/create": [{ status: 201, body: { qrcode: { base64: "data:image/png;base64,AAAA", code: "2@abc" } } }],
    "POST /webhook/set/{instance}": [{ status: 201 }],
  });
  const r = await connect(f.d);
  assertEquals(r.state, "aguardando_leitura");
  assert(r.qr?.startsWith("data:image/png"));
  assertEquals(r.webhookOk, true);
  const create = f.calls.find((c) => c.path === "/instance/create")!;
  assertEquals((create.body as { instanceName: string }).instanceName, "bf-aaaaaaaaaaaa");
  const hook = f.calls.find((c) => c.path === "/webhook/set/{instance}")!;
  const w = (hook.body as { webhook: { url: string; headers: Record<string, string> } }).webhook;
  assert(w.url.includes("wa-inbound?c=11111111"));
  assertEquals(w.headers["x-webhook-key"], "chave-secreta-123");
  assertEquals(f.states.at(-1), { state: "aguardando_leitura", enable: null });
  assert(!f.calls.some((c) => c.path === "/instance/connectionState/{instance}"), "uma chamada a menos: não confere o estado antes de pedir o QR");
});

Deno.test("connect: instância que já existe → pede o QR direto em /instance/connect (sem criar)", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 200, body: { base64: "data:image/png;base64,BBBB", code: "2@xyz" } }],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d);
  assertEquals(r.state, "aguardando_leitura");
  assert(!f.calls.some((c) => c.path === "/instance/create"));
  assertEquals(f.calls.filter((c) => c.path === "/instance/connect/{instance}").length, 1);
});

Deno.test("connect: o QR demora a nascer → tenta de novo poucas vezes e entrega assim que vier", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [
      { status: 200, body: { count: 0 } },
      { status: 200, body: { count: 0 } },
      { status: 200, body: { base64: "data:image/png;base64,CCCC" } },
    ],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d);
  assertEquals(r.state, "aguardando_leitura");
  assert(r.qr?.startsWith("data:image/png;base64,CCCC"));
  assertEquals(f.calls.filter((c) => c.path === "/instance/connect/{instance}").length, 3);
});

Deno.test("connect: o servidor nunca gera o QR → avisa em vez de ficar esperando", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 200, body: { count: 0 } }],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d);
  assertEquals(r.state, "desconhecido");
  assertEquals(r.qr, null);
  assert(r.message?.includes("ainda não gerou o QR Code"));
  assertEquals(f.calls.filter((c) => c.path === "/instance/connect/{instance}").length, 5); // 1 + 4 tentativas
});

Deno.test("connect: já conectado → liga sozinho e RECONFIGURA o aviso (a chave foi trocada)", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 200, body: { instance: { state: "open" } } }],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d);
  assertEquals(r.state, "conectado");
  assertEquals(r.qr, null);
  assert(f.calls.some((c) => c.path === "/webhook/set/{instance}"), "o aviso precisa ser reconfigurado com a chave nova");
  assertEquals(f.states.at(-1), { state: "conectado", enable: true });
});

Deno.test("aviso: tenta o formato novo e, se o servidor não reconhece, o antigo", async () => {
  const f = fake({ "POST /webhook/set/{instance}": [{ status: 400 }, { status: 200 }] });
  assertEquals(await setWebhook(f.d, "bf-aaaaaaaaaaaa", "k"), true);
  assertEquals(f.calls.length, 2);
  assert("webhook" in (f.calls[0].body as object));
  assert(!("webhook" in (f.calls[1].body as object)));
});

Deno.test("aviso: se o servidor recusa os dois formatos, avisa que as mensagens não chegam (não finge que deu certo)", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 404 }],
    "POST /instance/create": [{ status: 201, body: { qrcode: { base64: "data:image/png;base64,AAAA" } } }],
    "POST /webhook/set/{instance}": [{ status: 404 }],
  });
  const r = await connect(f.d);
  assertEquals(r.webhookOk, false);
  assert(r.message?.includes("não chegam ao CRM"));
  const g = fake({ "POST /webhook/set/{instance}": [{ status: 500 }] });
  assertEquals(await setWebhook(g.d, "bf-a", "k"), false);
  assertEquals(g.calls.length, 1); // erro do servidor não tenta o outro formato
});

Deno.test("connect: erro do servidor vira mensagem amigável", async () => {
  const g = fake({ "GET /instance/connect/{instance}": [{ status: 401 }] });
  await assertRejects(() => connect(g.d), GatewayFailure, "erro 401");
});

Deno.test("status: ao passar para conectado liga sozinho; depois não religa", async () => {
  const f = fake({ "GET /instance/connectionState/{instance}": [{ status: 200, body: { instance: { state: "open" } } }] });
  f.cur.state = "aguardando_leitura";
  assertEquals((await status(f.d)).state, "conectado");
  assertEquals(f.states.at(-1), { state: "conectado", enable: true });
  f.cur.state = "conectado";
  await status(f.d);
  assertEquals(f.states.at(-1), { state: "conectado", enable: null });
});

Deno.test("status: sem instância, instância sumida e erro do servidor", async () => {
  const a = fake({});
  a.cur.instance = null;
  assertEquals((await status(a.d)).state, "desconhecido");
  assertEquals(a.calls.length, 0);
  const b = fake({ "GET /instance/connectionState/{instance}": [{ status: 404 }] });
  assertEquals((await status(b.d)).state, "desconhecido");
  const c = fake({ "GET /instance/connectionState/{instance}": [{ status: 502 }] });
  const r = await status(c.d);
  assertEquals(r.state, "erro");
  assertEquals(r.message, "erro 502");
});

Deno.test("logout desliga a conexão; remove limpa a instância (e não falha se ela já não existe)", async () => {
  const f = fake({ "DELETE /instance/logout/{instance}": [{ status: 200 }], "DELETE /instance/delete/{instance}": [{ status: 404 }] });
  assertEquals((await logout(f.d)).state, "desconectado");
  assertEquals(f.states.at(-1), { state: "desconectado", enable: false });
  // desconectar apaga de verdade: sai, apaga a instância no servidor e limpa o cadastro da instância
  assertEquals(f.calls.map((c) => `${c.method} ${c.path}`), ["DELETE /instance/logout/{instance}", "DELETE /instance/delete/{instance}"]);
  assertEquals(f.cleared(), 1);
  assertEquals((await remove(f.d)).removed, true);
  assertEquals(f.cleared(), 2);
  const g = fake({});
  g.cur.instance = null;
  assertEquals((await remove(g.d)).removed, false);
  const h = fake({ "DELETE /instance/delete/{instance}": [{ status: 500 }] });
  await assertRejects(() => remove(h.d), GatewayFailure);
  assertEquals(h.cleared(), 0);
});


Deno.test("código: pede /instance/connect com o número e devolve o código de pareamento", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 200, body: { pairingCode: "ABCD1234", code: "2@x" } }],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d, "81 99506-7876");
  assertEquals(r.pairingCode, "ABCD1234");
  assertEquals(r.pairingNumber, "5581995067876");
  assertEquals(r.state, "aguardando_leitura");
  assertEquals(f.calls.find((c) => c.path === "/instance/connect/{instance}")?.query?.number, "5581995067876");
});

Deno.test("código: instância nova nasce já com o número", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 404 }],
    "POST /instance/create": [{ status: 201, body: { qrcode: { pairingCode: "WXYZ5678", base64: "data:image/png;base64,AAAA" } } }],
    "POST /webhook/set/{instance}": [{ status: 201 }],
  });
  const r = await connect(f.d, "5581995067876");
  assertEquals(r.pairingCode, "WXYZ5678");
  assertEquals((f.calls.find((c) => c.path === "/instance/create")!.body as { number: string }).number, "5581995067876");
});

Deno.test("código: conexão que já existia devolve só QR (pairingCode vazio) → apaga e recria já com o número, e refaz o aviso", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 200, body: { pairingCode: null, code: "2@x", base64: "data:image/png;base64,AAAA", count: 1 } }],
    "DELETE /instance/delete/{instance}": [{ status: 200 }],
    "POST /instance/create": [{ status: 201, body: { qrcode: { pairingCode: "ABCD1234", code: "2@y", base64: "data:image/png;base64,BBBB" } } }],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d, "67 98105-6623");
  assertEquals(r.pairingCode, "ABCD1234");
  assertEquals(r.pairingNumber, "5567981056623");
  const ordem = f.calls.map((c) => `${c.method} ${c.path}`);
  assertEquals(ordem.filter((x) => x === "DELETE /instance/delete/{instance}").length, 1);
  assertEquals((f.calls.find((c) => c.path === "/instance/create")!.body as { number: string }).number, "5567981056623");
  // o último aviso configurado vem DEPOIS de criar a instância nova (senão a nova ficaria sem aviso)
  assert(ordem.lastIndexOf("POST /webhook/set/{instance}") > ordem.indexOf("POST /instance/create"));
});

Deno.test("código: se a 1ª criação não gera código, recria com a outra forma do número (com/sem o 9)", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 200, body: { pairingCode: null, base64: "data:image/png;base64,AAAA" } }],
    "DELETE /instance/delete/{instance}": [{ status: 200 }],
    "POST /instance/create": [
      { status: 201, body: { qrcode: { pairingCode: null, base64: "data:image/png;base64,BBBB" } } }, // número como veio: sem código
      { status: 201, body: { qrcode: { pairingCode: "WXYZ5678", base64: "data:image/png;base64,CCCC" } } }, // forma com o 9: gerou
    ],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d, "67 8105-6623"); // 8 dígitos depois do DDD
  assertEquals(r.pairingCode, "WXYZ5678");
  assertEquals(r.pairingNumber, "5567981056623");
  const criacoes = f.calls.filter((c) => c.path === "/instance/create").map((c) => (c.body as { number: string }).number);
  assertEquals(criacoes, ["556781056623", "5567981056623"]);
});

Deno.test("código: se nenhuma forma gera código, avisa e mantém o QR (não fica 'esperando')", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 200, body: { pairingCode: null, base64: "data:image/png;base64,AAAA" } }],
    "DELETE /instance/delete/{instance}": [{ status: 200 }],
    "POST /instance/create": [{ status: 201, body: { qrcode: { pairingCode: null, base64: "data:image/png;base64,BBBB" } } }],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d, "5567981056623");
  assertEquals(r.pairingCode, null);
  assertEquals(r.state, "aguardando_leitura");
  assert(r.qr?.startsWith("data:image/png"));
  assert(r.message?.includes("não gerou o código"));
});

Deno.test("código: não apaga a conexão se o servidor recusa o pedido de apagar (erro do servidor)", async () => {
  const f = fake({
    "GET /instance/connect/{instance}": [{ status: 200, body: { pairingCode: null, base64: "data:image/png;base64,AAAA" } }],
    "DELETE /instance/delete/{instance}": [{ status: 500 }],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d, "5567981056623");
  assertEquals(f.calls.some((c) => c.path === "/instance/create"), false);
  assert(r.qr?.startsWith("data:image/png"));
});

Deno.test("código: telefone inválido é recusado antes de falar com o servidor", async () => {
  const f = fake({});
  await assertRejects(() => connect(f.d, "123"), GatewayFailure, "Telefone inválido");
  assertEquals(f.calls.length, 0);
});

Deno.test("altBrNumber: forma com e sem o 9; ignora número de fora do Brasil", () => {
  assertEquals(altBrNumber("558195067876"), "5581995067876");
  assertEquals(altBrNumber("5581995067876"), "558195067876");
  assertEquals(altBrNumber("5541322112345"), null);
  assertEquals(altBrNumber("14155550123"), null);
});
