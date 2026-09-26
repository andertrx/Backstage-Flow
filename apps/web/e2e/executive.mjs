/**
 * Teste de navegador da Etapa 29 — Dashboard executivo.
 * Supabase SIMULADO (support.mjs). Datas relativas a "hoje" em São Paulo.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const EXC = "e0000000-0000-4000-8000-000000000001";
const CLI = "e0000000-0000-4000-8000-000000000002";
const LOJA = "e0000000-0000-4000-8000-000000000003";
const EXC_META = "a0000000-0000-4000-8000-000000000701";
const EXC_GOOGLE = "a0000000-0000-4000-8000-000000000702";
const CLI_META = "a0000000-0000-4000-8000-000000000703";
const LOJA_US = "a0000000-0000-4000-8000-000000000704";
const M = 1_000_000;

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(CLI, "Clínica Bem-Estar"), client(LOJA, "Loja Internacional"));
  const account = (id, platform_id, external_id, client_id, name, currency) => ({ id, platform_id, external_id, client_id, name, currency, unlinked_at: null });
  db.adAccounts.push(
    account(EXC_META, "meta", "711", EXC, "Excalibur Meta", "BRL"),
    account(EXC_GOOGLE, "google", "7112223334", EXC, "Excalibur Google", "BRL"),
    account(CLI_META, "meta", "713", CLI, "Clínica Meta", "BRL"),
    account(LOJA_US, "google", "7445556667", LOJA, "Loja US", "USD"),
  );
  const row = (date, ad_account_id, v) => {
    const acc = db.adAccounts.find((a) => a.id === ad_account_id);
    return { date, ad_account_id, level: "account", campaign_id: null, client_id: acc.client_id, platform_id: acc.platform_id, currency: acc.currency,
      spend_micros: 0, impressions: 0, clicks: 0, link_clicks: null, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...v };
  };
  db.metrics.push(
    row(day(-1), EXC_META, { spend_micros: 100 * M, leads: 10, messages: 5, conversions: 5, conversion_value_micros: 400 * M }),
    row(day(-2), EXC_META, { spend_micros: 200 * M, leads: 20, messages: 0, conversions: 10, conversion_value_micros: 500 * M }),
    // Google não informa leads nem mensagens (null): só conversões.
    row(day(-1), EXC_GOOGLE, { spend_micros: 50 * M, conversions: 5, conversion_value_micros: 100 * M }),
    row(day(-1), CLI_META, { spend_micros: 150 * M, leads: 15, messages: 5, conversions: 0, conversion_value_micros: 0 }),
    // Conta em dólar: nunca entra na soma em reais.
    row(day(-1), LOJA_US, { spend_micros: 70 * M, conversions: 7, conversion_value_micros: 700 * M }),
    // Período anterior (comparação)
    row(day(-9), EXC_META, { spend_micros: 200 * M, leads: 10, messages: 0, conversions: 5, conversion_value_micros: 200 * M }),
  );
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const chainValue = async (page, label) => clean(await page.getByTestId("executive-chain").getByRole("group", { name: label, exact: true }).locator("[data-testid=kpi-value], [data-testid=kpi-missing]").innerText());
/** Espera (até 5 s) um passo da cadeia mostrar o valor esperado. */
async function waitChain(page, label, expected) {
  let last = "";
  for (let i = 0; i < 50; i++) {
    try { last = await chainValue(page, label); } catch { last = ""; }
    if (last === expected) return true;
    await page.waitForTimeout(100);
  }
  console.log(`  (${label}: "${last}")`);
  return false;
}
const tableRows = async (page, testId) => (await page.getByTestId(testId).locator("tbody tr").allInnerTexts()).map(clean);

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
seed(db);
await login(page, "/");
await page.getByRole("heading", { name: /Olá/ }).waitFor();

// 1) Acesso pelo Dashboard, mantendo os filtros
await page.getByRole("link", { name: "Visão executiva" }).click();
await page.waitForURL("**/executivo**");
await page.getByRole("heading", { name: "Visão executiva", level: 1 }).waitFor();
check(true, "Dashboard → Visão executiva");
check(clean(await page.getByTestId("executive-scope").innerText()) === "Todos os clientes · Meta + Google", "consolidado: todos os clientes · Meta + Google");

// 2) A cadeia na ordem pedida
const labels = await page.getByTestId("executive-chain").getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
check(JSON.stringify(labels) === JSON.stringify(["Investimento total", "Resultados", "Custo por resultado", "Conversões", "ROAS"]), `cadeia na ordem: ${labels.join(" → ")}`);

