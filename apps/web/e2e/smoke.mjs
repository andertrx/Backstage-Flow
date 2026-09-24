import { chromium } from "playwright";
/**
 * Teste de fumaça no navegador (Etapa 1): login, sessão, menu, usuários, celular e logout.
 *
 * O Supabase é SIMULADO (page.route), então o teste não toca em dados reais.
 * Como rodar (com o site rodando em http://localhost:5173 — "npm run dev"):
 *   npm run e2e -w @backstage/web
 * As capturas de tela ficam em apps/web/test-results/.
 */
import { mkdirSync } from "node:fs";
const SP = new URL("../test-results", import.meta.url).pathname;
mkdirSync(SP, { recursive: true });
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER_ID = "11111111-1111-1111-1111-111111111111";
const now = Math.floor(Date.now() / 1000);
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, role: "authenticated", aud: "authenticated", exp: now + 3600, email: "ander@teste.local" })}.sig`;
const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "ander@teste.local", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const profile = { id: USER_ID, email: "ander@teste.local", full_name: "Ander Rodrigues", role: "admin", active: true, created_at: "2026-09-23T23:10:00Z", updated_at: "2026-09-23T23:10:00Z" };
const others = [
  { id: "22222222-2222-2222-2222-222222222222", email: "gestor@agencia.com", full_name: "Maria Gestora", role: "gestor", active: true, created_at: "2026-09-24T10:00:00Z", updated_at: "" },
  { id: "33333333-3333-3333-3333-333333333333", email: "cliente@excalibur.com", full_name: "Excalibur Fitness", role: "cliente", active: false, created_at: "2026-09-24T11:00:00Z", updated_at: "" },
];
const functionCalls = [];

// CHROMIUM_PATH: usar um Chromium já instalado (ex.: em ambientes de CI sem download de navegador).
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: "pt-BR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.route("**/*.supabase.co/**", async (route) => {
  const req = route.request();
  const url = req.url();
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
  if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: cors });
  if (url.includes("/auth/v1/token")) {
    const body = req.postDataJSON();
    if (body.password !== "Senha-certa-1") {
      return route.fulfill({ status: 400, headers: cors, contentType: "application/json", body: JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }) });
    }
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r1", user }) });
  }
  if (url.includes("/auth/v1/logout")) return route.fulfill({ status: 204, headers: cors });
  if (url.includes("/auth/v1/user")) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(user) });
  if (url.includes("/rest/v1/profiles")) {
    if (url.includes(`id=eq.${USER_ID}`)) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(profile) });
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify([profile, ...others]) });
  }
  if (url.includes("/functions/v1/admin-users")) {
    const body = req.postDataJSON();
    functionCalls.push(body);
    if (body.email === "repetido@agencia.com") {
      return route.fulfill({ status: 409, headers: cors, contentType: "application/json", body: JSON.stringify({ error: { code: "EMAIL_IN_USE", message: "Já existe um usuário com este e-mail." } }) });
    }
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ data: { id: "x" } }) });
  }
  return route.fulfill({ status: 404, headers: cors, body: "{}" });
});

const check = (cond, msg) => { if (!cond) throw new Error("FALHOU: " + msg); console.log("ok -", msg); };

await page.goto(`${BASE}/campanhas`);
await page.waitForURL("**/login");
check(page.url().endsWith("/login"), "sem login, página protegida redireciona para /login");
await page.screenshot({ path: `${SP}/01-login.png` });

await page.getByLabel("E-mail").fill("ander@teste.local");
await page.getByLabel("Senha").fill("errada");
await page.getByRole("button", { name: "Entrar" }).click();
await page.getByText("E-mail ou senha incorretos.").waitFor();
check(true, "senha errada mostra mensagem amigável");
await page.screenshot({ path: `${SP}/02-login-erro.png` });

await page.getByLabel("Senha").fill("Senha-certa-1");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL("**/campanhas");
check(true, "após login volta para a página que tentou abrir");
await page.getByText("Esta área será desenvolvida na Etapa 9.").waitFor();

await page.getByRole("link", { name: "Dashboard" }).click();
await page.getByText("Olá, Ander!").waitFor();
check(true, "dashboard mostra saudação e papel");
const menu = await page.getByRole("navigation", { name: "Menu principal" }).first().innerText();
check(menu.includes("Configurações") && menu.includes("Logs"), "admin vê o menu completo");
await page.screenshot({ path: `${SP}/03-dashboard.png` });

await page.reload();
await page.getByText("Olá, Ander!").waitFor();
check(true, "sessão persiste após recarregar a página");

await page.getByRole("link", { name: "Configurações" }).click();
await page.waitForURL("**/configuracoes/usuarios");
await page.getByText("Maria Gestora").waitFor();
check(true, "lista de usuários carrega");
await page.screenshot({ path: `${SP}/04-usuarios.png` });

await page.getByRole("button", { name: "Novo usuário" }).click();
const dialog = page.getByRole("dialog", { name: "Novo usuário" });
await dialog.getByLabel("Nome completo").fill("João Operador");
await dialog.getByLabel("E-mail").fill("repetido@agencia.com");
await dialog.getByLabel("Papel").selectOption("operador");
await dialog.getByLabel("Senha inicial").fill("curta");
await dialog.getByRole("button", { name: "Criar usuário" }).click();
await dialog.getByText("A senha precisa ter pelo menos 8 caracteres.").waitFor();
check(functionCalls.length === 0, "senha curta é barrada antes de ir ao servidor");
await dialog.getByLabel("Senha inicial").fill("Operador2026");
await dialog.getByRole("button", { name: "Criar usuário" }).click();
await dialog.getByText("Já existe um usuário com este e-mail.").waitFor();
check(true, "erro do servidor aparece com mensagem amigável");
await page.screenshot({ path: `${SP}/05-novo-usuario-erro.png` });
await dialog.getByLabel("E-mail").fill("joao@agencia.com");
await dialog.getByRole("button", { name: "Criar usuário" }).click();
await dialog.waitFor({ state: "detached" });
const last = functionCalls.at(-1);
check(last.action === "create" && last.role === "operador" && last.email === "joao@agencia.com", "criação envia os dados certos ao servidor");

page.once("dialog", (d) => d.accept());
await page.getByRole("row", { name: /Excalibur/ }).getByRole("button", { name: "Reativar" }).click();
await page.waitForTimeout(300);
check(functionCalls.at(-1).action === "update" && functionCalls.at(-1).active === true, "reativar envia update active=true");
const selfBtn = page.getByRole("row", { name: /Ander Rodrigues/ }).getByRole("button", { name: "Desativar" });
check(await selfBtn.isDisabled(), "admin não consegue desativar a si mesmo pela tela");

// celular
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Abrir menu" }).click();
await page.screenshot({ path: `${SP}/06-celular-menu.png` });
await page.getByRole("link", { name: "Dashboard" }).last().click();
check(true, "menu funciona no celular");

await page.setViewportSize({ width: 1366, height: 820 });
await page.getByRole("button", { name: "Sair" }).click();
await page.waitForURL("**/login");
check(true, "logout volta para a tela de login");

await page.goto(`${BASE}/recuperar-senha`);
await page.screenshot({ path: `${SP}/07-recuperar-senha.png` });
check(errors.length === 0, "nenhum erro de JavaScript na página: " + errors.join(" | "));
await browser.close();
console.log("SMOKE OK");
