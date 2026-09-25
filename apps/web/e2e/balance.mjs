/**
 * Teste de navegador da Etapa 7 — Verificação de saldo.
 * Supabase SIMULADO (support.mjs): a "API" de saldo devolve valores prontos.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000701";
const GOOGLE = "a0000000-0000-4000-8000-000000000702";
const US = "a0000000-0000-4000-8000-000000000704";

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const account = (id, platform_id, external_id, client_id, name, currency, status = "ativa") => ({ id, platform_id, external_id, client_id, name, currency, status, unlinked_at: null });
  db.adAccounts.push(
    account(META, "meta", "711", EXC, "Excalibur Meta", "BRL"),
    account(GOOGLE, "google", "7223334445", EXC, "Excalibur Google", "BRL"),
    account(US, "google", "7445556667", LOJA, "Loja US", "USD", "pagamento_pendente"),
  );
  // Gasto da conta Meta: R$ 100 por dia nos 2 últimos dias → média R$ 100/dia
  for (const d of [-1, -2]) {
    db.metrics.push({ date: day(d), ad_account_id: META, level: "account", campaign_id: null, client_id: EXC, platform_id: "meta", currency: "BRL", spend_micros: 100 * M, impressions: 0, clicks: 0 });
  }
  db.snapshots[GOOGLE] = {
    captured_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), available_micros: 1800 * M, available_basis: "google_account_budget",
    budget_micros: 5000 * M, spend_cap_micros: 4800 * M, amount_spent_micros: 3000 * M, budget_end_at: "2027-01-01T02:59:59Z", issues: [],
  };
  db.snapshots[US] = { captured_at: new Date().toISOString(), currency: "USD", issues: ["pagamento_pendente"] };
  // O que a "API do Meta" devolve ao atualizar: limite R$ 1.000, gasto R$ 750 → disponível R$ 250
  db.fundingApi[META] = {
    available_micros: 250 * M, available_basis: "meta_spend_cap", spend_cap_micros: 1000 * M, amount_spent_micros: 750 * M,
    amount_due_micros: 15 * M, funding_description: "Visa final 1234", issues: [],
  };
  db.fundingApi[GOOGLE] = db.snapshots[GOOGLE];
  db.fundingErrors[US] = "O Google pediu uma pausa nas consultas. Tente novamente em alguns minutos.";
}

const clean = (s) => s.replace(/ /g, " ");
const card = (page, name) => page.getByRole("group", { name: `Saldo ${name}`, exact: true });
const text = async (locator) => clean(await locator.innerText());

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: "Saldo por conta" }).waitFor();
  await card(page, "Excalibur Meta").waitFor();
  check(await page.getByRole("group", { name: /^Saldo / }).count() === 3, "uma ficha de saldo por conta");

  const kpi = page.getByRole("group", { name: "Saldo", exact: true });
  await kpi.getByText("R$ 1.800,00").waitFor();
  check((await text(kpi)).includes("1 de 2 contas informam"), "cartão Saldo soma só contas que informam (BRL, sem somar USD)");
  check((await text(kpi)).includes("1 conta com alerta"), "cartão Saldo conta alertas");

  check((await text(card(page, "Excalibur Meta"))).includes("Saldo ainda não verificado"), "conta nunca verificada: sem valores inventados");

  const google = await text(card(page, "Excalibur Google"));
  check(google.includes("R$ 1.800,00") && google.includes("R$ 5.000,00") && google.includes("R$ 4.800,00") && google.includes("R$ 3.000,00"),
    "Google: disponível, orçamento, limite e valor gasto");
  check(google.includes("Crédito disponível") && google.includes("Informação não disponível pela API."), "crédito disponível: não disponível pela API");
  check(google.includes("há mais de 24 horas"), "avisa quando a verificação é antiga");
  check(google.includes("Sem gasto recente para calcular."), "sem gasto recente: não prevê duração");
  check(!google.includes("Forma de pagamento"), "Google não mostra campos exclusivos do Meta");

  check((await text(card(page, "Loja US"))).includes("Pagamento pendente"), "alerta de pagamento pendente");

  // Atualizar uma conta
  await card(page, "Excalibur Meta").getByRole("button", { name: "Atualizar saldo" }).click();
  await page.getByText("Saldo atualizado.").waitFor();
  const meta = await text(card(page, "Excalibur Meta"));
  check(db.adAccountCalls.at(-1).action === "refresh_balance" && db.adAccountCalls.at(-1).adAccountIds[0] === META, "atualizar pede o saldo ao servidor");
  check(meta.includes("R$ 250,00") && meta.includes("R$ 1.000,00") && meta.includes("R$ 750,00"), "Meta: disponível = limite − gasto");
  check(meta.includes("Visa final 1234") && meta.includes("R$ 15,00"), "Meta: forma de pagamento (texto do Meta) e valor devido");
  check(meta.includes("R$ 100,00") && meta.includes("cerca de 2 dias"), "gasto médio e previsão de duração");
  check(meta.includes("Saldo baixo"), "previsão abaixo de 3 dias → alerta de saldo baixo");
  await kpi.getByText("R$ 2.050,00").waitFor();
  check((await text(kpi)).includes("2 de 2 contas informam") && (await text(kpi)).includes("2 contas com alerta"), "cartão Saldo atualiza junto");

  await page.getByRole("button", { name: "O que é Saldo?" }).hover();
  await page.getByRole("tooltip").filter({ hasText: "não inventamos valores" }).waitFor();
  check(true, "tooltip do Saldo explica a regra");
  await page.screenshot({ path: `${SHOTS}/70-saldo.png`, fullPage: true });

  // Alerta de saldo baixo configurável
  await page.getByRole("button", { name: "Alerta de saldo baixo de Excalibur Meta" }).click();
  const modal = page.getByRole("dialog", { name: "Alerta de saldo baixo" });
  await modal.getByLabel(/durar menos de/).fill("99");
  await modal.getByRole("button", { name: "Salvar" }).click();
  await modal.getByText("Informe de 1 a 60 dias.").waitFor();
  check(true, "valida o número de dias");
  await modal.getByLabel(/durar menos de/).fill("2");
  await modal.getByRole("button", { name: "Salvar" }).click();
  await modal.waitFor({ state: "detached" });
  await card(page, "Excalibur Meta").getByText("Saldo baixo", { exact: true }).waitFor({ state: "detached" });
  check(true, "com limite de 2 dias, 2,5 dias de saldo não gera alerta");

  await page.getByRole("button", { name: "Alerta de saldo baixo de Excalibur Meta" }).click();
  await modal.getByLabel(/disponível for até/).fill("300,00");
  await modal.getByRole("button", { name: "Salvar" }).click();
  await card(page, "Excalibur Meta").getByText("Saldo baixo", { exact: true }).waitFor();
  check(db.adAccountCalls.at(-1).lowBalanceAmount === 300 && db.adAccountCalls.at(-1).lowBalanceDays === 2, "alerta por valor mínimo (R$ 300) salvo no servidor");

  // Atualizar todos: uma falha não impede as outras e aparece com o nome da conta
  await page.getByRole("button", { name: "Atualizar todos os saldos" }).click();
  await page.getByText("Loja US:").waitFor();
  check((await page.getByRole("alert").innerText()).includes("pediu uma pausa"), "erro de uma conta aparece com o motivo, sem esconder as outras");
  check(db.adAccountCalls.at(-1).adAccountIds.length === 3, "atualiza todas as contas do filtro");

  // Filtro de cliente vale para o saldo
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Loja Internacional" });
  await page.waitForFunction(() => document.querySelectorAll('[role=group][aria-label^="Saldo "]').length === 1);
  check(await card(page, "Loja US").isVisible(), "filtro de cliente vale para o saldo");
  await page.getByLabel("Cliente", { exact: true }).selectOption("");

  await page.setViewportSize({ width: 390, height: 844 });
  // Espera a página se ajustar ao tamanho novo antes de medir.
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular não há rolagem para o lado");
  // O gráfico se redesenha na largura nova (nada do desenho fica para fora da tela).
  const fits = await page.waitForFunction(() => [...document.querySelectorAll("svg[role=img] *")].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 1), null, { timeout: 3000 }).then(() => true, () => false);
  check(fits, "no celular o gráfico se redesenha na largura da tela");
  await page.screenshot({ path: `${SHOTS}/71-saldo-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ------------------------------------------------------------ visualizador: só vê
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/");
  await card(page, "Excalibur Google").waitFor();
  check(await page.getByRole("button", { name: /Atualizar/ }).count() === 0, "visualizador não vê botões de atualizar");
  check(await page.getByRole("button", { name: /Alerta de saldo baixo/ }).count() === 0, "visualizador não altera alertas");
  check(errors.length === 0, "sem erros no navegador (visualizador)");
  await browser.close();
}

console.log(`\nSaldo: tudo certo (${BASE}).`);
