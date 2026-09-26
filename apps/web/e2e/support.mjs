/**
 * Apoio aos testes de navegador: Supabase SIMULADO (nenhum dado real é tocado)
 * e utilidades comuns. O "banco" é uma memória que vive só durante o teste.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createMockBackend, createMockDb, USER_ID } from "../src/demo/mockBackend.js";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
export const SHOTS = new URL("../test-results", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

export const PASSWORD = "Senha-certa-1";
export { USER_ID };

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "*" };

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
  // Etapa 26: qualquer bloqueio da política de segurança (CSP) vira erro do teste.
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|connect|execute|apply)/i.test(m.text())) errors.push(`CSP: ${m.text()}`);
  });
  return { browser, page, errors };
}

/**
 * Instala o Supabase simulado na página (src/demo/mockBackend.js).
 * @param {import("playwright").Page} page
 * @param {{ role?: string }} options papel do usuário logado
 */
export async function mockSupabase(page, { role = "admin" } = {}) {
  const db = createMockDb({ role });
  const handle = createMockBackend(db, { role, password: PASSWORD });
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: cors });
    const r = await handle({ url: req.url(), method: req.method(), body: req.postData() });
    return route.fulfill(r.body === undefined
      ? { status: r.status, headers: cors }
      : { status: r.status, headers: cors, contentType: "application/json", body: r.body });
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
