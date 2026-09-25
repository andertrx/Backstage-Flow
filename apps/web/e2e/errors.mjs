/**
 * Teste de navegador da Etapa 25 — Tratamento de erros.
 * Supabase SIMULADO (support.mjs). Nenhum erro técnico quebra a tela; a pessoa
 * vê a mensagem amigável e o detalhe técnico vai para o log do administrador.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const ACC = "a0000000-0000-4000-8000-000000002501";
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const TECH = "API_ERROR_500_EXCEPTION";

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.adAccounts.push({ id: ACC, platform_id: "meta", external_id: "925", client_id: EXC, name: "CA - Shineray", currency: "BRL", status: "ativa", unlinked_at: null, connection_id: "c1" });
  db.syncState[ACC] = { last_success_at: ago(5) };
  db.errorLogs.push(
    { id: 1, occurred_at: ago(60 * 24 * 3), source: "sincronizacao", code: "RATE_LIMITED", user_message: "Não conseguimos atualizar os dados desta conta. O Meta pediu uma pausa nas consultas.",
      technical: "RATE_LIMITED — Error: (#80004) There have been too many calls ?access_token=[oculto]", context: { periodo: "2026-09-01..2026-09-25", gatilho: "agendada" },
      user_id: null, user_name: null, ad_account_id: ACC, account_name: "CA - Shineray", client_id: EXC, client_name: "Excalibur Fitness" },
    { id: 2, occurred_at: ago(60 * 24 * 40), source: "servidor", code: "UNKNOWN", user_message: "Algo deu errado. Tente novamente em instantes.",
      technical: "TypeError: antigo", context: { funcao: "ad-accounts" }, user_id: null, user_name: null, ad_account_id: null, account_name: null, client_id: null, client_name: null },
  );
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const siteLogs = (db, code) => db.errorLogs.filter((l) => l.source === "site" && (!code || l.code === code));
async function waitFor(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return fn();
}

// 1) Erro do banco no Dashboard: mensagem amigável, nada técnico na tela, detalhe no log
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.rpcOverride.dashboard_summary = { status: 500, body: { code: "XX000", message: TECH, details: "stack trace" } };
  await login(page, "/");
  await page.getByText("Não conseguimos carregar o resumo.").first().waitFor({ timeout: 8000 });
  const body = await page.locator("body").innerText();
  check(!body.includes(TECH) && !body.includes("XX000"), "Dashboard: o código técnico não aparece para a pessoa");
  check(await page.getByRole("navigation").first().isVisible(), "Dashboard: o menu continua funcionando");
  check(await waitFor(() => siteLogs(db, "DB_XX000").length > 0), "erro do banco vai para o log do administrador");
  const log = siteLogs(db, "DB_XX000")[0];
  check(log.technical.includes(TECH) && log.user_message === "Não conseguimos carregar o resumo." && log.context.pagina === "/",
    "log guarda o detalhe técnico, a mensagem mostrada e a tela");
  await page.screenshot({ path: `${SHOTS}/250-erro-banco.png`, fullPage: true });

  // Mesmo erro repetido não enche o log
  const before = siteLogs(db, "DB_XX000").length;
  await page.reload();
  await page.getByText("Não conseguimos carregar o resumo.").first().waitFor({ timeout: 8000 });
  check(siteLogs(db, "DB_XX000").length <= before + 1, "erro repetido não é registrado sem parar");
  check(errors.length === 0, "nenhum erro solto no navegador: " + errors.join(" | "));
  await browser.close();
}

// 2) Tela que quebra (dado inesperado): aviso amigável no lugar da tela branca
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.rpcOverride.history_coverage = { status: 200, body: { inesperado: true } };
  await login(page, "/historico");
  await page.getByTestId("error-fallback").waitFor({ timeout: 8000 });
  const text = clean(await page.getByTestId("error-fallback").innerText());
  check(text.includes("Algo não saiu como esperado") && text.includes("registrado para análise"), "tela quebrada: aviso amigável");
  check(!/TypeError|is not a function|undefined/.test(text), "tela quebrada: sem texto técnico");
  check(await page.getByRole("button", { name: "Tentar de novo" }).isVisible(), "tela quebrada: botão Tentar de novo");
  check(await waitFor(() => siteLogs(db, "SITE_RENDER_ERROR").length === 1), "tela quebrada: erro técnico registrado");
  check(siteLogs(db, "SITE_RENDER_ERROR")[0].technical.length > 10 && siteLogs(db, "SITE_RENDER_ERROR")[0].context.pagina === "/historico", "registro traz o detalhe e a tela");
  await page.screenshot({ path: `${SHOTS}/251-tela-quebrada.png`, fullPage: true });

  // O dado volta ao normal → "Tentar de novo" mostra a tela
  delete db.rpcOverride.history_coverage;
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await page.getByRole("heading", { name: /Histórico/, level: 1 }).waitFor({ timeout: 8000 });
  check(await page.getByTestId("error-fallback").count() === 0, "Tentar de novo: a tela volta a funcionar");

  // O menu continua funcionando mesmo com a tela quebrada
  db.rpcOverride.history_coverage = { status: 200, body: { inesperado: true } };
  await page.reload();
  await page.getByTestId("error-fallback").waitFor({ timeout: 8000 });
  await page.getByRole("link", { name: "Clientes" }).first().click();
  await page.getByRole("heading", { name: "Clientes", level: 1 }).waitFor({ timeout: 8000 });
  check(await page.getByTestId("error-fallback").count() === 0, "trocar de página pelo menu sai do aviso");
  await browser.close();
}

// 3) Versão nova do site (arquivo da página não existe mais) e erro solto no navegador
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/clientes");
  await page.getByRole("heading", { name: "Clientes", level: 1 }).waitFor();
  await page.route(/\/assets\/LogsPage-.*\.js$/, (route) => route.abort());
  await page.getByRole("link", { name: "Logs" }).first().click();
  await page.getByTestId("error-fallback").waitFor({ timeout: 8000 });
  const text = clean(await page.getByTestId("error-fallback").innerText());
  check(text.includes("O sistema foi atualizado") && (await page.getByRole("button", { name: "Recarregar a página" }).count()) === 1,
    "página que não carrega: pede para recarregar, sem erro técnico");
  check(await waitFor(() => siteLogs(db, "SITE_VERSION_CHANGED").length === 1), "página que não carrega: fica no log");
  await page.unroute(/\/assets\/LogsPage-.*\.js$/);

  await page.evaluate(() => setTimeout(() => { throw new Error("falha solta token=segredo123"); }, 0));
  check(await waitFor(() => siteLogs(db, "SITE_SCRIPT_ERROR").length === 1), "erro solto no navegador vai para o log");
  const tech = siteLogs(db, "SITE_SCRIPT_ERROR")[0].technical;
  check(tech.includes("falha solta") && !tech.includes("segredo123"), "segredo é apagado antes de enviar");
  await page.evaluate(() => { Promise.reject(new Error("promessa esquecida")); });
  check(await waitFor(() => siteLogs(db, "SITE_PROMISE_ERROR").length === 1), "promessa sem tratamento vai para o log");
  await browser.close();
}

// 4) Erro do servidor já amigável: aparece como veio e não é registrado duas vezes
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.syncState[ACC] = { last_success_at: ago(300) };
  await page.route("**/functions/v1/sync", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({ status: 502, headers: { "Access-Control-Allow-Origin": "*" }, contentType: "application/json",
        body: JSON.stringify({ error: { code: "PLATFORM_ERROR", message: "Não conseguimos atualizar os dados desta conta." } }) }));
  await login(page, "/sincronizacao");
  await page.getByRole("heading", { name: "Sincronização", level: 1 }).waitFor();
  await page.getByRole("button", { name: /Sincronizar agora/ }).first().click();
  await page.getByText("Não conseguimos atualizar os dados desta conta.").first().waitFor({ timeout: 8000 });
  check(!(await page.locator("body").innerText()).includes("PLATFORM_ERROR"), "servidor: só a mensagem amigável na tela");
  await page.waitForTimeout(500);
  check(siteLogs(db).filter((l) => l.code.startsWith("FUNCTION")).length === 0, "servidor: o site não registra de novo (o servidor já guardou)");
  await page.screenshot({ path: `${SHOTS}/252-erro-servidor.png`, fullPage: true });
  await browser.close();
}

