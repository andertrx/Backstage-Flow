/**
 * Teste de navegador — Desativar cliente (23/10/2026).
 * Só admin vê o botão; desativar pede confirmação, mostra o aviso, encerra os alertas abertos do cliente e tira o
 * cliente das escolhas do dia a dia; reativar volta. Quem não é admin não vê o botão e o servidor recusa.
 * Contas: aba "Contas ativas" e aba "Clientes desativados"; a verificação de saldo só pega as ativas.
 * Excluir cliente: só admin, só desativado, digitando o nome; some de todas as telas (dados ficam guardados).
 * Supabase SIMULADO (support.mjs).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004201";
const OUTRO = "e0000000-0000-4000-8000-000000004202";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Loja Que Saiu"), client(OUTRO, "Loja Que Fica"));
  db.connections.push({ id: "c-meta", platform_id: "meta", label: "BM", status: "ativa", last_error: null });
  const acc = (id, client_id, name) => ({ id, platform_id: "meta", external_id: id.slice(-3), client_id, name, currency: "BRL", status: "ativa", connection_id: "c-meta", unlinked_at: null,
    timezone: null, raw_status: null, status_reason: null, business_name: null, is_prepay: null, linked_at: "2026-09-01T12:00:00Z", details_updated_at: null, assets: [] });
  db.adAccounts.push(acc("f0000000-0000-4000-8000-000000004301", CLI, "Conta Que Saiu"), acc("f0000000-0000-4000-8000-000000004302", OUTRO, "Conta Que Fica"));
  db.monitorAlerts.push({ id: 1, client_id: CLI, resolved_at: null, status: "novo", details: {} }, { id: 2, client_id: OUTRO, resolved_at: null, status: "novo", details: {} });
}
const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${CLI}`);
  await page.getByTestId("client-deactivate").waitFor();
  let asked = "";
  page.once("dialog", (d) => { asked = d.message(); d.accept(); });
  await page.getByTestId("client-deactivate").click();
  await page.getByTestId("client-deactivated").waitFor();
  check(asked.includes("Desativar Loja Que Saiu?") && asked.includes("Nada é apagado"), "pede confirmação explicando o que para");
  check(db.clients.find((c) => c.id === CLI).status === "encerrado", "cliente salvo como desativado");
  check(clean(await page.getByText("Desativado", { exact: true }).first().innerText()) === "Desativado", "etiqueta \"Desativado\" na ficha");
  check(db.monitorAlerts[0].resolved_at && db.monitorAlerts[0].details.closed_reason === "cliente_desativado" && !db.monitorAlerts[1].resolved_at,
    "alertas abertos do cliente encerrados (os de outro cliente não)");
  await page.screenshot({ path: `${SHOTS}/cliente-desativado.png`, fullPage: true });

  // Some das escolhas do dia a dia (Dashboard), continua na lista de Clientes
  await page.goto(`${BASE}/`);
  await page.getByLabel("Cliente", { exact: true }).locator("option", { hasText: "Loja Que Fica" }).waitFor({ state: "attached" });
  const options = await page.getByLabel("Cliente", { exact: true }).locator("option").allInnerTexts();
  check(!options.includes("Loja Que Saiu") && options.includes("Loja Que Fica"), `Dashboard: desativado some da escolha de cliente (${options.join(", ")})`);
  const accountOptions = await page.getByLabel("Conta", { exact: true }).locator("option").allInnerTexts().catch(() => []);
  check(!accountOptions.some((o) => o.includes("Conta Que Saiu")), `Dashboard: conta do desativado some da escolha de conta (${accountOptions.join(", ")})`);
  const summaryCall = db.rpcCalls.filter((c) => c.p_from && "p_client_ids" in c).at(-1);
  check(Array.isArray(summaryCall?.p_client_ids) && !summaryCall.p_client_ids.includes(CLI) && summaryCall.p_client_ids.includes(OUTRO),
    "Dashboard em \"Todos os clientes\": os números não somam o cliente desativado");
  await page.goto(`${BASE}/clientes`);
  await page.getByText("Loja Que Fica").first().waitFor();
  check(await page.getByText("Loja Que Saiu").count() === 0, "lista de Clientes (aba Ativo) não mostra o desativado");
  await page.getByRole("tab", { name: /Desativado/ }).click();
  await page.getByText("Loja Que Saiu").first().waitFor();
  check(true, "aba \"Desativado\" da lista de Clientes mostra o desativado");

  // Contas: aba de ativas e aba de desativados
  await page.goto(`${BASE}/contas`);
  await page.getByTestId("health-row").first().waitFor();
  const accNames = () => page.getByTestId("health-row").locator("td:nth-child(3) a").allInnerTexts();
  check(JSON.stringify(await accNames()) === JSON.stringify(["Conta Que Fica"]), `Contas ativas: só a do cliente ativo (${await accNames()})`);
  check(clean(await page.getByRole("tab", { name: /Contas ativas/ }).innerText()) === "Contas ativas (1)" &&
    clean(await page.getByRole("tab", { name: /Clientes desativados/ }).innerText()) === "Clientes desativados (1)", "abas com a contagem certa");
  const sent = [];
  page.on("request", (r) => { if (r.url().includes("/functions/v1/ad-accounts") && r.method() === "POST") sent.push(JSON.parse(r.postData() ?? "{}")); });
  await page.getByRole("button", { name: /Verificar status e saldo/ }).click();
  await page.waitForFunction(() => !document.querySelector("button[aria-busy='true'], button:disabled"), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  const ids = sent.filter((b) => b.action === "refresh_balance").flatMap((b) => b.adAccountIds);
  check(JSON.stringify(ids) === JSON.stringify(["f0000000-0000-4000-8000-000000004302"]), `verificar saldo só pega a conta ativa (${ids.join(", ")})`);
  await page.getByRole("tab", { name: /Clientes desativados/ }).click();
  await page.getByTestId("health-off").first().waitFor();
  check(JSON.stringify(await accNames()) === JSON.stringify(["Conta Que Saiu"]) && await page.getByRole("button", { name: /Verificar status e saldo/ }).count() === 0,
    "aba Clientes desativados: conta do desativado com a etiqueta e sem o botão de verificar");
  await page.screenshot({ path: `${SHOTS}/contas-desativados.png`, fullPage: true });

  // Reativar
  await page.goto(`${BASE}/clientes/${CLI}`);
  await page.getByTestId("client-reactivate").click();
  await page.getByTestId("client-deactivate").waitFor();
  check(db.clients.find((c) => c.id === CLI).status === "ativo" && await page.getByTestId("client-deactivated").count() === 0, "reativar volta ao normal");

  // Excluir: só aparece desativado; nome errado não deixa; nome certo some de tudo
  check(await page.getByTestId("client-exclude").count() === 0, "cliente ativo não tem o botão Excluir");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("client-deactivate").click();
  await page.getByTestId("client-exclude").click();
  await page.getByTestId("client-exclude-name").fill("Loja Errada");
  check(await page.getByTestId("client-exclude-confirm").isDisabled(), "nome errado: botão de excluir fica travado");
  await page.getByTestId("client-exclude-name").fill("loja que saiu");
  await page.screenshot({ path: `${SHOTS}/cliente-excluir.png`, fullPage: true });
  await page.getByTestId("client-exclude-confirm").click();
  await page.waitForFunction(() => location.pathname === "/clientes", null, { timeout: 10000 });
  check(true, "depois de excluir, volta para a lista de Clientes");
  const gone = db.clients.find((c) => c.id === CLI);
  check(gone && gone.excluded_at, "cliente marcado como excluído (os dados continuam no banco)");
  await page.getByRole("tab", { name: /Todos/ }).click();
  await page.getByText("Loja Que Fica").first().waitFor();
  check(await page.getByText("Loja Que Saiu").count() === 0, "excluído some da lista de Clientes (até em Todos)");
  await page.goto(`${BASE}/contas`);
  await page.getByTestId("health-row").first().waitFor();
  check(clean(await page.getByRole("tab", { name: /Clientes desativados/ }).innerText()) === "Clientes desativados (0)", "excluído some também de Contas");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// Gestor: não vê o botão; o servidor recusa
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: CLI, created_at: "" });
  await login(page, `/clientes/${CLI}`);
  await page.getByRole("heading", { name: "Loja Que Saiu" }).waitFor();
  check(await page.getByTestId("client-deactivate").count() === 0, "gestor não vê o botão Desativar");
  const status = await page.evaluate(async (id) => {
    const r = await fetch(`https://dkatllzkmlzpginuzvis.supabase.co/rest/v1/clients?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "encerrado" }) });
    return r.status;
  }, CLI);
  check(status === 403 && db.clients.find((c) => c.id === CLI).status === "ativo", "gestor tentando desativar por fora: recusado");
  const ex = await page.evaluate(async (id) => {
    const r = await fetch("https://dkatllzkmlzpginuzvis.supabase.co/rest/v1/rpc/client_exclude", { method: "POST", body: JSON.stringify({ p_client_id: id, p_name: "Loja Que Saiu" }) });
    return r.status;
  }, CLI);
  check(ex === 403 && !db.clients.find((c) => c.id === CLI).excluded_at, "gestor tentando excluir por fora: recusado");
  check(errors.length === 0, "sem erros no navegador (gestor)");
  await browser.close();
}
console.log("Desativar cliente: tudo certo.");
