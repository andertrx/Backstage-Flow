import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { Client } from "npm:@modelcontextprotocol/sdk@1.32.1/client/index.js";
import { StreamableHTTPClientTransport } from "npm:@modelcontextprotocol/sdk@1.32.1/client/streamableHttp.js";
import { AuthError, bearer, oauthClientId } from "./auth.ts";
import { type DataPort, DataError, likeEscape, type OpsRpc } from "./data.ts";
import { COMMERCIAL_TOOLS, MEETING_TOOLS } from "./commercial_tools.ts";
import { CLIENT_TOOLS, MONITOR_TOOLS } from "./crm_tools.ts";
import { ENVIO_TOOLS } from "./envios_tools.ts";
import { OPS_TOOLS } from "./ops_tools.ts";
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
  "tok-gestor": { id: "00000000-0000-4000-8000-000000000004", name: "Gestor", role: "gestor" },
};
const ALL_OPS = ["ops.access", "ops.tasks.create", "ops.tasks.edit", "ops.tasks.assign", "ops.tasks.archive", "ops.cards.move", "ops.clients.view", "ops.history.edit", "ops.commercial", "ops.meetings.manage", "ops.envios"];
const OPS_BY_ROLE: Record<string, string[]> = { admin: ALL_OPS, gestor: ALL_OPS, equipe: ["ops.access"], visualizador: [] };
const TASK = "7a000000-0000-4000-8000-000000000071";
const SECTOR = "5e000000-0000-4000-8000-000000000051";
const PERSON = "00000000-0000-4000-8000-000000000003";
const LEAD = "1e000000-0000-4000-8000-0000000000e1";
const MEETING = "3e000000-0000-4000-8000-0000000000e3";
const ITEM = "1f000000-0000-4000-8000-0000000000f1";
const ENVIO_OK = "e1000000-0000-4000-8000-0000000000e1";
const ENVIO_ESPERA = "e2000000-0000-4000-8000-0000000000e2";
const envioFake = (id: string, nome: string, liberado: boolean) => ({
  id, nome, mensagem: "Bom dia! ☀️\nComo foi a semana?", dia_semana: 1, horario: "10:00", ativo: true, versao: 2, semana: "2026-11-02",
  situacao_hoje: liberado ? "aprovado" : "aguardando_aprovacao", pode_enviar_agora: liberado,
  aprovacao: liberado ? { decisao: "aprovado", decidido_por_nome: "Ander", decidido_em: "2026-11-02T11:00:00Z", valida: true } : null,
  clientes: [
    { cliente_id: CLI_A, cliente_nome: "Loja A", nome_grupo: "Acelera A. – Loja A", contatos_marcar: ["Ana Paula", "Bruno"], ativo: true, observacao: null, ja_enviado_nesta_semana: false, ultima_execucao: null },
    { cliente_id: CLI_B, cliente_nome: "Loja B", nome_grupo: "STG – Loja B", contatos_marcar: [], ativo: true, observacao: null, ja_enviado_nesta_semana: true, ultima_execucao: null },
    { cliente_id: PERSON, cliente_nome: "Loja C", nome_grupo: "Loja C", contatos_marcar: [], ativo: false, observacao: null, ja_enviado_nesta_semana: false, ultima_execucao: null },
  ],
});
/** Contatos do lead falso: nunca podem aparecer numa resposta do MCP. */
const SECRET_CONTACT = { contact_name: "Maria Contato", phone: "11999998888", email: "maria@empresa.com", cnpj: "11222333000181" };

/** Central falsa: guarda as chamadas e responde como o banco (versão, conflito, permissão). */
interface FakeCentral {
  calls: { name: OpsRpc; args: Record<string, unknown> }[];
  task: Record<string, unknown> & { version: number };
  people: { user_id: string; role: string; name: string }[];
  failWith?: DataError;
}
const newCentral = (): FakeCentral => ({
  calls: [],
  task: { id: TASK, number: 12, title: "Banner", description: "antiga", client_id: CLI_A, client_name: "Loja A", sector_id: SECTOR, status_id: "nao_iniciado",
    status_name: "Não iniciado", category: "aberto", priority: "media", start_date: null, due_date: "2026-10-30", effort_hours: null, visibility: "setor",
    version: 3, archived_at: null, client_stage_id: null, mandatory: false, created_at: "2026-10-20T10:00:00Z", updated_at: "2026-10-20T10:00:00Z" },
  people: [{ user_id: PERSON, role: "principal", name: "Equipe" }, { user_id: "00000000-0000-4000-8000-000000000009", role: "aprovador", name: "Aprova" }],
});
const CLI_A = "a0000000-0000-4000-8000-00000000000a";
const CLI_B = "b0000000-0000-4000-8000-00000000000b";