// 5) Logs → Erros técnicos (administrador)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/logs");
  await page.getByRole("tab", { name: "Erros técnicos" }).click();
  await page.waitForURL(/aba=erros/, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent?.includes("Erros técnicos"), null, { timeout: 5000 }).catch(() => {});
  check(await page.getByRole("tab", { name: "Erros técnicos" }).getAttribute("aria-selected") === "true" && new URL(page.url()).searchParams.get("aba") === "erros",
    "aba Erros técnicos (fica no endereço)");
  await page.getByTestId("error-row").first().waitFor();
  check(await page.getByTestId("error-row").count() === 1, "últimos 30 dias: 1 erro (o de 40 dias fica de fora)");
  const row = page.getByTestId("error-row").first();
  check(clean(await row.getByTestId("error-message").innerText()).startsWith("Não conseguimos atualizar os dados desta conta."), "mostra a mensagem que a pessoa viu");
  check(clean(await row.getByTestId("error-where").innerText()) === "Cliente: Excalibur Fitness · Conta: CA - Shineray", "mostra onde aconteceu");
  check(!(await row.getByTestId("error-technical").isVisible()), "detalhe técnico fechado por padrão");
  await row.getByText("Detalhe técnico").click();
  const tech = await row.getByTestId("error-technical").innerText();
  check(tech.includes("too many calls") && tech.includes("periodo: 2026-09-01..2026-09-25"), "ao abrir: detalhe técnico e contexto");
  await page.screenshot({ path: `${SHOTS}/253-logs-erros.png`, fullPage: true });

  await page.getByLabel("Período").selectOption("todos");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=error-row]").length === 2);
  await page.getByLabel("Origem").selectOption("servidor");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=error-row]").length === 1);
  check(await page.locator("[data-testid=error-row][data-source=servidor]").count() === 1, "filtro por origem");
  check(new URL(page.url()).searchParams.get("origem") === "servidor", "filtro fica no endereço");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar planilha" }).click()]);
  check(download.suggestedFilename() === "logs-erros.csv", "planilha dos erros");
  await page.getByLabel("Origem").selectOption("site");
  await page.getByTestId("errors-empty").waitFor();
  check(true, "sem erros com o filtro: aviso de lista vazia");
  check(errors.length === 0, "nenhum erro solto no navegador: " + errors.join(" | "));
  await browser.close();
}

// 6) Gestor não vê os erros técnicos
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  await login(page, "/logs");
  await page.getByRole("heading", { name: "Logs", level: 1 }).waitFor();
  await page.goto(page.url().replace(/\/logs.*$/, "/logs?aba=erros"));
  await page.getByRole("heading", { name: "Logs", level: 1 }).waitFor();
  check(await page.getByRole("tab", { name: "Erros técnicos" }).count() === 0, "gestor: sem a aba Erros técnicos");
  check(!db.rpcCalls.some((c) => c.fn === "error_log_list"), "gestor: a lista de erros nem é pedida");
  await browser.close();
}

console.log("\nTodos os testes de tratamento de erros passaram.");
