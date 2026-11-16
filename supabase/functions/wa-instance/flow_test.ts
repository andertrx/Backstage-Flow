import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { connect, type Deps, GatewayFailure, logout, remove, setWebhook, status } from "./flow.ts";

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

Deno.test("connect: instância nova → cria, configura o aviso com a chave e devolve o QR", async () => {
  const f = fake({
    "GET /instance/connectionState/{instance}": [{ status: 404 }],
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
});


Deno.test("connect: instância que já existe e ainda não conectou → pede o QR em /instance/connect", async () => {
  const f = fake({
    "GET /instance/connectionState/{instance}": [{ status: 200, body: { instance: { state: "close" } } }],
    "GET /instance/connect/{instance}": [{ status: 200, body: { base64: "data:image/png;base64,BBBB", code: "2@xyz" } }],
    "POST /webhook/set/{instance}": [{ status: 200 }],
  });
  const r = await connect(f.d, "81 95067-8760");
  assertEquals(r.state, "aguardando_leitura");
  assertEquals(f.calls.find((c) => c.path === "/instance/connect/{instance}")?.query?.number, "5581950678760");
  assert(!f.calls.some((c) => c.path === "/instance/create"));
});

Deno.test("connect: já conectado → liga sozinho e RECONFIGURA o aviso (a chave foi trocada)", async () => {
  const f = fake({
    "GET /instance/connectionState/{instance}": [{ status: 200, body: { instance: { state: "open" } } }],
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
    "GET /instance/connectionState/{instance}": [{ status: 404 }],
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

Deno.test("connect: telefone inválido é recusado antes de falar com o servidor; erro do servidor vira mensagem", async () => {
  const f = fake({});
  await assertRejects(() => connect(f.d, "123"), GatewayFailure, "Telefone inválido");
  assertEquals(f.calls.length, 0);
  const g = fake({ "GET /instance/connectionState/{instance}": [{ status: 401 }] });
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
  assertEquals((await remove(f.d)).removed, true);
  assertEquals(f.cleared(), 1);
  const g = fake({});
  g.cur.instance = null;
  assertEquals((await remove(g.d)).removed, false);
  const h = fake({ "DELETE /instance/delete/{instance}": [{ status: 500 }] });
  await assertRejects(() => remove(h.d), GatewayFailure);
  assertEquals(h.cleared(), 0);
});
