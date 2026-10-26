import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { Client } from "npm:@modelcontextprotocol/sdk@1.32.1/client/index.js";
import { StreamableHTTPClientTransport } from "npm:@modelcontextprotocol/sdk@1.32.1/client/streamableHttp.js";
import { AuthError, bearer, oauthClientId } from "./auth.ts";
import { type DataPort, DataError, likeEscape } from "./data.ts";
import { createHandler, type Deps, type LogEntry } from "./server.ts";
import { type Caller, period, summaryOut, TOOLS } from "./tools.ts";

/**
 * Etapa 40 — testes do servidor MCP com o CLIENTE OFICIAL do SDK conversando com o servidor (HTTP simulado em memória).
 * Os dados vêm de um "banco" falso; o isolamento real entre clientes é testado no banco (supabase/tests/etapa40_mcp.sql)
 * e no teste ao vivo.
 */

const BASE = "https://exemplo.supabase.co/functions/v1/mcp";
const USERS: Record<string, Caller> = {
  "tok-admin": { id: "00000000-0000-4000-8000-000000000001", name: "Ander", role: "admin" },
  "tok-visu": { id: "00000000-0000-4000-8000-000000000002", name: "Visu", role: "visualizador" },
  "tok-equipe": { id: "00000000-0000-4000-8000-000000000003", name: "Equipe", role: "equipe" },
};
const CLI_A = "a0000000-0000-4000-8000-00000000000a";
const CLI_B = "b0000000-0000-4000-8000-00000000000b";

/** Banco falso: o visualizador só "vê" o cliente A (como o RLS faria). */
function fakeData(user: Caller, opts: { slow?: boolean; broken?: boolean } = {}): DataPort {
  const visible = user.role === "admin" ? [CLI_A, CLI_B] : [CLI_A];
  const clients = [
    { id: CLI_A, name: "Loja A", status: "ativo", timezone: "America/Sao_Paulo", is_demo: false },
    { id: CLI_B, name: "Loja B", status: "ativo", timezone: "America/Sao_Paulo", is_demo: false },
  ].filter((c) => visible.includes(c.id));
  return {
    ping: () => (opts.broken ? Promise.reject(new Error("fora do ar")) : Promise.resolve()),
    lastSync: () => Promise.resolve({ finished_at: "2026-10-26T10:00:00Z", status: "sucesso" }),
    opsPermissions: () => Promise.resolve(user.role === "admin" ? ["ops.access"] : []),
    listClients: ({ limit, offset }) => Promise.resolve({ rows: clients.slice(offset, offset + limit), total: clients.length }),
    accounts: (ids) => Promise.resolve(ids.includes(CLI_A) ? [{ id: "acc-a", client_id: CLI_A, name: "Conta A", platform_id: "meta", currency: "BRL", status: "ativa" }] : []),
    summary: async (f) => {
      if (opts.slow) await new Promise((r) => setTimeout(r, 300));
      if (opts.broken) throw new DataError("XX000", "conexão perdida com segredo sb_secret_abc");
      const asked = f.clientIds ?? visible;
      if (!asked.some((id) => visible.includes(id))) return [];
      return [
        { currency: "BRL", spend_micros: 150_500_000, impressions: 10_000, clicks: 200, link_clicks: 150, leads: 10, messages: 3, conversions: 2, conversion_value_micros: 900_000_000, accounts: 1 },
        { currency: "USD", spend_micros: 20_000_000, impressions: 1_000, clicks: 0, link_clicks: 0, leads: 0, messages: 0, conversions: 0, conversion_value_micros: 0, accounts: 1 },
      ];
    },
    alerts: (open, limit) => Promise.resolve([{ id: 1, severity: "critico", status: "novo", client_name: "Loja A", dedupe_key: "interno", context: { x: 1 } }].slice(0, limit)),
    campaign: (id) => Promise.resolve(id === "c0000000-0000-4000-8000-00000000000c"
      ? { id, client_id: CLI_A, ad_account_id: "acc-a", platform_id: "meta", external_id: "123", name: "Campanha A", objective: "OUTCOME_LEADS", status: "ativa",
          effective_status: "ACTIVE", budget_micros: 50_000_000, budget_period: "diario", bid_strategy: null, start_date: "2026-10-01", end_date: null, last_seen_at: null }
      : null),
    client: (id) => Promise.resolve(clients.find((c) => c.id === id) ?? null),
    account: () => Promise.resolve({ id: "acc-a", client_id: CLI_A, name: "Conta A", platform_id: "meta", currency: "BRL", status: "ativa" }),
    mcpHealth: () => Promise.resolve({ escopo: "só as suas chamadas", chamadas: 3 }),
  };
}

