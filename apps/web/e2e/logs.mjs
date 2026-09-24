/**
 * Teste de navegador da Etapa 17 — Logs.
 * Supabase SIMULADO (support.mjs).
 */
import { readFile } from "node:fs/promises";
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const ACC = "a0000000-0000-4000-8000-000000001701";
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  db.adAccounts.push({ id: ACC, platform_id: "meta", external_id: "905", client_id: EXC, name: "CA - Shineray", currency: "BRL", status: "ativa", unlinked_at: null, connection_id: "c1" });
  const row = (id, minutes, actor_id, action, target_type, target_label, details = {}) =>
    ({ id, created_at: ago(minutes), actor_id, action, target_type, target_id: "x", target_label, details });
  db.audit.push(
    row(1, 60 * 24 * 40, USER_ID, "client.update", "client", "Excalibur Fitness", { notes: { before: null, after: "VIP" } }),
    row(200, 120, MARIA, "auth.login", "user", "Maria Gestora"),
    row(201, 90, USER_ID, "client.insert", "client", "Excalibur Fitness", { id: "x", name: "Excalibur Fitness", status: "ativo", created_by: USER_ID }),
    row(202, 60, null, "ad_account.update", "ad_account", "CA - Shineray", { status: { before: "ativa", after: "pagamento_pendente" } }),
    row(203, 30, USER_ID, "user.update", "user", "Maria Gestora", { before: { full_name: "Maria Gestora", role: "operador", active: true }, after: { role: "gestor" } }),
    row(204, 10, USER_ID, "connection.insert", "connection", "BM - STG", { label: "BM - STG", status: "ativa", external_user_name: "Backstage Flow - By STG" }),
  );
  // Muitos logins antigos (para testar "Carregar mais")
  for (let i = 0; i < 101; i++) db.audit.push(row(2 + i, 60 * 24 * 50 + i, USER_ID, "auth.login", "user", "Ander Rodrigues"));
  const run = (id, minutes, status, records, error = null) => ({ id, ad_account_id: ACC, client_id: EXC, platform_id: "meta", trigger: "agendada", status,
    started_at: ago(minutes), finished_at: ago(minutes - 1), duration_ms: 56_000, records_updated: records, error_message: error });
  db.syncRuns.push(run(1, 180, "erro", 1, "Não conseguimos falar com o Meta agora."), run(2, 120, "sucesso", 1672), run(3, 60, "sucesso", 1500));
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
async function waitRows(page, testId, n) {
  await page.waitForFunction(([t, k]) => document.querySelectorAll(`[data-testid=${t}]`).length === k, [testId, n], { timeout: 5000 }).catch(() => {});
  return page.getByTestId(testId).count();
}
const auditRow = (page, action) => page.locator(`[data-testid=audit-row][data-action="${action}"]`).first();

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  check(db.authEvents.includes("login"), "login fica registrado");

  await page.getByRole("link", { name: /^Logs/ }).first().click();
  await page.getByRole("heading", { name: "Logs", level: 1 }).waitFor();
  check(await waitRows(page, "audit-row", 5) === 5, "últimos 30 dias: 5 ações (a de 40 dias atrás fica de fora)");

  const text = async (action, id) => clean(await auditRow(page, action).getByTestId(id).innerText());
  check(await text("auth.login", "audit-actor") === "Maria Gestora" && await text("auth.login", "audit-action") === "Entrou no sistema", "login: quem e o quê");
  check(await text("ad_account.update", "audit-actor") === "Sistema (automático)", "mudança automática aparece como Sistema");
  check(await text("ad_account.update", "audit-details") === "Status: Ativa → Pagamento pendente", "detalhe: antes → depois em português");
  check(await text("user.update", "audit-details") === "Papel: Operador → Gestor", "mudança de papel do usuário");
  check(await text("client.insert", "audit-details") === "Nome: Excalibur Fitness Status: Ativo", "cadastro: só campos principais (sem ids internos)");
  check(await text("connection.insert", "audit-target") === "BM - STG", "onde: nome da conexão");
  const order = await page.getByTestId("audit-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
  check(order[0] === "connection.insert" && order[4] === "auth.login", "mais recente primeiro");
  await page.screenshot({ path: `${SHOTS}/170-logs-acoes.png`, fullPage: true });

  // Filtros
  await page.getByLabel("Pessoa").selectOption(MARIA);
  check(await waitRows(page, "audit-row", 1) === 1 && await auditRow(page, "auth.login").count() === 1, "filtro por pessoa");
  await page.getByLabel("Pessoa").selectOption("");
  await page.getByLabel("Tipo").selectOption("ad_account");
  check(await waitRows(page, "audit-row", 1) === 1, "filtro por tipo");
  await page.getByLabel("Tipo").selectOption("auth");
  await page.getByLabel("Período").selectOption("todos");
  check(await waitRows(page, "audit-row", 100) === 100 && clean(await page.getByTestId("audit-count").innerText()) === "100+ registros", "muitos registros: mostra 100 e avisa que há mais");
  await page.getByRole("button", { name: "Carregar mais" }).click();
  check(await waitRows(page, "audit-row", 102) === 102, "Carregar mais traz o restante");
  check(await page.getByRole("button", { name: "Carregar mais" }).count() === 0, "sem mais registros, o botão some");
  check(new URL(page.url()).searchParams.get("periodo") === "todos", "filtros ficam no endereço da página");

  // Planilha
  await page.getByLabel("Tipo").selectOption("");
  await page.getByLabel("Período").selectOption("30");
  await waitRows(page, "audit-row", 5);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar planilha" }).click()]);
  const csv = await readFile(await download.path(), "utf8");
  check(download.suggestedFilename() === "logs-acoes.csv" && csv.startsWith("﻿Data e hora;Quem;E-mail;O que fez;Onde;Detalhes"), "planilha com cabeçalho em português");
  check(csv.includes("Sistema (automático);;Conta de anúncio alterada;CA - Shineray;Status: Ativa → Pagamento pendente"), "planilha com as linhas da tela");

  // Sincronizações
  await page.getByRole("tab", { name: "Sincronizações" }).click();
  check(await waitRows(page, "sync-log-row", 3) === 3, "aba de sincronizações");
  await page.getByLabel("Resultado").selectOption("erro");
  check(await waitRows(page, "sync-log-row", 1) === 1 && clean(await page.getByTestId("sync-log-row").innerText()).includes("Não conseguimos falar com o Meta agora."), "filtro de erros");
  await page.getByLabel("Resultado").selectOption("");
  await page.getByLabel("Cliente").selectOption(LOJA);
  await page.getByText("Nenhuma sincronização com estes filtros.").waitFor();
  check(true, "filtro por cliente sem resultados: mensagem clara");
  await page.getByLabel("Cliente").selectOption("");
  await waitRows(page, "sync-log-row", 3);
  await page.screenshot({ path: `${SHOTS}/171-logs-sincronizacoes.png`, fullPage: true });

  // Celular
  await page.getByRole("tab", { name: "Ações dos usuários" }).click();
  await waitRows(page, "audit-row", 5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check(overflow.sw <= overflow.vw, `no celular a página cabe na tela ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/172-logs-celular.png`, fullPage: true });
  await page.setViewportSize({ width: 1366, height: 820 });

  // Sair também fica registrado
  await page.getByRole("button", { name: /Sair/ }).click();
  await page.waitForURL("**/login");
  check(db.authEvents.includes("logout"), "logout fica registrado");

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Gestor: só as sincronizações (a auditoria é do administrador)
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  await login(page, "/logs");
  await page.getByRole("heading", { name: "Logs", level: 1 }).waitFor();
  check(await waitRows(page, "sync-log-row", 3) === 3, "gestor vê as sincronizações");
  check(await page.getByRole("tab").count() === 0 && await page.getByTestId("audit-row").count() === 0, "gestor não vê a auditoria");
  check(!db.rpcCalls.some((c) => c.fn === "audit_log_list"), "a auditoria nem é pedida para o gestor");
  check(errors.length === 0, "sem erros (gestor)");
  await browser.close();
}

{
  // Operador e cliente não acessam
  for (const role of ["operador", "cliente"]) {
    const { browser, page } = await launch();
    const db = await mockSupabase(page, { role });
    seed(db);
    await login(page, "/logs");
    await page.waitForTimeout(1500);
    check(!(await page.getByRole("heading", { name: "Logs", level: 1 }).count()), `perfil ${role} não acessa os logs`);
    await browser.close();
  }
}

console.log("Logs: tudo certo.");