/** Banco falso: o visualizador só "vê" o cliente A (como o RLS faria). */
function fakeData(user: Caller, opts: { slow?: boolean; broken?: boolean } = {}, central: FakeCentral = newCentral()): DataPort {
  const visible = user.role === "admin" ? [CLI_A, CLI_B] : [CLI_A];
  const clients = [
    { id: CLI_A, name: "Loja A", status: "ativo", timezone: "America/Sao_Paulo", is_demo: false },
    { id: CLI_B, name: "Loja B", status: "ativo", timezone: "America/Sao_Paulo", is_demo: false },
  ].filter((c) => visible.includes(c.id));
  return {
    ping: () => (opts.broken ? Promise.reject(new Error("fora do ar")) : Promise.resolve()),
    lastSync: () => Promise.resolve({ finished_at: "2026-10-26T10:00:00Z", status: "sucesso" }),
    opsPermissions: () => Promise.resolve(OPS_BY_ROLE[user.role] ?? []),
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
    opsReference: () => Promise.resolve({
      sectors: [{ id: SECTOR, name: "Design", color: "#2563EB", status: "ativo", position: 1 }],
      statuses: [{ id: "nao_iniciado", name: "Não iniciado", color: "#94A3B8", category: "aberto", active: true, position: 1 },
        { id: "finalizado", name: "Finalizado", color: "#10B981", category: "concluido", active: true, position: 2 }],
      columns: [], activityTypes: [], clientStages: [{ id: "kickoff", name: "Kickoff", color: "#2563EB", active: true, position: 1 }],
    }),
    commercialReference: () => Promise.resolve({
      leadStages: [{ id: "novo", name: "Novo", category: "aberto", active: true, position: 1, require_previous: false, require_next_action: false },
        { id: "perdido", name: "Perdido", category: "perdido", active: true, position: 9, require_previous: false, require_next_action: false }],
      lossReasons: [{ id: "preco", name: "Preço", active: true, position: 1 }],
      meetingCategories: [{ id: "daily", name: "Daily", active: true, position: 1 }],
    }),
    opsRpc: (name, args) => {
      central.calls.push({ name, args });
      if (central.failWith && name !== "ops_task_get") return Promise.reject(central.failWith);
      if (name === "ops_directory") return Promise.resolve({ people: [{ user_id: PERSON, name: "Equipe", sector_id: SECTOR }], clients: [{ id: CLI_A, name: "Loja A", status: "ativo" }] });
      if (name === "ops_task_list") return Promise.resolve([{ ...central.task, people: central.people, tags: ["urgente"], comments: 1, overdue: false }]);
      if (name === "ops_task_get") {
        return Promise.resolve(args.p_id === TASK ? { task: central.task, people: central.people, tags: ["urgente"], comments: [{ author: "Ander", body: "ok", created_at: "x" }] } : null);
      }
      if (name === "ops_task_save") {
        if (args.p_id) central.task = { ...central.task, version: central.task.version + 1 };
        return Promise.resolve(TASK);
      }
      if (name === "ops_task_set_status" || name === "ops_task_set_people") {
        central.task = { ...central.task, version: central.task.version + 1 };
        return Promise.resolve(central.task.version);
      }
      if (name === "ops_comment_add") return Promise.resolve(55);
      if (name === "monitor_alert_detail") {
        return Promise.resolve(args.p_id === 7 ? { alert: { id: 7, severity: "critico", status: "novo", client_name: "Loja A", version: 2, dedupe_key: "x" }, can_handle: true,
          events: [{ kind: "estado", from_value: "novo", to_value: "visualizado", note: null, actor_name: "Ander", created_at: "x", data: { origem: "mcp" } }] } : null);
      }
      if (name === "monitor_rule_save" || name === "monitor_alert_to_task" || name === "ops_client_note_add") return Promise.resolve("9b000000-0000-4000-8000-000000000099");
      if (name === "ops_client_get") {
        return Promise.resolve(args.p_client === CLI_A ? { client: { id: CLI_A, name: "Loja A", status: "ativo" },
          ops: { stage_id: "kickoff", stage_since: "x", started_at: "x", version: 4, am_user_id: null, am_name: null },
          timeline: [{ action: "cliente.etapa", actor: "Ander", origin: "mcp", created_at: "x" }] } : null);
      }
      if (name === "ops_client_board") return Promise.resolve({ clients: [{ client_id: CLI_A, name: "Loja A", stage_id: "kickoff", version: 4, can_move: true }], available: [{ id: CLI_B, name: "Loja B" }] });
      if (name === "ops_lead_board") {
        return Promise.resolve({ leads: [{ id: LEAD, number: 5, company_name: "Padaria Sol", stage_id: "novo", priority: "alta", potential_value: 3000, currency: "BRL", version: 2, ...SECRET_CONTACT }], origins: [] });
      }
      if (name === "ops_lead_get") {
        return Promise.resolve(args.p_id === LEAD ? {
          lead: { id: LEAD, number: 5, company_name: "Padaria Sol", stage_id: "novo", stage_name: "Novo", priority: "alta", potential_value: 3000, currency: "BRL",
            segment: "Alimentação", next_action: "Ligar", next_action_date: "2026-10-28", entered_at: "2026-10-20", version: 2, archived_at: null, ...SECRET_CONTACT },
          events: [{ action: "lead.editado", kind: null, body: null, happened_at: null, actor: "Ander", origin: "mcp", before: { telefone: null }, after: { telefone: "alterado" }, created_at: "x" }],
        } : null);
      }
      if (name === "ops_lead_duplicates") return Promise.resolve({ leads: [{ number: 5, company_name: "Padaria Sol", stage_name: "Novo", reason: "mesmo nome" }], clients: [] });
      if (name === "ops_lead_save") return Promise.resolve(LEAD);
      if (name === "ops_meeting_list") return Promise.resolve({ meetings: [{ id: MEETING, number: 3, title: "Daily", status: "agendada", people_count: 2 }], can: { create: true } });
      if (name === "ops_meeting_get") {
        return Promise.resolve(args.p_id === MEETING ? {
          meeting: { id: MEETING, number: 3, title: "Daily", category_id: "daily", status: "agendada", starts_at: "2026-10-28T12:00:00Z", duration_min: 15,
            sector_id: SECTOR, client_id: null, location: "Meet", agenda: "Pauta", notes: "ata antiga", version: 6 },
          people: [{ user_id: PERSON, name: "Equipe", attended: true }, { user_id: "00000000-0000-4000-8000-000000000009", name: "Aprova", attended: false }],
          items: [{ id: ITEM, kind: "pendencia", body: "Enviar proposta", task_number: null }],
          events: [{ action: "reuniao.criada", actor: "Ander", origin: "mcp", created_at: "x" }],
          can: { edit: true },
        } : null);
      }
      if (name === "ops_meeting_save") return Promise.resolve(args.p_id ?? MEETING);
      if (name === "ops_meeting_item_to_task" || name === "ops_meeting_item_add") return Promise.resolve(TASK);
      if (name === "ops_envio_list") {
        // 41.5: filtro pelo código do envio (como o banco)
        const codigo = ((args.f as Record<string, unknown> | undefined)?.codigo as string | undefined) ?? "";
        const envios = [{ ...envioFake(ENVIO_OK, "Feedback", true), codigo: "ENV-001" }, { ...envioFake(ENVIO_ESPERA, "Outro", false), codigo: "ENV-002" }]
          .filter((e) => !codigo || e.codigo === codigo);
        return Promise.resolve({ hoje: { data: "2026-11-02", hora: "10:05" }, envios });
      }
      if (name === "ops_envio_get") return Promise.resolve(args.p_id === ENVIO_OK ? envioFake(ENVIO_OK, "Feedback", true) : null);
      if (name === "ops_envio_execucao_add") {
        return args.p_status === "enviado" && args.p_envio === ENVIO_ESPERA
          ? Promise.reject(new DataError("22023", "Este envio não foi aprovado nesta semana: não envie."))
          : Promise.resolve(7);
      }
      if (name === "ops_sector_save") return Promise.resolve(args.p_id ?? "5e000000-0000-4000-8000-000000000099");
      return Promise.resolve(null);
    },
  };
}