function setup(opts: { slow?: boolean; broken?: boolean; limit?: number; timeoutMs?: number } = {}) {
  const logs: LogEntry[] = [];
  const errors: string[] = [];
  const hits = new Map<string, number>();
  const deps: Deps = {
    authenticate: (token) => {
      if (!token) return Promise.reject(new AuthError(401, "UNAUTHENTICATED", "Faça login no Backstage Flow para usar o MCP."));
      if (token === "tok-cliente") return Promise.reject(new AuthError(403, "FORBIDDEN", "Seu tipo de usuário não pode usar o MCP nesta versão."));
      const u = USERS[token];
      return u ? Promise.resolve(u) : Promise.reject(new AuthError(401, "UNAUTHENTICATED", "Login expirado ou inválido. Conecte de novo."));
    },
    rateLimit: (id) => {
      const n = (hits.get(id) ?? 0) + 1;
      hits.set(id, n);
      return Promise.resolve(n <= (opts.limit ?? 1000));
    },
    log: (e) => {
      logs.push(e);
      return Promise.resolve();
    },
    reportError: (code) => {
      errors.push(code);
      return Promise.resolve();
    },
    dataFor: (token) => fakeData(USERS[token], opts),
    now: () => new Date("2026-10-26T15:00:00Z"),
    timeoutMs: opts.timeoutMs ?? 5_000,
    resourceUrl: BASE,
    authServerUrl: "https://exemplo.supabase.co/auth/v1",
  };
  const handler = createHandler(deps);
  const fetchFn = (input: string | URL | Request, init?: RequestInit) => handler(new Request(input, init));
  return { handler, fetchFn, logs, errors };
}

