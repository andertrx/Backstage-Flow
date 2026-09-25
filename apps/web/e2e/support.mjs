/**
 * Apoio aos testes de navegador: Supabase SIMULADO (nenhum dado real é tocado)
 * e utilidades comuns. O "banco" é uma memória que vive só durante o teste.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
export const SHOTS = new URL("../test-results", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

export const PASSWORD = "Senha-certa-1";
export const USER_ID = "11111111-1111-1111-1111-111111111111";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "*" };
const json = (route, status, body) =>
  route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });

/** Lê um filtro PostgREST simples da URL (ex.: id=eq.123 → "123"). */
const eqParam = (url, column) => new URL(url).searchParams.get(column)?.replace(/^eq\./, "");

export function check(cond, msg) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("ok -", msg);
}

export async function launch() {
  // CHROMIUM_PATH: usar um Chromium já instalado (ex.: em ambientes sem download de navegador).
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { browser, page, errors };
}

/**
 * Instala o Supabase simulado na página.
 * @param {import("playwright").Page} page
 * @param {{ role?: string }} options papel do usuário logado
 */
export async function mockSupabase(page, { role = "admin" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, role: "authenticated", aud: "authenticated", exp: now + 3600 })}.sig`;
  const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "ander@teste.local", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

  const db = {
    profiles: [
      { id: USER_ID, email: "ander@teste.local", full_name: "Ander Rodrigues", role, active: true, created_at: "2026-09-23T23:10:00Z", updated_at: "" },
      { id: "22222222-2222-2222-2222-222222222222", email: "gestor@agencia.com", full_name: "Maria Gestora", role: "gestor", active: true, created_at: "2026-09-24T10:00:00Z", updated_at: "" },
      { id: "33333333-3333-3333-3333-333333333333", email: "cliente@excalibur.com", full_name: "Excalibur Fitness", role: "cliente", active: false, created_at: "2026-09-24T11:00:00Z", updated_at: "" },
    ],
    clients: [],
    access: [],
    connections: [],
    adAccounts: [],
    /** Contas que a "API do Meta" simulada devolve. */
    metaAccounts: [
      { externalId: "1001", name: "Excalibur - Principal", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: "BM Agência" },
      { externalId: "1002", name: "Excalibur - Remarketing", currency: "BRL", timezone: "America/Sao_Paulo", status: "pagamento_pendente", businessName: "BM Agência" },
    ],
    /** Contas que a "API do Google Ads" simulada devolve (uma via MCC, uma de teste). */
    googleAccounts: [
      { externalId: "1234567890", name: "Excalibur - Pesquisa", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: "MCC Agência", managerId: "9998887776", isTestAccount: false },
      { externalId: "5556667778", name: "Conta de Teste", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", businessName: null, managerId: null, isTestAccount: true },
    ],
    /** Segredos do Google que "faltam" no servidor simulado. */
    googleMissing: [],
    functionCalls: [],
    adAccountCalls: [],
    /** Campanhas e métricas diárias (como public.campaigns / public.metrics_daily). */
    campaigns: [],
    /** Conjuntos/grupos, anúncios e histórico de alterações. */
    adGroups: [],
    ads: [],
    entityChanges: [],
    metrics: [],
    rpcCalls: [],
    /** Última fotografia de saldo por conta; o que a "API" devolve ao atualizar; erros simulados. */
    snapshots: {},
    fundingApi: {},
    fundingErrors: {},
    /** Central de alertas (como public.alerts) e o que a próxima verificação encontra. */
    alerts: [],
    alertRefresh: null,
    /** Estado da sincronização por conta (como public.sync_state). */
    syncState: {},
    /** Log de sincronização (como public.sync_runs) e o que a próxima sincronização manual faz com cada conta. */
    syncRuns: [],
    syncOutcome: {},
    syncCalls: [],
    /** Auditoria (como public.audit_logs) e os logins/logouts registrados. */
    audit: [],
    authEvents: [],
    /** Cobertura do histórico por conta (como sync_state.history_from/to). */
    coverage: {},
  };

  /** Saldo de cada conta vinculada (mesma regra de public.account_balances). */
  function balanceRows(p) {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const shift = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
      const rows = db.adAccounts
        .filter((a) => !a.unlinked_at && (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(a.platform_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id)))
        .map((a) => {
          const s = db.snapshots[a.id] ?? {};
          const spend = db.metrics.filter((m) => m.ad_account_id === a.id && m.level === "account" && m.date >= shift(-7) && m.date <= shift(-1));
          return {
            ad_account_id: a.id, client_id: a.client_id, client_name: db.clients.find((c) => c.id === a.client_id)?.name ?? "",
            platform_id: a.platform_id, external_id: a.external_id, name: a.name, currency: s.currency ?? a.currency, status: a.status ?? "ativa",
            is_prepay: a.is_prepay ?? null, low_balance_days: a.low_balance_days ?? 3, low_balance_amount_micros: a.low_balance_amount_micros ?? null,
            captured_at: s.captured_at ?? null, available_micros: s.available_micros ?? null, available_basis: s.available_basis ?? null,
            amount_spent_micros: s.amount_spent_micros ?? null, amount_due_micros: s.amount_due_micros ?? null,
            spend_cap_micros: s.spend_cap_micros ?? null, budget_micros: s.budget_micros ?? null, budget_end_at: s.budget_end_at ?? null,
            funding_description: s.funding_description ?? null, issues: s.issues ?? [],
            spend_last_7_days_micros: spend.length ? spend.reduce((t, m) => t + m.spend_micros, 0) : null, spend_days: spend.length,
          };
        });
      return rows;

  }

  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 200, headers: cors });

    // --- Auth
    if (url.includes("/auth/v1/token")) {
      // Link de recuperação (PKCE): troca o código por uma sessão.
      if (url.includes("grant_type=pkce")) {
        db.pkceExchanges = (db.pkceExchanges ?? 0) + 1;
        return json(route, 200, { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r1", user });
      }
      if (req.postDataJSON().password !== PASSWORD) {
        return json(route, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      return json(route, 200, { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r1", user });
    }
    if (url.includes("/auth/v1/logout")) return route.fulfill({ status: 204, headers: cors });
    if (url.includes("/auth/v1/user")) return json(route, 200, user);

    // --- Perfis
    if (url.includes("/rest/v1/profiles")) {
      const id = eqParam(url, "id");
      return id ? json(route, 200, db.profiles.find((p) => p.id === id)) : json(route, 200, db.profiles);
    }

    // --- Clientes
    if (url.includes("/rest/v1/clients")) {
      const id = eqParam(url, "id");
      if (method === "GET") {
        if (id) return json(route, 200, db.clients.find((c) => c.id === id) ?? null);
        return json(route, 200, [...db.clients].sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (method === "POST") {
        const row = req.postDataJSON();
        if (row.cnpj && db.clients.some((c) => c.cnpj === row.cnpj)) {
          return json(route, 409, { code: "23505", message: 'duplicate key value violates unique constraint "clients_cnpj_key"' });
        }
        db.clients.push({ is_demo: false, created_by: USER_ID, created_at: new Date().toISOString(), updated_at: "", ...row });
        return route.fulfill({ status: 201, headers: cors });
      }
      if (method === "PATCH") {
        const client = db.clients.find((c) => c.id === id);
        Object.assign(client, req.postDataJSON());
        return route.fulfill({ status: 204, headers: cors });
      }
    }

    // --- Acessos
    if (url.includes("/rest/v1/user_client_access")) {
      const clientId = eqParam(url, "client_id");
      if (method === "GET") {
        return json(route, 200, db.access.filter((a) => a.client_id === clientId).map((a) => ({
          user_id: a.user_id,
          created_at: a.created_at,
          profile: db.profiles.find((p) => p.id === a.user_id) ?? null,
        })));
      }
      if (method === "POST") {
        db.access.push({ ...req.postDataJSON(), created_at: new Date().toISOString() });
        return route.fulfill({ status: 201, headers: cors });
      }
      if (method === "DELETE") {
        const userId = eqParam(url, "user_id");
        db.access = db.access.filter((a) => !(a.user_id === userId && a.client_id === clientId));
        return route.fulfill({ status: 204, headers: cors });
      }
    }

    // --- Conexões (o site só lê)
    if (url.includes("/rest/v1/platform_connections")) {
      const platform = eqParam(url, "platform_id");
      return json(route, 200, db.connections.filter((c) => !platform || c.platform_id === platform));
    }

    // --- Contas de anúncio (o site só lê)
    if (url.includes("/rest/v1/ad_accounts")) {
      const clientId = eqParam(url, "client_id");
      const platform = eqParam(url, "platform_id");
      return json(route, 200, db.adAccounts.filter((a) => (!clientId || a.client_id === clientId) && (!platform || a.platform_id === platform) && !a.unlinked_at));
    }

    // --- Campanhas (o site só lê)
    if (url.includes("/rest/v1/campaigns")) {
      const id = eqParam(url, "id");
      if (id) return json(route, 200, db.campaigns.find((c) => c.id === id) ?? null);
      const accountId = eqParam(url, "ad_account_id");
      const clientId = eqParam(url, "client_id");
      const platform = eqParam(url, "platform_id");
      return json(route, 200, db.campaigns.filter((c) =>
        (!accountId || c.ad_account_id === accountId) && (!clientId || c.client_id === clientId) && (!platform || c.platform_id === platform)));
    }

    // --- Central de alertas
    if (url.includes("/rest/v1/rpc/refresh_alerts")) {
      db.rpcCalls.push({ fn: "refresh_alerts" });
      if (!["admin", "gestor", "operador"].includes(role)) return json(route, 403, { code: "42501", message: "Sem permissão para verificar alertas" });
      const r = db.alertRefresh ? db.alertRefresh(db) : { created: 0, updated: db.alerts.filter((a) => a.status !== "resolvido").length, resolved: 0 };
      return json(route, 200, { ...r, checked_at: new Date().toISOString() });
    }
    if (url.includes("/rest/v1/rpc/set_alert_status")) {
      const p = req.postDataJSON();
      db.rpcCalls.push({ fn: "set_alert_status", ...p });
      if (!["admin", "gestor", "operador"].includes(role)) return json(route, 403, { code: "42501", message: "Sem permissão para alterar alertas" });
      const a = db.alerts.find((x) => x.id === p.p_id);
      if (!a) return json(route, 404, { code: "P0002", message: "Alerta não encontrado" });
      if (a.status === "resolvido") return json(route, 400, { code: "22023", message: "Alerta já resolvido" });
      const now = new Date().toISOString();
      if (p.p_status === "visto") Object.assign(a, { status: "visto", seen_at: now });
      if (p.p_status === "aberto") Object.assign(a, { status: "aberto", seen_at: null });
      if (p.p_status === "resolvido") Object.assign(a, { status: "resolvido", resolved_at: now, resolution: "manual" });
      return json(route, 200, a);
    }
    if (url.includes("/rest/v1/alerts")) {
      const statusParam = new URL(url).searchParams.get("status");
      const allowed = !statusParam ? null : statusParam.startsWith("in.(") ? statusParam.slice(4, -1).split(",") : [statusParam.replace(/^eq\./, "")];
      const rows = db.alerts
        .filter((a) => !allowed || allowed.includes(a.status))
        .sort((x, y) => y.first_seen_at.localeCompare(x.first_seen_at))
        .map((a) => {
          const acc = db.adAccounts.find((x) => x.id === a.ad_account_id);
          return { ...a,
            clients: { name: db.clients.find((c) => c.id === a.client_id)?.name ?? "" },
            ad_accounts: acc ? { name: acc.name, external_id: acc.external_id } : null,
            campaigns: a.campaign_id ? { name: db.campaigns.find((c) => c.id === a.campaign_id)?.name ?? "" } : null };
        });
      return json(route, 200, rows);
    }

    // --- Estrutura por plataforma (mesma regra de public.platform_structure)
    if (url.includes("/rest/v1/rpc/platform_structure")) {
      const p = req.postDataJSON();
      db.rpcCalls.push({ fn: "platform_structure", ...p });
      const accs = new Set(db.adAccounts.filter((a) => a.platform_id === p.p_platform && !a.unlinked_at &&
        (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id))).map((a) => a.id));
      const accountOf = (x) => x.ad_account_id ?? db.campaigns.find((c) => c.id === x.campaign_id)?.ad_account_id;
      const out = [];
      for (const [level, list] of [["campaign", db.campaigns], ["ad_group", db.adGroups], ["ad", db.ads]]) {
        const counts = {};
        for (const x of list) {
          const campaignId = level === "campaign" ? x.id : x.campaign_id;
          if (!accs.has(accountOf(x)) || (p.p_campaign_ids && !p.p_campaign_ids.includes(campaignId))) continue;
          counts[x.status] = (counts[x.status] ?? 0) + 1;
        }
        for (const [status, total] of Object.entries(counts)) out.push({ level, status, total });
      }
      return json(route, 200, out);
    }

    // --- Alcance por período (tabela public.period_reach, lida direto com o RLS)
    if (url.includes("/rest/v1/period_reach")) {
      const f = (k) => eqParam(url, k);
      db.reachQueries = (db.reachQueries ?? 0) + 1;
      return json(route, 200, (db.reachRows ?? []).filter((r) => r.ad_account_id === f("ad_account_id") && r.level === f("level") &&
        r.entity_external_id === f("entity_external_id") && r.period_start === f("period_start") && r.period_end === f("period_end")));
    }

    // --- Saldo das contas (mesma regra de public.account_balances)
    if (url.includes("/rest/v1/rpc/account_balances")) return json(route, 200, balanceRows(req.postDataJSON()));

    // --- Saúde das contas (mesma regra de public.account_health)
    if (url.includes("/rest/v1/rpc/account_health")) {
      const p = req.postDataJSON();
      return json(route, 200, balanceRows({ ...p, p_ad_account_ids: null }).map((b) => {
        const a = db.adAccounts.find((x) => x.id === b.ad_account_id);
        const sync = db.syncState[a.id] ?? { status: "pendente" };
        const conn = db.connections.find((c) => c.id === a.connection_id);
        return {
          ...b, raw_status: a.raw_status ?? null, status_reason: a.status_reason ?? null, is_test_account: a.is_test_account ?? null,
          details_updated_at: a.details_updated_at ?? null, sync_status: sync.status, last_attempt_at: sync.last_attempt_at ?? null,
          last_success_at: sync.last_success_at ?? null, last_error_message: sync.last_error_message ?? null,
          connection_id: a.connection_id ?? null, connection_status: conn?.status ?? null, connection_error: conn?.last_error ?? null,
        };
      }));
    }

    if (url.includes("/rest/v1/ad_groups")) {
      const id = eqParam(url, "id");
      return json(route, 200, db.adGroups.find((g) => g.id === id) ?? null);
    }
    if (url.includes("/rest/v1/entity_changes")) {
      const level = eqParam(url, "entity_level");
      const id = eqParam(url, "entity_id");
      return json(route, 200, db.entityChanges.filter((c) => c.entity_level === level && c.entity_id === id)
        .sort((a, b) => b.detected_at.localeCompare(a.detected_at)));
    }

    // --- Campanha, conjunto/grupo ou anúncio (mesma regra de public.entity_rows)
    if (url.includes("/rest/v1/rpc/entity_rows")) {
      const p = req.postDataJSON();
      db.rpcCalls.push({ fn: "entity_rows", ...p });
      const source = { campaign: db.campaigns, ad_group: db.adGroups, ad: db.ads }[p.p_level];
      const parentKey = { campaign: null, ad_group: "campaign_id", ad: "ad_group_id" }[p.p_level];
      const metricKey = { campaign: "campaign_id", ad_group: "ad_group_id", ad: "ad_id" }[p.p_level];
      const q = p.p_search?.trim().toLowerCase();
      const sum = (list, k) => (list.length && !list.every((m) => m[k] == null) ? list.reduce((t, m) => t + (m[k] ?? 0), 0) : null);
      const div = (a, b, f = 1) => (a != null && b ? (a * f) / b : null);
      let rows = source
        .filter((e) => (!p.p_ids || p.p_ids.includes(e.id)) && (!p.p_parent_id || e[parentKey] === p.p_parent_id) &&
          (!p.p_statuses || p.p_statuses.includes(e.status)) && (!q || e.name.toLowerCase().includes(q) || e.external_id === p.p_search.trim()))
        .map((e) => {
          const acc = db.adAccounts.find((a) => a.id === e.ad_account_id);
          const ms = db.metrics.filter((m) => m.level === p.p_level && m[metricKey] === e.id && m.date >= p.p_from && m.date <= p.p_to);
          const has = ms.length > 0;
          const t = Object.fromEntries(["spend_micros", "impressions", "clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, has ? sum(ms, k) : null]));
          return {
            id: e.id, level: p.p_level, name: e.name, external_id: e.external_id, parent_id: parentKey ? e[parentKey] : null,
            campaign_id: p.p_level === "campaign" ? e.id : e.campaign_id, client_id: e.client_id, platform_id: e.platform_id,
            ad_account_id: e.ad_account_id, currency: acc?.currency ?? null, status: e.status, raw_status: null,
            detail: e.objective ?? e.optimization_goal ?? e.creative_type ?? null, review_status: e.review_status ?? null,
            thumbnail_url: e.thumbnail_url ?? null, budget_micros: e.budget_micros ?? null, budget_period: e.budget_period ?? null,
            has_data: has, ...t, reach: null, frequency: null,
            ctr: div(t.clicks, t.impressions, 100), cpc_micros: div(t.spend_micros, t.clicks), cpm_micros: div(t.spend_micros, t.impressions, 1000),
            cpl_micros: div(t.spend_micros, t.leads), cpa_micros: div(t.spend_micros, t.conversions),
            roas: t.conversion_value_micros ? div(t.conversion_value_micros, t.spend_micros) : null,
          };
        });
      const keyOf = { name: "name", status: "status", budget: "budget_micros", spend: "spend_micros", impressions: "impressions", clicks: "clicks",
        ctr: "ctr", cpc: "cpc_micros", cpm: "cpm_micros", leads: "leads", conversions: "conversions", cpl: "cpl_micros", cpa: "cpa_micros", roas: "roas" }[p.p_sort] ?? "spend_micros";
      const desc = p.p_desc ?? true;
      rows.sort((a, b) => {
        const x = a[keyOf], y = b[keyOf];
        if (x == null && y == null) return a.name.localeCompare(b.name);
        if (x == null) return 1;
        if (y == null) return -1;
        const cmp = typeof x === "string" ? x.toLowerCase().localeCompare(y.toLowerCase()) : x - y;
        return (desc ? -cmp : cmp) || a.name.localeCompare(b.name);
      });
      const total = rows.length;
      rows = rows.slice(p.p_offset ?? 0, (p.p_offset ?? 0) + (p.p_limit ?? 50)).map((r) => ({ ...r, total_count: total }));
      return json(route, 200, rows);
    }

    // --- Tabela de campanhas (mesma regra de public.campaign_table)
    if (url.includes("/rest/v1/rpc/campaign_table")) {
      const p = req.postDataJSON();
      db.rpcCalls.push({ fn: "campaign_table", ...p });
      const q = p.p_search?.trim().toLowerCase();
      const sum = (list, k) => (list.length && !list.every((m) => m[k] == null) ? list.reduce((t, m) => t + (m[k] ?? 0), 0) : null);
      const div = (a, b, f = 1) => (a != null && b ? (a * f) / b : null);
      let rows = db.campaigns
        .filter((c) => (!p.p_client_ids || p.p_client_ids.includes(c.client_id)) && (!p.p_platforms || p.p_platforms.includes(c.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(c.ad_account_id)) && (!p.p_statuses || p.p_statuses.includes(c.status)))
        .map((c) => {
          const acc = db.adAccounts.find((a) => a.id === c.ad_account_id);
          const client = db.clients.find((x) => x.id === c.client_id);
          const ms = db.metrics.filter((m) => m.level === "campaign" && m.campaign_id === c.id && m.date >= p.p_from && m.date <= p.p_to);
          const has = ms.length > 0;
          const t = Object.fromEntries(["spend_micros", "impressions", "clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, has ? sum(ms, k) : null]));
          const reach = (db.periodReach ?? []).find((r) => r.campaign_id === c.id && r.period_start === p.p_from && r.period_end === p.p_to)?.reach ?? null;
          return {
            campaign_id: c.id, name: c.name, external_id: c.external_id ?? c.id, client_id: c.client_id, client_name: client?.name ?? "",
            platform_id: c.platform_id, ad_account_id: c.ad_account_id, account_name: acc?.name ?? "", currency: acc?.currency ?? null,
            objective: c.objective ?? null, status: c.status, raw_status: null, budget_micros: c.budget_micros ?? null, budget_period: c.budget_period ?? null,
            has_data: has, ...t, reach, frequency: reach ? t.impressions / reach : null,
            ctr: div(t.clicks, t.impressions, 100), cpc_micros: div(t.spend_micros, t.clicks), cpm_micros: div(t.spend_micros, t.impressions, 1000),
            cpl_micros: div(t.spend_micros, t.leads), cpa_micros: div(t.spend_micros, t.conversions),
            roas: t.conversion_value_micros ? div(t.conversion_value_micros, t.spend_micros) : null,
          };
        })
        .filter((r) => !q || r.name.toLowerCase().includes(q) || r.client_name.toLowerCase().includes(q) || r.external_id === p.p_search.trim());
      const keyOf = { name: "name", platform: "platform_id", objective: "objective", status: "status", budget: "budget_micros", spend: "spend_micros",
        impressions: "impressions", reach: "reach", frequency: "frequency", clicks: "clicks", ctr: "ctr", cpc: "cpc_micros", cpm: "cpm_micros",
        leads: "leads", messages: "messages", conversions: "conversions", cpl: "cpl_micros", cpa: "cpa_micros", roas: "roas" }[p.p_sort];
      rows.sort((a, b) => {
        const x = a[keyOf], y = b[keyOf];
        if (x == null && y == null) return a.name.localeCompare(b.name);
        if (x == null) return 1;
        if (y == null) return -1;
        const cmp = typeof x === "string" ? x.toLowerCase().localeCompare(y.toLowerCase()) : x - y;
        return (p.p_desc ? -cmp : cmp) || a.name.localeCompare(b.name);
      });
      const total = rows.length;
      rows = rows.slice(p.p_offset, p.p_offset + p.p_limit).map((r) => ({ ...r, total_count: total }));
      return json(route, 200, rows);
    }

    // --- Série no tempo do gráfico (mesma regra de public.dashboard_timeseries)
    if (url.includes("/rest/v1/rpc/dashboard_timeseries")) {
      const p = req.postDataJSON();
      db.rpcCalls.push({ fn: "dashboard_timeseries", ...p });
      const byCampaign = Boolean(p.p_campaign_ids || p.p_campaign_statuses);
      const monday = (d) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
      const bucketOf = (d) => (p.p_granularity === "day" ? d : p.p_granularity === "week" ? monday(d) : `${d.slice(0, 7)}-01`);
      const rows = db.metrics.filter((m) => {
        const campaign = db.campaigns.find((c) => c.id === m.campaign_id);
        return m.level === (byCampaign ? "campaign" : "account") && m.date >= p.p_from && m.date <= p.p_to &&
          (!p.p_client_ids || p.p_client_ids.includes(m.client_id)) && (!p.p_platforms || p.p_platforms.includes(m.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(m.ad_account_id)) && (!p.p_campaign_ids || p.p_campaign_ids.includes(m.campaign_id)) &&
          (!p.p_campaign_statuses || p.p_campaign_statuses.includes(campaign?.status));
      });
      const groups = Map.groupBy(rows, (m) => `${bucketOf(m.date)}|${p.p_by_platform ? m.platform_id : ""}|${m.currency}`);
      const sum = (list, k) => (list.every((r) => r[k] == null) ? null : list.reduce((t, r) => t + (r[k] ?? 0), 0));
      const out = [...groups].map(([key, list]) => {
        const [bucket, platform, currency] = key.split("|");
        const entities = new Set(list.map((m) => (byCampaign ? m.campaign_id : m.ad_account_id)));
        return {
          bucket, platform_id: platform || null, currency,
          ...Object.fromEntries(["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, sum(list, k)])),
          reach: p.p_granularity === "day" && entities.size === 1 ? sum(list, "reach") : null,
          days_with_data: new Set(list.map((m) => m.date)).size,
        };
      }).sort((a, b) => a.bucket.localeCompare(b.bucket));
      return json(route, 200, out);
    }

    // --- Resumo do dashboard (mesma regra de public.dashboard_summary)
    if (url.includes("/rest/v1/rpc/dashboard_summary")) {
      const p = req.postDataJSON();
      db.rpcCalls.push(p);
      const byCampaign = Boolean(p.p_campaign_ids || p.p_campaign_statuses);
      const rows = db.metrics.filter((m) => {
        const campaign = db.campaigns.find((c) => c.id === m.campaign_id);
        return m.level === (byCampaign ? "campaign" : "account") && m.date >= p.p_from && m.date <= p.p_to &&
          (!p.p_client_ids || p.p_client_ids.includes(m.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(m.platform_id)) &&
          (!p.p_ad_account_ids || p.p_ad_account_ids.includes(m.ad_account_id)) &&
          (!p.p_campaign_ids || p.p_campaign_ids.includes(m.campaign_id)) &&
          (!p.p_campaign_statuses || p.p_campaign_statuses.includes(campaign?.status));
      });
      const sum = (list, key) => (list.every((r) => r[key] == null) ? null : list.reduce((t, r) => t + (r[key] ?? 0), 0));
      const groups = Map.groupBy(rows, (r) => r.currency);
      const out = [...groups].map(([currency, list]) => ({
        currency, source_level: byCampaign ? "campaign" : "account",
        ...Object.fromEntries(["spend_micros", "impressions", "clicks", "link_clicks", "leads", "messages", "conversions", "conversion_value_micros"].map((k) => [k, sum(list, k)])),
        accounts: new Set(list.map((r) => r.ad_account_id)).size,
        campaigns: new Set(list.map((r) => r.campaign_id).filter(Boolean)).size,
        days_with_data: new Set(list.map((r) => r.date)).size,
        last_synced_at: "2026-09-23T22:10:00Z",
      })).sort((a, b) => b.spend_micros - a.spend_micros);
      return json(route, 200, out);
    }

    // --- Sincronização
    if (url.includes("/rest/v1/rpc/sync_overview")) {
      const rows = db.adAccounts.filter((a) => !a.unlinked_at).map((a) => {
        const s = db.syncState[a.id] ?? {};
        const r = db.syncRuns.filter((x) => x.ad_account_id === a.id).sort((x, y) => y.started_at.localeCompare(x.started_at))[0];
        return {
          ad_account_id: a.id, client_id: a.client_id, client_name: db.clients.find((c) => c.id === a.client_id)?.name ?? "",
          platform_id: a.platform_id, external_id: a.external_id, name: a.name,
          is_test_account: !!a.is_test_account, has_connection: !!a.connection_id,
          status: s.status ?? "pendente", last_attempt_at: s.last_attempt_at ?? null, last_success_at: s.last_success_at ?? null,
          next_run_at: s.next_run_at ?? null, last_error_message: s.last_error_message ?? null, running: !!s.running,
          run_status: r?.status ?? null, run_started_at: r?.started_at ?? null, run_finished_at: r?.finished_at ?? null,
          run_duration_ms: r?.duration_ms ?? null, run_records: r?.records_updated ?? null, run_trigger: r?.trigger ?? null, run_error: r?.error_message ?? null,
        };
      }).sort((x, y) => x.client_name.localeCompare(y.client_name) || x.platform_id.localeCompare(y.platform_id) || x.name.localeCompare(y.name));
      return json(route, 200, rows);
    }
    if (url.includes("/rest/v1/sync_runs")) {
      const q = new URL(url).searchParams;
      const val = (k) => q.get(k)?.replace(/^(eq|gte|lt)\./, "");
      const limit = Number(q.get("limit") ?? 50);
      const byId = q.get("order")?.startsWith("id");
      const rows = [...db.syncRuns]
        .filter((x) => (!q.get("status") || x.status === val("status")) && (!q.get("client_id") || x.client_id === val("client_id")) &&
          (!q.get("started_at") || x.started_at >= val("started_at")) && (!q.get("id") || x.id < Number(val("id"))))
        .sort((x, y) => (byId ? y.id - x.id : y.started_at.localeCompare(x.started_at)))
        .slice(0, limit)
        .map((x) => {
          const acc = db.adAccounts.find((a) => a.id === x.ad_account_id);
          return { ...x, ad_accounts: acc ? { name: acc.name, external_id: acc.external_id } : null, clients: { name: db.clients.find((c) => c.id === x.client_id)?.name ?? "" } };
        });
      return json(route, 200, rows);
    }
    // --- Logs (Etapa 17)
    if (url.includes("/rest/v1/rpc/log_auth_event")) {
      db.authEvents.push(req.postDataJSON().p_event);
      return json(route, 200, null);
    }
    // --- Histórico (Etapa 23): até onde vai o histórico de cada conta
    if (url.includes("/rest/v1/rpc/history_coverage")) {
      const p = req.postDataJSON();
      db.rpcCalls.push({ fn: "history_coverage", ...p });
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const [y, mo] = today.split("-").map(Number);
      const t = y * 12 + (mo - 1) - 12;
      const target = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
      const rows = db.adAccounts
        .filter((a) => !a.unlinked_at && (!p.p_client_ids || p.p_client_ids.includes(a.client_id)) &&
          (!p.p_platforms || p.p_platforms.includes(a.platform_id)) && (!p.p_ad_account_ids || p.p_ad_account_ids.includes(a.id)))
        .map((a) => {
          const c = db.coverage[a.id] ?? {};
          return {
            ad_account_id: a.id, name: a.name, client_id: a.client_id, client_name: db.clients.find((x) => x.id === a.client_id)?.name ?? "",
            platform_id: a.platform_id, currency: a.currency, history_from: c.history_from ?? null, history_to: c.history_to ?? null,
            target, importing: c.importing ?? false, backfill_error: c.backfill_error ?? null,
          };
        });
      return json(route, 200, rows);
    }
    // --- Busca global (Etapa 22): mesma regra de public.global_search
    if (url.includes("/rest/v1/rpc/global_search")) {
      const p = req.postDataJSON();
      db.rpcCalls.push({ fn: "global_search", ...p });
      if (role === "cliente") return json(route, 200, []);
      const norm = (t) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const q = norm(p.p_query.trim());
      if (q.length < 2) return json(route, 200, []);
      const id = p.p_query.trim().replace(/^act_/, "");
      const lim = Math.min(Math.max(p.p_limit ?? 5, 1), 20);
      const hit = (x) => norm(x.name).includes(q) || x.external_id === id;
      const clientName = (cid) => db.clients.find((c) => c.id === cid)?.name ?? "";
      const pick = (list) => list.filter(hit).slice(0, lim);
      const rows = [
        ...db.clients.filter((c) => norm(c.name).includes(q) || norm(c.company).includes(q)).slice(0, lim)
          .map((c) => ({ kind: "cliente", id: c.id, name: c.name, external_id: null, platform_id: null, client_id: c.id, client_name: c.name, parent_name: c.company, status: c.status })),
        ...pick(db.adAccounts.filter((a) => !a.unlinked_at))
          .map((a) => ({ kind: "conta", id: a.id, name: a.name, external_id: a.external_id, platform_id: a.platform_id, client_id: a.client_id, client_name: clientName(a.client_id), parent_name: null, status: a.status ?? "ativa" })),
        ...pick(db.campaigns)
          .map((x) => ({ kind: "campanha", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.adAccounts.find((a) => a.id === x.ad_account_id)?.name ?? null, status: x.status })),
        ...pick(db.adGroups)
          .map((x) => ({ kind: "conjunto", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.campaigns.find((c) => c.id === x.campaign_id)?.name ?? null, status: x.status })),
        ...pick(db.ads)
          .map((x) => ({ kind: "anuncio", id: x.id, name: x.name, external_id: x.external_id, platform_id: x.platform_id, client_id: x.client_id, client_name: clientName(x.client_id), parent_name: db.campaigns.find((c) => c.id === x.campaign_id)?.name ?? null, status: x.status })),
      ];
      return json(route, 200, rows);
    }
    if (url.includes("/rest/v1/rpc/audit_log_list")) {
      const p = req.postDataJSON();
      db.rpcCalls.push({ fn: "audit_log_list", ...p });
      if (role !== "admin") return json(route, 200, []);
      const rows = [...db.audit]
        .filter((l) => (!p.p_from || l.created_at >= p.p_from) && (!p.p_actor || l.actor_id === p.p_actor) &&
          (!p.p_before_id || l.id < p.p_before_id) &&
          (!p.p_category || (p.p_category === "auth" ? l.action.startsWith("auth.") : l.target_type === p.p_category && !l.action.startsWith("auth."))))
        .sort((x, y) => y.id - x.id)
        .slice(0, p.p_limit ?? 100)
        .map((l) => {
          const actor = db.profiles.find((x) => x.id === l.actor_id);
          return { ...l, actor_name: actor?.full_name || null, actor_email: actor?.email ?? null };
        });
      return json(route, 200, rows);
    }
    if (url.includes("/functions/v1/sync")) {
      const body = req.postDataJSON();
      db.syncCalls.push(body);
      if (!["admin", "gestor", "operador"].includes(role)) return json(route, 403, { error: { code: "FORBIDDEN", message: "Você não tem permissão para esta ação." } });
      const wanted = db.adAccounts.filter((a) => !a.unlinked_at && a.connection_id && (!body.adAccountIds || body.adAccountIds.includes(a.id)));
      if (!wanted.length) return json(route, 404, { error: { code: "NOT_FOUND", message: "Nenhuma conta com conexão ativa para sincronizar." } });
      const results = [];
      let runId = db.syncRuns.reduce((m, x) => Math.max(m, x.id), 0);
      for (const a of wanted) {
        const o = db.syncOutcome[a.id] ?? { status: "sucesso", records: 100, durationMs: 4000 };
        const end = new Date();
        const start = new Date(end.getTime() - o.durationMs).toISOString();
        db.syncRuns.push({ id: ++runId, ad_account_id: a.id, client_id: a.client_id, platform_id: a.platform_id, trigger: "manual", status: o.status,
          started_at: start, finished_at: end.toISOString(), duration_ms: o.durationMs, records_updated: o.records, error_message: o.error ?? null });
        const prev = db.syncState[a.id] ?? {};
        db.syncState[a.id] = { ...prev, status: o.status, running: false, last_attempt_at: start,
          last_success_at: o.status === "sucesso" ? end.toISOString() : prev.last_success_at ?? null,
          next_run_at: new Date(end.getTime() + (o.status === "sucesso" ? 60 : 30) * 60_000).toISOString(), last_error_message: o.error ?? null };
        results.push({ adAccountId: a.id, status: o.status, records: o.records, durationMs: o.durationMs, error: o.error ?? null });
      }
      return json(route, 200, { data: { results, queued: 0, alreadyRunning: 0 } });
    }

    // --- Edge Function ad-accounts (simula o servidor + API do Meta)
    if (url.includes("/functions/v1/ad-accounts")) {
      const body = req.postDataJSON();
      db.adAccountCalls.push(body);
      const now = new Date().toISOString();
      switch (body.action) {
        case "connect": {
          if (!body.accessToken.startsWith("EAA")) {
            return json(route, 400, { error: { code: "AUTH_EXPIRED", message: "O token do Meta é inválido ou expirou. Gere um novo token e conecte novamente." } });
          }
          const connection = { id: "c0000000-0000-4000-8000-000000000001", platform_id: "meta", label: body.label, status: "ativa", external_user_id: "su1", external_user_name: "Backstage Flow (sistema)", last_checked_at: now, last_error: null, created_at: now };
          db.connections.push(connection);
          return json(route, 200, { data: { connectionId: connection.id, ownerName: connection.external_user_name, renewed: false } });
        }
        case "google_status":
          return json(route, 200, { data: { missing: db.googleMissing, callbackPath: "/configuracoes/integracoes/google/callback" } });
        case "google_start":
          return json(route, 200, { data: { url: `https://accounts.google.com/o/oauth2/v2/auth?state=${"a".repeat(64)}&redirect_uri=${encodeURIComponent(body.redirectUri)}` } });
        case "google_complete": {
          if (body.code !== "codigo-valido") {
            return json(route, 400, { error: { code: "INVALID_STATE", message: "Autorização inválida ou expirada. Tente conectar de novo." } });
          }
          const connection = { id: "c0000000-0000-4000-8000-000000000002", platform_id: "google", label: body.label, status: "ativa", external_user_id: "g1", external_user_name: "agencia@gmail.com", last_checked_at: now, last_error: null, created_at: now };
          db.connections.push(connection);
          return json(route, 200, { data: { connectionId: connection.id, ownerName: connection.external_user_name, renewed: false } });
        }
        case "disconnect": {
          db.connections.find((c) => c.id === body.connectionId).status = "revogada";
          return json(route, 200, { data: { connectionId: body.connectionId } });
        }
        case "list_available": {
          const platform = db.connections.find((c) => c.id === body.connectionId)?.platform_id;
          const source = platform === "google" ? db.googleAccounts : db.metaAccounts;
          return json(route, 200, { data: { accounts: source.map((a) => ({ managerId: null, isTestAccount: null, ...a, linkedClientId: db.adAccounts.find((x) => x.external_id === a.externalId && !x.unlinked_at)?.client_id ?? null })) } });
        }
        case "link": {
          const platform = db.connections.find((c) => c.id === body.connectionId)?.platform_id ?? "meta";
          const found = (platform === "google" ? db.googleAccounts : db.metaAccounts).find((a) => a.externalId === body.externalId);
          const id = `a0000000-0000-4000-8000-${body.externalId.padStart(12, "0").slice(-12)}`;
          db.adAccounts.push({
            id, platform_id: platform, external_id: found.externalId, client_id: body.clientId, connection_id: body.connectionId,
            name: found.name, currency: found.currency, timezone: found.timezone, status: found.status,
            raw_status: platform === "google" ? "customer.status=ENABLED" : "account_status=1",
            status_reason: null, business_name: found.businessName, is_prepay: null,
            manager_customer_id: body.managerCustomerId ?? null, is_test_account: found.isTestAccount ?? null,
            linked_at: now, details_updated_at: now, unlinked_at: null,
            assets: platform === "meta"
              ? [{ asset_type: "page", external_id: "p1", name: "Excalibur Fitness" }, { asset_type: "instagram", external_id: "ig1", name: "@excaliburfitness" }]
              : [],
          });
          return json(route, 200, { data: { adAccountId: id, warning: null } });
        }
        case "refresh":
          return json(route, 200, { data: { adAccountId: body.adAccountId, warning: null } });
        case "refresh_balance": {
          const results = body.adAccountIds.map((id) => {
            if (db.fundingErrors[id]) return { adAccountId: id, ok: false, error: db.fundingErrors[id] };
            db.snapshots[id] = { ...db.fundingApi[id], captured_at: now };
            const acc = db.adAccounts.find((a) => a.id === id);
            if (acc && db.fundingApi[id]?.status) acc.status = db.fundingApi[id].status;
            return { adAccountId: id, ok: true };
          });
          return json(route, 200, { data: { results } });
        }
        case "balance_settings": {
          const account = db.adAccounts.find((a) => a.id === body.adAccountId);
          account.low_balance_days = body.lowBalanceDays;
          account.low_balance_amount_micros = body.lowBalanceAmount == null ? null : Math.round(body.lowBalanceAmount * 1_000_000);
          return json(route, 200, { data: { adAccountId: body.adAccountId } });
        }
        case "unlink": {
          db.adAccounts.find((a) => a.id === body.adAccountId).unlinked_at = now;
          return json(route, 200, { data: { adAccountId: body.adAccountId } });
        }
      }
    }

    // --- Edge Function admin-users
    if (url.includes("/functions/v1/admin-users")) {
      const body = req.postDataJSON();
      db.functionCalls.push(body);
      if (body.email === "repetido@agencia.com") {
        return json(route, 409, { error: { code: "EMAIL_IN_USE", message: "Já existe um usuário com este e-mail." } });
      }
      return json(route, 200, { data: { id: "x" } });
    }

    return route.fulfill({ status: 404, headers: cors, body: "{}" });
  });

  return db;
}

export async function login(page, path = "/") {
  await page.goto(`${BASE}${path}`);
  await page.waitForURL("**/login");
  await page.getByLabel("E-mail").fill("ander@teste.local");
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}