function setup(opts: { slow?: boolean; broken?: boolean; limit?: number; timeoutMs?: number } = {}, central: FakeCentral = newCentral()) {
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
    dataFor: (token) => fakeData(USERS[token], opts, central),
    now: () => new Date("2026-10-26T15:00:00Z"),
    timeoutMs: opts.timeoutMs ?? 5_000,
    resourceUrl: BASE,
    authServerUrl: "https://exemplo.supabase.co/auth/v1",
  };
  const handler = createHandler(deps);
  const fetchFn = (input: string | URL | Request, init?: RequestInit) => handler(new Request(input, init));
  return { handler, fetchFn, logs, errors, central };
}

async function connect(token: string, opts: Parameters<typeof setup>[0] = {}, central: FakeCentral = newCentral()) {
  const s = setup(opts, central);
  const client = new Client({ name: "teste", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(BASE), {
    fetch: s.fetchFn, requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  return { client, ...s };
}

type ToolInfo = { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } };
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);
const json = (r: unknown) => JSON.parse(text(r));

Deno.test("conecta pelo cliente oficial; admin vê leitura + Central; escrita marcada (pede confirmação); nada perigoso", async () => {
  const { client } = await connect("tok-admin");
  assertEquals(client.getServerVersion()?.name, "backstage-flow");
  const { tools } = await client.listTools();
  assertEquals(tools.map((t: ToolInfo) => t.name).sort(), [...TOOLS, ...OPS_TOOLS, ...MONITOR_TOOLS, ...CLIENT_TOOLS, ...COMMERCIAL_TOOLS, ...MEETING_TOOLS, ...ENVIO_TOOLS].map((t) => t.name).sort());
  const writes = new Set([...OPS_TOOLS, ...MONITOR_TOOLS, ...CLIENT_TOOLS, ...COMMERCIAL_TOOLS, ...MEETING_TOOLS, ...ENVIO_TOOLS].filter((t) => t.write).map((t) => t.name));
  assert(tools.every((t: ToolInfo) => t.annotations?.readOnlyHint === !writes.has(t.name)), "leitura marcada como leitura; escrita como escrita");
  assertEquals(tools.find((t: ToolInfo) => t.name === "backstage_archive_task")?.annotations?.destructiveHint, true);
  assert(!tools.some((t: ToolInfo) => /delete|remove|sql|shell|file|apagar|excluir|campaign_(update|pause)|budget|balance|user|permission|integration/i.test(t.name)), "nada de apagar, SQL, campanhas, saldo, usuários ou integrações");
  const res = await client.listResources();
  assertEquals(res.resources.map((r: { uri: string }) => r.uri), ["backstage://guia"]);
  const guia = await client.readResource({ uri: "backstage://guia" });
  assertMatch((guia.contents[0] as { text: string }).text, /Nada é apagado/);
  await client.close();
});

Deno.test("cada papel vê só as ferramentas que pode usar (equipe: Central sem criar; visualizador: só leitura; gestor: sem configurações)", async () => {
  const { client } = await connect("tok-equipe");
  const names = (await client.listTools()).tools.map((t: ToolInfo) => t.name).sort();
  assertEquals(names, ["backstage_capabilities", "backstage_central_reference", "backstage_comment_task", "backstage_get_client_ops", "backstage_get_task",
    "backstage_list_onboarding", "backstage_list_tasks", "backstage_mcp_health", "backstage_status",
    "backstage_cancel_meeting", "backstage_get_meeting", "backstage_list_meetings", "backstage_meeting_add_item", "backstage_meeting_reference",
    "backstage_record_meeting", "backstage_save_meeting"].sort());
  const cap = json(await client.callTool({ name: "backstage_capabilities", arguments: {} }));
  assertEquals(cap.modulos_liberados_no_crm, ["Central de Operações"]);
  await client.close();
  const v = await connect("tok-visu");
  assertEquals((await v.client.listTools()).tools.map((t: ToolInfo) => t.name).sort(),
    [...TOOLS.map((t) => t.name), "backstage_get_alert", "backstage_list_alert_rules"].sort(), "visualizador: só leitura (vê alertas e regras, não trata)");
  assertEquals(json(await v.client.callTool({ name: "backstage_capabilities", arguments: {} })).modo, "somente leitura");
  await v.client.close();
  const g = await connect("tok-gestor");
  const gn = (await g.client.listTools()).tools.map((t: ToolInfo) => t.name);
  assert(gn.includes("backstage_create_task") && !gn.some((n: string) => /save_sector|set_sector|save_status|set_status_active|queue_column|activity_type/.test(n)),
    "gestor mexe em tarefas, mas não nas configurações (só admin)");
  await g.client.close();
});

Deno.test("status: sem segredos; banco fora do ar aparece como indisponível", async () => {
  const { client, logs } = await connect("tok-admin");
  const s = json(await client.callTool({ name: "backstage_status", arguments: {} }));
  assertEquals(s.sistema, "Backstage Flow");
  assertEquals(s.banco.estado, "funcionando");
  assertEquals(s.servidor_mcp.versao, "1.5.0");
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

Deno.test("Central: criar tarefa usa a mesma ação do site, com pessoas, etiquetas e link", async () => {
  const central = newCentral();
  const { client, logs } = await connect("tok-gestor", {}, central);
  const r = json(await client.callTool({ name: "backstage_create_task", arguments: {
    titulo: "Revisar criativos", setor_id: SECTOR, cliente_id: CLI_A, prazo: "2026-10-31", prioridade: "alta", responsavel_id: PERSON, etiquetas: ["meta"] } }));
  const save = central.calls.find((c) => c.name === "ops_task_save")!;
  assertEquals(save.args.p_id, null);
  const p = save.args.p as Record<string, unknown>;
  assertEquals([p.title, p.sector_id, p.client_id, p.due_date, p.priority, p.visibility], ["Revisar criativos", SECTOR, CLI_A, "2026-10-31", "alta", "setor"]);
  assertEquals(p.people, { principal: PERSON, adicionais: [], aprovadores: [], observadores: [] });
  assertEquals(p.tags, ["meta"]);
  assert(r.criada && r.tarefa.link.endsWith(`/operacoes/tarefas?tarefa=${TASK}`));
  assertEquals(logs.at(-1)?.tool, "backstage_create_task");
  const bad = await client.callTool({ name: "backstage_create_task", arguments: { titulo: "ab", setor_id: SECTOR } });
  assert(bad.isError, "título curto recusado");
  await client.close();
});

Deno.test("Central: editar muda só o que foi pedido, confere a versão e exige algum campo", async () => {
  const central = newCentral();
  const { client } = await connect("tok-gestor", {}, central);
  await client.callTool({ name: "backstage_update_task", arguments: { tarefa_id: TASK, versao: 3, prazo: "2026-11-05", cliente_id: null } });
  const save = central.calls.find((c) => c.name === "ops_task_save")!;
  const p = save.args.p as Record<string, unknown>;
  assertEquals(save.args.p_version, 3);
  assertEquals([p.title, p.description, p.due_date, p.client_id, p.tags], ["Banner", "antiga", "2026-11-05", null, ["urgente"]]);
  const conflict = await client.callTool({ name: "backstage_update_task", arguments: { tarefa_id: TASK, versao: 1, titulo: "Outro" } });
  assert(conflict.isError);
  assertMatch(text(conflict), /alterou esta tarefa/);
  const empty = await client.callTool({ name: "backstage_update_task", arguments: { tarefa_id: TASK } });
  assertMatch(text(empty), /pelo menos um campo/);
  await client.close();
});

Deno.test("Central: status, pessoas (mantém aprovadores), comentário e arquivar", async () => {
  const central = newCentral();
  const { client } = await connect("tok-gestor", {}, central);
  const st = json(await client.callTool({ name: "backstage_set_task_status", arguments: { tarefa_id: TASK, status_id: "finalizado" } }));
  assert(st.status_alterado);
  assertEquals(central.calls.find((c) => c.name === "ops_task_set_status")!.args, { p_id: TASK, p_version: 3, p_status: "finalizado" });
  await client.callTool({ name: "backstage_set_task_people", arguments: { tarefa_id: TASK, responsavel_id: null, adicionais_ids: [PERSON] } });
  const people = central.calls.find((c) => c.name === "ops_task_set_people")!.args.p_people as Record<string, unknown>;
  assertEquals(people, { principal: null, adicionais: [PERSON], aprovadores: ["00000000-0000-4000-8000-000000000009"], observadores: [] });
  const c = json(await client.callTool({ name: "backstage_comment_task", arguments: { tarefa_id: TASK, texto: "Feito pelo Claude" } }));
  assertEquals(c.comentario_id, 55);
  const ar = json(await client.callTool({ name: "backstage_archive_task", arguments: { tarefa_id: TASK } }));
  assertEquals(ar.arquivada, true);
  const nf = await client.callTool({ name: "backstage_get_task", arguments: { tarefa_id: CLI_B } });
  assertMatch(text(nf), /não encontrada ou não liberada/);
  const list = json(await client.callTool({ name: "backstage_list_tasks", arguments: { prazo: "atrasadas", minhas: true } }));
  assertEquals(list.tarefas[0].numero, 12);
  assertEquals((central.calls.find((x) => x.name === "ops_task_list")!.args.f as Record<string, unknown>).due, "atrasadas");
  await client.close();
});

Deno.test("Central: configurações (admin) e erros do banco viram mensagens claras", async () => {
  const central = newCentral();
  const { client } = await connect("tok-admin", {}, central);
  const s = json(await client.callTool({ name: "backstage_save_sector", arguments: { nome: "Vídeo", cor: "#2563EB" } }));
  assert(s.salvo && s.setor_id);
  const badColor = await client.callTool({ name: "backstage_save_sector", arguments: { nome: "Vídeo", cor: "azul" } });
  assert(badColor.isError);
  central.failWith = new DataError("42501", "Só o administrador pode mudar a configuração da Central de Operações.");
  const denied = await client.callTool({ name: "backstage_save_status", arguments: { nome: "Novo", cor: "#000000", grupo: "aberto" } });
  assertMatch(text(denied), /Sem permissão/);
  central.failWith = new DataError("40001", "Alguém alterou esta tarefa antes de você. Recarregue para ver a versão atual.");
  const conflict = await client.callTool({ name: "backstage_set_task_status", arguments: { tarefa_id: TASK, status_id: "finalizado" } });
  assertMatch(text(conflict), /Alguém alterou/);
  central.failWith = new DataError("22023", "Há 3 tarefa(s) neste status. Escolha para qual status elas vão antes de desativar.");
  const rule = await client.callTool({ name: "backstage_set_status_active", arguments: { status_id: "nao_iniciado", ativo: false } });
  assertMatch(text(rule), /Escolha para qual status/);
  await client.close();
});

Deno.test("Monitoramento: abrir, mudar situação, responsável, resolver, virar tarefa, regras e gravidade (admin)", async () => {
  const central = newCentral();
  const { client } = await connect("tok-admin", {}, central);
  const a = json(await client.callTool({ name: "backstage_get_alert", arguments: { alerta_id: 7 } }));
  assertEquals(a.alerta.dedupe_key, undefined);
  assertEquals(a.historico[0].via, "MCP");
  await client.callTool({ name: "backstage_alert_set_status", arguments: { alerta_id: 7, situacao: "em_analise", versao: 2 } });
  assertEquals(central.calls.find((c) => c.name === "monitor_alert_set_status")!.args, { p_id: 7, p_status: "em_analise", p_version: 2 });
  const bad = await client.callTool({ name: "backstage_alert_set_status", arguments: { alerta_id: 7, situacao: "resolvido" } });
  assert(bad.isError, "resolver só pela ferramenta própria");
  await client.callTool({ name: "backstage_alert_resolve", arguments: { alerta_id: 7, observacao: "Criativo trocado" } });
  assertEquals(central.calls.find((c) => c.name === "monitor_alert_resolve")!.args, { p_id: 7, p_note: "Criativo trocado", p_version: null });
  const t = json(await client.callTool({ name: "backstage_alert_to_task", arguments: { alerta_id: 7, setor_id: SECTOR, prazo: "2026-11-01" } }));
  assert(t.tarefa_criada && t.link.includes("/operacoes/tarefas?tarefa="));
  await client.callTool({ name: "backstage_save_alert_rule", arguments: { onde: "global", metrica: "cpc", direcao: "up", atencao_pct: 20, critico_pct: 40 } });
  const rule = central.calls.find((c) => c.name === "monitor_rule_save")!.args;
  assertEquals([rule.p_scope, rule.p_metric, rule.p_direction, rule.p_attention, rule.p_critical, rule.p_active], ["global", "cpc", "up", 20, 40, true]);
  const badRule = await client.callTool({ name: "backstage_save_alert_rule", arguments: { onde: "global", metrica: "vendas", direcao: "up", atencao_pct: 20, critico_pct: 40 } });
  assert(badRule.isError, "métrica que não existe é recusada");
  await client.callTool({ name: "backstage_set_min_severity", arguments: { gravidade: "atencao" } });
  const nf = await client.callTool({ name: "backstage_get_alert", arguments: { alerta_id: 99 } });
  assertMatch(text(nf), /não encontrado ou não liberado/);
  await client.close();
});

Deno.test("Monitoramento: gestor trata alertas e regras, mas não muda a gravidade mínima", async () => {
  const { client } = await connect("tok-gestor");
  const names = (await client.listTools()).tools.map((t: ToolInfo) => t.name);
  assert(names.includes("backstage_alert_resolve") && names.includes("backstage_save_alert_rule") && !names.includes("backstage_set_min_severity"));
  await client.close();
});

Deno.test("Clientes: lista, ficha (via MCP no histórico), mover etapa com versão, AM, atividade, colocar no fluxo", async () => {
  const central = newCentral();
  const { client } = await connect("tok-gestor", {}, central);
  const list = json(await client.callTool({ name: "backstage_list_onboarding", arguments: { minhas: true } }));
  assertEquals([list.clientes[0].nome, list.fora_do_fluxo[0].nome], ["Loja A", "Loja B"]);
  assertEquals((central.calls.find((c) => c.name === "ops_client_board")!.args.f as Record<string, unknown>).mine, true);
  const ficha = json(await client.callTool({ name: "backstage_get_client_ops", arguments: { cliente_id: CLI_A } }));
  assertEquals([ficha.fluxo.versao, ficha.historico[0].origem], [4, "via MCP"]);
  await client.callTool({ name: "backstage_client_move_stage", arguments: { cliente_id: CLI_A, etapa_id: "setup" } });
  assertEquals(central.calls.find((c) => c.name === "ops_client_stage_move")!.args, { p_client: CLI_A, p_version: 4, p_stage: "setup" });
  const conflict = await client.callTool({ name: "backstage_client_move_stage", arguments: { cliente_id: CLI_A, etapa_id: "setup", versao: 1 } });
  assertMatch(text(conflict), /alterou este cliente/);
  await client.callTool({ name: "backstage_client_set_am", arguments: { cliente_id: CLI_A, am_id: PERSON } });
  assertEquals(central.calls.find((c) => c.name === "ops_client_set_am")!.args, { p_client: CLI_A, p_version: 4, p_am: PERSON });
  const note = json(await client.callTool({ name: "backstage_client_add_note", arguments: { cliente_id: CLI_A, tipo_id: "reuniao", titulo: "Kickoff feito" } }));
  assert(note.registrada);
  const p = central.calls.find((c) => c.name === "ops_client_note_add")!.args.p as Record<string, unknown>;
  assertEquals([p.client_id, p.type_id, p.title, p.happened_at], [CLI_A, "reuniao", "Kickoff feito", "2026-10-26T15:00:00.000Z"]);
  await client.callTool({ name: "backstage_client_start", arguments: { cliente_id: CLI_A, etapa_id: "kickoff" } });
  assertEquals(central.calls.find((c) => c.name === "ops_client_start")!.args, { p_client: CLI_A, p_stage: "kickoff", p_am: null });
  const nf = await client.callTool({ name: "backstage_get_client_ops", arguments: { cliente_id: CLI_B } });
  assertMatch(text(nf), /não encontrado ou não liberado/);
  await client.close();
});

Deno.test("Comercial: lista e abre leads SEM os contatos; cria/edita gravando contatos ditados sem mostrá-los; mover, interação, arquivar", async () => {
  const central = newCentral();
  const { client } = await connect("tok-admin", {}, central);
  const outputs: string[] = [];
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    outputs.push(text(r));
    return r;
  };
  const list = json(await call("backstage_list_leads", { prioridade: "alta" }));
  assertEquals([list.total, list.leads[0].company_name, list.leads[0].contato_cadastrado.telefone], [1, "Padaria Sol", true]);
  const got = json(await call("backstage_get_lead", { lead_id: LEAD }));
  assertEquals([got.lead.version, got.historico[0].origem], [2, "via MCP"]);
  // criar: contatos ditados vão para o banco
  const created = json(await call("backstage_save_lead", { empresa: "Mercado Lua", telefone: "(11) 91234-5678", email: "dono@lua.com", etapa_id: "novo", valor_potencial: 1500.5 }));
  assert(created.lead_criado && created.possiveis_duplicados[0].includes("mesmo nome"));
  const createArgs = central.calls.find((c) => c.name === "ops_lead_save")!.args;
  const pc = createArgs.p as Record<string, string>;
  assertEquals([createArgs.p_id, pc.company_name, pc.phone, pc.email, pc.stage_id, pc.potential_value, pc.currency], [null, "Mercado Lua", "(11) 91234-5678", "dono@lua.com", "novo", "1500.5", "BRL"]);
  // editar: muda só o pedido e mantém os contatos que já existiam (sem mostrar)
  await call("backstage_save_lead", { lead_id: LEAD, versao: 2, proxima_acao: "Enviar proposta" });
  const edit = central.calls.filter((c) => c.name === "ops_lead_save")[1].args;
  const pe = edit.p as Record<string, string>;
  assertEquals([edit.p_version, pe.next_action, pe.phone, pe.email, pe.contact_name, pe.cnpj, pe.company_name, pe.segment],
    [2, "Enviar proposta", SECRET_CONTACT.phone, SECRET_CONTACT.email, SECRET_CONTACT.contact_name, SECRET_CONTACT.cnpj, "Padaria Sol", "Alimentação"]);
  assertMatch(text(await call("backstage_save_lead", { lead_id: LEAD, versao: 1, proxima_acao: "x" })), /alterou este lead/);
  assert((await call("backstage_save_lead", { lead_id: LEAD })).isError, "edição sem campos é recusada");
  await call("backstage_move_lead", { lead_id: LEAD, etapa_id: "perdido", motivo_perda_id: "preco" });
  assertEquals(central.calls.find((c) => c.name === "ops_lead_move")!.args,
    { p_id: LEAD, p_version: 2, p_stage: "perdido", p_loss_reason: "preco", p_loss_note: null });
  await call("backstage_lead_note", { lead_id: LEAD, tipo: "contato", texto: "Liguei, pediu proposta" });
  assertEquals(central.calls.find((c) => c.name === "ops_lead_note_add")!.args.p_kind, "contato");
  await call("backstage_archive_lead", { lead_id: LEAD });
  assertEquals(central.calls.find((c) => c.name === "ops_lead_archive")!.args, { p_id: LEAD, p_archived: true });
  const ref = json(await call("backstage_commercial_reference", {}));
  assertEquals([ref.etapas[1].grupo, ref.motivos_de_perda[0].id], ["perdido", "preco"]);
  // nenhuma resposta traz os contatos
  for (const o of outputs) for (const v of Object.values(SECRET_CONTACT)) assert(!o.includes(v), `contato vazou: ${v}`);
  const names = (await client.listTools()).tools.map((t: ToolInfo) => t.name);
  assert(!names.some((n: string) => n.includes("convert")), "converter lead em cliente fica só no site");
  await client.close();
});

Deno.test("Comercial: sem a permissão Comercial as ferramentas de leads não aparecem", async () => {
  const { client } = await connect("tok-equipe");
  const names = (await client.listTools()).tools.map((t: ToolInfo) => t.name);
  assert(!names.some((n: string) => n.includes("lead")) && names.includes("backstage_list_meetings") && !names.includes("backstage_meeting_item_to_task"));
  await client.close();
});

Deno.test("Reuniões: listar, abrir, agendar, editar só o pedido (mantém participantes), ata/presença, item, virar tarefa, cancelar", async () => {
  const central = newCentral();
  const { client } = await connect("tok-admin", {}, central);
  const list = json(await client.callTool({ name: "backstage_list_meetings", arguments: { situacao: "agendada", minhas: true } }));
  assertEquals([list.total, list.voce_pode_criar], [1, true]);
  assertEquals((central.calls.find((c) => c.name === "ops_meeting_list")!.args.f as Record<string, unknown>).status, "agendada");
  const m = json(await client.callTool({ name: "backstage_get_meeting", arguments: { reuniao_id: MEETING } }));
  assertEquals([m.reuniao.versao, m.itens[0].tipo, m.historico[0].origem], [6, "pendencia", "via MCP"]);
  const missing = await client.callTool({ name: "backstage_save_meeting", arguments: { titulo: "Alinhamento" } });
  assertMatch(text(missing), /título, tipo/);
  await client.callTool({ name: "backstage_save_meeting", arguments: { titulo: "Alinhamento", tipo_id: "daily", inicio: "2026-10-29T10:00:00-03:00", participantes: [PERSON] } });
  const created = central.calls.find((c) => c.name === "ops_meeting_save")!.args;
  assertEquals([created.p_id, (created.p as Record<string, unknown>).title, (created.p as Record<string, unknown>).people], [null, "Alinhamento", [PERSON]]);
  await client.callTool({ name: "backstage_save_meeting", arguments: { reuniao_id: MEETING, versao: 6, duracao_min: 45 } });
  const edited = central.calls.filter((c) => c.name === "ops_meeting_save")[1].args;
  const pe = edited.p as Record<string, unknown>;
  assertEquals([edited.p_version, pe.duration_min, pe.title, pe.agenda, (pe.people as string[]).length], [6, 45, "Daily", "Pauta", 2]);
  await client.callTool({ name: "backstage_record_meeting", arguments: { reuniao_id: MEETING, ata: "Decidimos X" } });
  assertEquals(central.calls.find((c) => c.name === "ops_meeting_record")!.args, { p_id: MEETING, p_version: 6, p_notes: "Decidimos X", p_attended: [PERSON] });
  await client.callTool({ name: "backstage_meeting_add_item", arguments: { reuniao_id: MEETING, tipo: "bloqueio", texto: "Sem acesso ao BM", prazo: "2026-10-30" } });
  assertEquals((central.calls.find((c) => c.name === "ops_meeting_item_add")!.args.p as Record<string, unknown>).kind, "bloqueio");
  const t = json(await client.callTool({ name: "backstage_meeting_item_to_task", arguments: { item_id: ITEM } }));
  assert(t.tarefa_criada && t.link.includes(TASK));
  assertMatch(text(await client.callTool({ name: "backstage_cancel_meeting", arguments: { reuniao_id: MEETING, motivo: "Feriado", versao: 2 } })), /alterou esta reunião/);
  await client.callTool({ name: "backstage_cancel_meeting", arguments: { reuniao_id: MEETING, motivo: "Feriado" } });
  assertEquals(central.calls.find((c) => c.name === "ops_meeting_cancel")!.args, { p_id: MEETING, p_version: 6, p_reason: "Feriado" });
  await client.close();
});

Deno.test("Envios semanais: só o liberado (aprovado e no horário), grupos pendentes na ordem; registrar; aprovar não existe no MCP", async () => {
  const central = newCentral();
  const { client } = await connect("tok-admin", {}, central);
  const all = json(await client.callTool({ name: "backstage_list_envios", arguments: {} }));
  assertEquals(all.total, 2);
  assertMatch(all.envios[1].situacao_hoje, /NÃO envie/);
  assertEquals(all.envios[0].grupos.length, 2, "grupo pausado não vai para o agente");
  const lib = json(await client.callTool({ name: "backstage_list_envios", arguments: { liberados_agora: true } }));
  assertEquals([lib.total, lib.envios[0].envio_id, lib.envios[0].pode_enviar_agora], [1, ENVIO_OK, true]);
  assertEquals(lib.envios[0].grupos.map((g: { nome_grupo: string }) => g.nome_grupo), ["Acelera A. – Loja A"], "pula o grupo já enviado nesta semana");
  assertEquals(lib.envios[0].grupos[0].marcar_na_ordem, ["Ana Paula", "Bruno"]);
  assertEquals(lib.envios[0].mensagem, "Bom dia! ☀️\nComo foi a semana?");
  assertMatch(lib.como_enviar, /SEGUNDA mensagem/);
  const one = json(await client.callTool({ name: "backstage_get_envio", arguments: { envio_id: ENVIO_OK } }));
  assertEquals([one.grupos.length, one.grupos[2].ativo_neste_envio], [3, false]);
  const ok = json(await client.callTool({ name: "backstage_registrar_execucao_envio", arguments: { envio_id: ENVIO_OK, cliente_id: CLI_A, status: "enviado", detalhe: "ok" } }));
  assert(ok.registrado);
  assertEquals(central.calls.find((c) => c.name === "ops_envio_execucao_add")!.args,
    { p_envio: ENVIO_OK, p_cliente: CLI_A, p_status: "enviado", p_detalhe: "ok", p_executado_em: null });
  const recusado = await client.callTool({ name: "backstage_registrar_execucao_envio", arguments: { envio_id: ENVIO_ESPERA, cliente_id: CLI_A, status: "enviado" } });
  assert(recusado.isError);
  assertMatch(text(recusado), /não foi aprovado/);
  const bad = await client.callTool({ name: "backstage_registrar_execucao_envio", arguments: { envio_id: ENVIO_OK, cliente_id: CLI_A, status: "ok" } });
  assert(bad.isError, "status inválido");
  const names = (await client.listTools()).tools.map((t: ToolInfo) => t.name);
  assert(!names.some((n: string) => /aprov|decid/.test(n)), "aprovar é só na tela do CRM");
  const cap = json(await client.callTool({ name: "backstage_capabilities", arguments: {} }));
  assert(cap.modulos_liberados_no_crm.includes("Envios semanais (grupos de WhatsApp)"));
  await client.close();
});

Deno.test("Envios semanais (41.5): a tarefa de cada envio busca só o código dela", async () => {
  const central = newCentral();
  const { client } = await connect("tok-admin", {}, central);
  const um = json(await client.callTool({ name: "backstage_list_envios", arguments: { envio: "env-001", liberados_agora: true } }));
  assertEquals([um.total, um.envios[0].codigo, um.envios[0].envio_id], [1, "ENV-001", ENVIO_OK]);
  assertEquals((central.calls.filter((c) => c.name === "ops_envio_list").at(-1)!.args.f as Record<string, unknown>).codigo, "ENV-001");
  const espera = json(await client.callTool({ name: "backstage_list_envios", arguments: { envio: "ENV-002", liberados_agora: true } }));
  assertEquals(espera.total, 0);
  assertMatch(espera.aviso, /ENV-002 não está liberado agora.*Não envie nada/);
  const nada = json(await client.callTool({ name: "backstage_list_envios", arguments: { envio: "ENV-999", liberados_agora: true } }));
  assertMatch(nada.aviso, /ENV-999 não encontrado/);
  await client.close();
});

Deno.test("Envios semanais: sem a permissão, as ferramentas não aparecem", async () => {
  const { client } = await connect("tok-equipe");
  const names = (await client.listTools()).tools.map((t: ToolInfo) => t.name);
  assert(!names.some((n: string) => n.includes("envio")));
  await client.close();
});