async function connect(token: string, opts: Parameters<typeof setup>[0] = {}) {
  const s = setup(opts);
  const client = new Client({ name: "teste", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(BASE), {
    fetch: s.fetchFn, requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  return { client, ...s };
}

type ToolInfo = { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } };
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);
const json = (r: unknown) => JSON.parse(text(r));

Deno.test("conecta pelo cliente oficial, identifica nome/versão e lista só ferramentas de leitura", async () => {
  const { client } = await connect("tok-admin");
  assertEquals(client.getServerVersion()?.name, "backstage-flow");
  const { tools } = await client.listTools();
  assertEquals(tools.map((t: ToolInfo) => t.name).sort(), TOOLS.map((t) => t.name).sort());
  assert(tools.every((t: ToolInfo) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false), "todas marcadas como só leitura");
  assert(!tools.some((t: ToolInfo) => /delete|update|create|pause|edit|sql|shell|file|apagar|alterar|pausar|excluir/i.test(t.name)), "nenhuma de escrita");
  const res = await client.listResources();
  assertEquals(res.resources.map((r: { uri: string }) => r.uri), ["backstage://guia"]);
  const guia = await client.readResource({ uri: "backstage://guia" });
  assertMatch((guia.contents[0] as { text: string }).text, /Somente leitura/);
  await client.close();
});

Deno.test("cada papel vê só as ferramentas que pode usar (equipe: sem métricas)", async () => {
  const { client } = await connect("tok-equipe");
  const names = (await client.listTools()).tools.map((t: ToolInfo) => t.name).sort();
  assertEquals(names, ["backstage_capabilities", "backstage_mcp_health", "backstage_status"]);
  const cap = json(await client.callTool({ name: "backstage_capabilities", arguments: {} }));
  assertEquals(cap.modulos_liberados_no_crm, []);
  await client.close();
});

Deno.test("status: sem segredos; banco fora do ar aparece como indisponível", async () => {
  const { client, logs } = await connect("tok-admin");
  const s = json(await client.callTool({ name: "backstage_status", arguments: {} }));
  assertEquals(s.sistema, "Backstage Flow");
  assertEquals(s.banco.estado, "funcionando");
  assertEquals(s.servidor_mcp.modo, "somente leitura");
  assert(!/key|secret|token|senha|password/i.test(JSON.stringify(s)), "sem segredos");
  assertEquals(logs.at(-1)?.tool, "backstage_status");
  assertEquals(logs.at(-1)?.ok, true);
  await client.close();
  const b = await connect("tok-admin", { broken: true });
  assertEquals(json(await b.client.callTool({ name: "backstage_status", arguments: {} })).banco.estado, "indisponível");
  await b.client.close();
});

Deno.test("clientes: só os liberados, paginado, sem dados pessoais", async () => {
  const { client } = await connect("tok-visu");
  const r = json(await client.callTool({ name: "backstage_list_clients", arguments: { limite: 10 } }));
  assertEquals(r.total, 1);
  assertEquals(r.clientes[0].nome, "Loja A");
  assertEquals(r.clientes[0].contas_de_anuncio[0].moeda, "BRL");
  assert(!/cnpj|phone|email|telefone/i.test(JSON.stringify(r)));
  await client.close();
});

Deno.test("métricas: moedas separadas, indicadores só com números reais, isolamento por ID", async () => {
  const { client } = await connect("tok-visu");
  const r = json(await client.callTool({ name: "backstage_get_metrics", arguments: { data_inicio: "2026-10-01", data_fim: "2026-10-26" } }));
  assertEquals(r.por_moeda.map((x: { moeda: string }) => x.moeda), ["BRL", "USD"]);
  assertEquals(r.por_moeda[0].investimento, 150.5);
  assertEquals(r.por_moeda[0].ctr_pct, 2);
  assertEquals(r.por_moeda[0].custo_por_lead, 15.05);
  assertEquals(r.por_moeda[1].cpc, null, "sem cliques: CPC não é inventado");
  // Pedir o cliente B (não liberado) pelo ID não traz nada
  const b = json(await client.callTool({ name: "backstage_get_metrics", arguments: { cliente_ids: [CLI_B] } }));
  assertEquals(b.por_moeda, []);
  await client.close();
});

Deno.test("parâmetros inválidos são recusados com mensagem clara", async () => {
  const { client, logs } = await connect("tok-admin");
  const bad = await client.callTool({ name: "backstage_get_metrics", arguments: { data_inicio: "26/10/2026" } });
  assert(bad.isError);
  const long = await client.callTool({ name: "backstage_get_metrics", arguments: { data_inicio: "2024-01-01", data_fim: "2026-10-26" } });
  assert(long.isError);
  assertMatch(text(long), /máximo 400 dias/);
  assertEquals(logs.at(-1)?.errorCode, "INVALID_INPUT");
  const inverted = await client.callTool({ name: "backstage_get_metrics", arguments: { data_inicio: "2026-10-20", data_fim: "2026-10-01" } });
  assertMatch(text(inverted), /antes da data de fim/);
  const notUuid = await client.callTool({ name: "backstage_get_campaign", arguments: { campanha_id: "1 or 1=1" } });
  assert(notUuid.isError);
  const tooMany = await client.callTool({ name: "backstage_list_clients", arguments: { limite: 1000 } });
  assert(tooMany.isError);
  const unknown = await client.callTool({ name: "backstage_delete_client", arguments: {} }).catch((e: Error) => ({ isError: true, content: [{ text: e.message }] }));
  assert((unknown as { isError?: boolean }).isError, "ferramenta que não existe");
  await client.close();
});

Deno.test("campanha: detalhe, não encontrada, alertas sem campos internos", async () => {
  const { client } = await connect("tok-admin");
  const c = json(await client.callTool({ name: "backstage_get_campaign", arguments: { campanha_id: "c0000000-0000-4000-8000-00000000000c" } }));
  assertEquals(c.campanha.orcamento, { valor: 50, moeda: "BRL", periodo: "diario" });
  assertEquals(c.campanha.estrategia_de_lance, "Informação não disponível pela API");
  const nf = await client.callTool({ name: "backstage_get_campaign", arguments: { campanha_id: "d0000000-0000-4000-8000-00000000000d" } });
  assert(nf.isError);
  assertMatch(text(nf), /não encontrada ou não liberada/);
  const a = json(await client.callTool({ name: "backstage_list_alerts", arguments: {} }));
  assertEquals(a.alertas[0].severity, "critico");
  assertEquals(a.alertas[0].dedupe_key, undefined);
  await client.close();
});

Deno.test("erro interno: mensagem amigável, sem detalhe técnico; vai para o registro de erros", async () => {
  const { client, errors, logs } = await connect("tok-admin", { broken: true });
  const r = await client.callTool({ name: "backstage_get_metrics", arguments: {} });
  assert(r.isError);
  assertMatch(text(r), /indisponível no momento/);
  assert(!text(r).includes("sb_secret"), "não vaza detalhe interno");
  assertEquals(errors, ["MCP_TOOL_FAILED"]);
  assertEquals(logs.at(-1)?.errorCode, "INTERNAL");
  await client.close();
});

Deno.test("tempo limite: consulta lenta é interrompida e registrada", async () => {
  const { client, logs } = await connect("tok-admin", { slow: true, timeoutMs: 50 });
  const r = await client.callTool({ name: "backstage_get_metrics", arguments: {} });
  assert(r.isError);
  assertMatch(text(r), /Tempo limite excedido/);
  assertEquals(logs.at(-1)?.errorCode, "TIMEOUT");
  await client.close();
});

Deno.test("sem login: 401 com o endereço de descoberta do login; token na URL é recusado", async () => {
  const { handler } = setup();
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const h = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const r = await handler(new Request(BASE, { method: "POST", headers: h, body }));
  assertEquals(r.status, 401);
  assertMatch(r.headers.get("WWW-Authenticate") ?? "", /resource_metadata="https:\/\/exemplo\.supabase\.co\/functions\/v1\/mcp\/\.well-known\/oauth-protected-resource"/);
  const bad = await handler(new Request(BASE, { method: "POST", headers: { ...h, Authorization: "Bearer tok-errado" }, body }));
  assertEquals(bad.status, 401);
  const inUrl = await handler(new Request(`${BASE}?access_token=tok-admin`, { method: "POST", headers: h, body }));
  assertEquals(inUrl.status, 400);
  const meta = await handler(new Request(`${BASE}/.well-known/oauth-protected-resource`));
  const m = await meta.json();
  assertEquals(m.resource, BASE);
  assertEquals(m.authorization_servers, ["https://exemplo.supabase.co/auth/v1"]);
  assertEquals(m.bearer_methods_supported, ["header"]);
});

Deno.test("papel cliente/vendedor: 403; GET sem sessão: 405; corpo grande: 413", async () => {
  const { handler } = setup();
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const h = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const r = await handler(new Request(BASE, { method: "POST", headers: { ...h, Authorization: "Bearer tok-cliente" }, body }));
  assertEquals(r.status, 403);
  assertMatch((await r.json()).error.message, /não pode usar o MCP/);
  const g = await handler(new Request(BASE, { method: "GET", headers: { Authorization: "Bearer tok-admin" } }));
  assertEquals(g.status, 405);
  await g.body?.cancel();
  const big = await handler(new Request(BASE, { method: "POST", headers: { ...h, Authorization: "Bearer tok-admin", "Content-Length": String(70_000) }, body }));
  assertEquals(big.status, 413);
  await big.body?.cancel();
});

Deno.test("limite de chamadas: passou do limite → 429 e registro", async () => {
  const s = setup({ limit: 2 });
  const h = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer tok-admin" };
  const call = () => s.handler(new Request(BASE, { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }));
  for (let i = 0; i < 2; i++) await (await call()).body?.cancel();
  const r = await call();
  assertEquals(r.status, 429);
  assertEquals(r.headers.get("Retry-After"), "60");
  assertEquals(s.logs.at(-1)?.errorCode, "TOO_MANY_REQUESTS");
});

Deno.test("registro: sem parâmetros, dados ou tokens", async () => {
  const { client, logs } = await connect("tok-admin");
  await client.callTool({ name: "backstage_list_clients", arguments: { busca: "Loja" } });
  const all = JSON.stringify(logs);
  assert(!all.includes("tok-admin") && !all.includes("Loja"), "registro só com ferramenta, pessoa, resultado e tempo");
  assertEquals(Object.keys(logs[0]).sort(), ["errorCode", "ms", "oauthClientId", "ok", "tool", "userId"]);
  await client.close();
});

Deno.test("auxiliares: cabeçalho de login, client_id do OAuth, busca e período", () => {
  assertEquals(bearer(new Request(BASE, { headers: { Authorization: "Bearer abc.def.ghi" } })), "abc.def.ghi");
  assertEquals(bearer(new Request(BASE, { headers: { Authorization: "Basic abc" } })), null);
  const payload = btoa(JSON.stringify({ client_id: "9a3f0b0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" })).replace(/=+$/, "");
  assertEquals(oauthClientId(`x.${payload}.y`), "9a3f0b0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b");
  assertEquals(oauthClientId("lixo"), null);
  assertEquals(likeEscape("50%_off"), "50\\%\\_off");
  assertEquals(period(undefined, undefined, new Date("2026-10-26T15:00:00Z")), { from: "2026-09-27", to: "2026-10-26" });
  assertEquals(summaryOut([])[0], undefined);
});
