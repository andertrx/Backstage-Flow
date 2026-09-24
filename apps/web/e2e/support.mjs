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
  };

  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 200, headers: cors });

    // --- Auth
    if (url.includes("/auth/v1/token")) {
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
      return json(route, 200, db.adAccounts.filter((a) => a.client_id === clientId && a.platform_id === platform && !a.unlinked_at));
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
