/**
 * Teste de navegador — Desativar cliente (23/10/2026).
 * Só admin vê o botão; desativar pede confirmação, mostra o aviso, encerra os alertas abertos do cliente e tira o
 * cliente das escolhas do dia a dia; reativar volta. Quem não é admin não vê o botão e o servidor recusa.
 * Supabase SIMULADO (support.mjs).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004201";
const OUTRO = "e0000000-0000-4000-8000-000000004202";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Loja Que Saiu"), client(OUTRO, "Loja Que Fica"));
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
  await page.goto(`${BASE}/clientes`);
  await page.getByText("Loja Que Fica").first().waitFor();
  check(await page.getByText("Loja Que Saiu").count() === 0, "lista de Clientes (aba Ativo) não mostra o desativado");
  await page.getByRole("tab", { name: /Desativado/ }).click();
  await page.getByText("Loja Que Saiu").first().waitFor();
  check(true, "aba \"Desativado\" da lista de Clientes mostra o desativado");

  // Reativar
  await page.goto(`${BASE}/clientes/${CLI}`);
  await page.getByTestId("client-reactivate").click();
  await page.getByTestId("client-deactivate").waitFor();
  check(db.clients.find((c) => c.id === CLI).status === "ativo" && await page.getByTestId("client-deactivated").count() === 0, "reativar volta ao normal");
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
  check(errors.length === 0, "sem erros no navegador (gestor)");
  await browser.close();
}
console.log("Desativar cliente: tudo certo.");
