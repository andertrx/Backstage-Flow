/**
 * Teste de navegador da Etapa 26 — Segurança.
 * Supabase SIMULADO (support.mjs). Confere os cabeçalhos de proteção, o
 * bloqueio de scripts injetados (CSP), o aviso amigável do limite de
 * requisições e que nenhum segredo chega ao navegador.
 */
import { BASE, check, launch, login, mockSupabase } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const ACC = "a0000000-0000-4000-8000-000000002601";
const SECRET = /sb_secret_[A-Za-z0-9_-]{10,}|eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|GOCSPX-|(?<![A-Za-z0-9+/])EAA[A-Za-z0-9]{40,}|ya29\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/;

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.adAccounts.push({ id: ACC, platform_id: "meta", external_id: "926", client_id: EXC, name: "CA - Shineray", currency: "BRL", status: "ativa", unlinked_at: null, connection_id: "c1" });
  db.syncState[ACC] = { last_success_at: new Date(Date.now() - 300 * 60_000).toISOString() };
}

// 1) Cabeçalhos de proteção da página
{
  const { browser, page } = await launch();
  const res = await page.goto(`${BASE}/login`);
  const h = res.headers();
  const csp = h["content-security-policy"] ?? "";
  check(/script-src 'self'(;|$)/.test(csp) && !csp.includes("unsafe-eval"), "CSP: só scripts do próprio site (sem eval)");
  check(csp.includes("frame-ancestors 'none'") && h["x-frame-options"] === "DENY", "o site não pode ser aberto dentro de outro site (clickjacking)");
  check(csp.includes("object-src 'none'") && csp.includes("base-uri 'self'"), "CSP: sem plugins e sem troca da base dos links");
  check(/connect-src 'self' https:\/\/dkatllzkmlzpginuzvis\.supabase\.co/.test(csp), "CSP: o site só conversa com o próprio servidor (Supabase)");
  check(h["x-content-type-options"] === "nosniff" && h["referrer-policy"] === "strict-origin-when-cross-origin", "nosniff e política de referência");
  check(h["cross-origin-opener-policy"] === "same-origin" && /camera=\(\)/.test(h["permissions-policy"] ?? ""), "janela isolada e sem câmera/microfone/localização");

  // Script injetado (ex.: ataque XSS) é bloqueado pela CSP.
  const blocked = await page.evaluate(() => new Promise((resolve) => {
    let violated = false;
    document.addEventListener("securitypolicyviolation", () => { violated = true; }, { once: true });
    const s = document.createElement("script");
    s.textContent = "window.__injetado = true";
    document.body.appendChild(s);
    setTimeout(() => resolve({ ran: Boolean(window.__injetado), violated }), 200);
  }));
  check(!blocked.ran && blocked.violated, "script injetado na página é bloqueado");
  await browser.close();
}

// 2) Limite de requisições: aviso amigável, sem código técnico
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await page.route("**/functions/v1/sync", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({ status: 429, headers: { "Access-Control-Allow-Origin": "*" }, contentType: "application/json",
        body: JSON.stringify({ error: { code: "TOO_MANY_REQUESTS", message: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo." } }) }));
  await login(page, "/sincronizacao");
  await page.getByRole("heading", { name: "Sincronização", level: 1 }).waitFor();
  await page.getByRole("button", { name: /Sincronizar agora/ }).first().click();
  await page.getByText("Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.").first().waitFor({ timeout: 8000 });
  check(!(await page.locator("body").innerText()).includes("TOO_MANY_REQUESTS"), "limite de requisições: só a mensagem amigável");
  check(await page.getByRole("navigation").first().isVisible(), "limite de requisições: o site continua funcionando");

  // 3) Nenhum segredo no navegador: scripts baixados e armazenamento local
  const scripts = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean));
  const loaded = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.endsWith(".js")));
  let leaked = [];
  for (const url of new Set([...scripts, ...loaded].filter((u) => u.startsWith(BASE)))) {
    const text = await (await page.request.get(url)).text();
    if (SECRET.test(text)) leaked.push(url);
  }
  check(loaded.length > 0 && leaked.length === 0, `nenhum segredo nos ${new Set(loaded).size} arquivos de script do site`);
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  check(!SECRET.test(storage), "nenhum segredo guardado no navegador (só a sessão de login)");
  await browser.close();
}

console.log("\nTodos os testes de segurança passaram.");