// 3) Consolidado em reais (sem o dólar)
check(await waitChain(page, "Investimento total", "R$ 500,00"), "investimento total R$ 500,00 (sem somar USD)");
check(await waitChain(page, "Resultados", "75"), "resultados = leads + mensagens + conversões (75)");
check(await waitChain(page, "Custo por resultado", "R$ 6,67"), "custo por resultado R$ 6,67");
check(await waitChain(page, "Conversões", "20"), "conversões 20");
check(await waitChain(page, "ROAS", "2,00x"), "ROAS 2,00x");
check(await page.getByRole("tab", { name: "USD" }).count() === 1, "moeda em dólar aparece em aba separada");
const inv = clean(await page.getByTestId("executive-chain").getByRole("group", { name: "Investimento total", exact: true }).innerText());
check(inv.includes("antes: R$ 200,00"), "compara com o período anterior");
await page.screenshot({ path: `${SHOTS}/290-executivo-consolidado.png`, fullPage: true });

// 4) Por plataforma e por cliente
const platforms = await tableRows(page, "executive-platforms");
check(platforms.length === 2 && platforms[0].startsWith("Meta Ads R$ 450,00") && platforms[1].startsWith("Google Ads R$ 50,00"), `por plataforma: ${platforms.join(" | ")}`);
const clientsRows = await tableRows(page, "executive-clients");
check(clientsRows.length === 2 && clientsRows[0].startsWith("Excalibur Fitness R$ 350,00") && clientsRows[1].startsWith("Clínica Bem-Estar R$ 150,00"), `por cliente (BRL): ${clientsRows.join(" | ")}`);
check(!clientsRows.some((r) => r.includes("Loja Internacional")), "cliente em dólar não aparece na lista em reais");
check(clientsRows[0].includes("70,00%"), "parte do investimento (70%)");
check(clientsRows[1].includes("—") && !clientsRows[1].includes("0,00x"), "sem valor de conversão: ROAS mostra — (não 0,00x)");

// 5) Visão individual de um cliente
await page.getByTestId("executive-clients").getByRole("button", { name: /Ver individual: Excalibur Fitness/ }).click();
check(await waitChain(page, "Investimento total", "R$ 350,00"), "individual: investimento do cliente");
check(await waitChain(page, "Resultados", "55"), "individual: resultados do cliente");
check(await waitChain(page, "ROAS", "2,86x"), "individual: ROAS do cliente");
check(clean(await page.getByTestId("executive-scope").innerText()) === "Excalibur Fitness · Meta + Google", "escopo mostra o cliente escolhido");
check(new URL(page.url()).searchParams.get("cliente") === EXC, "cliente escolhido fica no endereço (dá para compartilhar)");

// 6) Individual por plataforma (Google): só conversões, porque o Google não informa leads
await page.getByTestId("executive-platforms").getByRole("button", { name: /Ver individual: Google Ads/ }).click();
check(await waitChain(page, "Investimento total", "R$ 50,00"), "Excalibur + Google: investimento");
check(await waitChain(page, "Resultados", "5"), "Google: resultados = conversões");
check(await waitChain(page, "Custo por resultado", "R$ 10,00"), "Google: custo por resultado");

// 7) Voltar ao consolidado
await page.getByRole("button", { name: "Ver consolidado" }).click();
check(await waitChain(page, "Investimento total", "R$ 500,00"), "Ver consolidado volta ao total");

// 8) Aba em dólar
await page.getByRole("tab", { name: "USD" }).click();
check(await waitChain(page, "Investimento total", "US$ 70,00"), "aba USD: só a conta em dólar");
check(await waitChain(page, "ROAS", "10,00x"), "aba USD: ROAS 10,00x");
const usClients = await tableRows(page, "executive-clients");
check(usClients.length === 1 && usClients[0].startsWith("Loja Internacional"), "aba USD: só o cliente em dólar");

// 9) Celular: sem rolagem lateral da página
await page.getByRole("tab", { name: "BRL" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow <= 0, `celular: sem rolagem lateral (${overflow}px)`);
await page.screenshot({ path: `${SHOTS}/291-executivo-celular.png`, fullPage: true });

check(errors.length === 0, "nenhum erro no navegador: " + errors.join(" | "));
await browser.close();
console.log("\nTodos os testes do dashboard executivo passaram.");
