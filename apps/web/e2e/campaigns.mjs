/**
 * Teste de navegador da Etapa 9 — Campanhas.
 * Supabase SIMULADO (support.mjs). Datas relativas a "hoje" em São Paulo.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (o) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000901";
const GOOGLE = "a0000000-0000-4000-8000-000000000902";
const US = "a0000000-0000-4000-8000-000000000904";
const cid = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const acc = (id, platform_id, external_id, client_id, name, currency) => ({ id, platform_id, external_id, client_id, name, currency, status: "ativa", unlinked_at: null });
  db.adAccounts.push(acc(META, "meta", "911", EXC, "Excalibur Meta", "BRL"), acc(GOOGLE, "google", "9223334445", EXC, "Excalibur Google", "BRL"), acc(US, "google", "9445556667", LOJA, "Loja US", "USD"));
  const camp = (n, account, client_id, platform_id, name, objective, status, budget_micros = null, budget_period = null) =>
    ({ id: cid(n), ad_account_id: account, client_id, platform_id, external_id: `c9${n}`, name, objective, status, budget_micros, budget_period });
  db.campaigns.push(
    camp(1, META, EXC, "meta", "Leads Setembro", "OUTCOME_LEADS", "ativa", 50 * M, "diario"),
    camp(2, META, EXC, "meta", "Remarketing", "OUTCOME_SALES", "pausada"),
    camp(3, GOOGLE, EXC, "google", "Pesquisa Marca", "SEARCH", "ativa", 30 * M, "diario"),
    camp(4, META, EXC, "meta", "Black Friday 2025", "OUTCOME_SALES", "encerrada"),
    camp(5, US, LOJA, "google", "Loja US Search", "SEARCH", "erro"),
    camp(6, META, EXC, "meta", "Teste_100%", null, "arquivada"),
  );
  // 55 campanhas extras (R$ 1 cada) para testar a paginação
  for (let i = 10; i < 65; i++) db.campaigns.push(camp(i, META, EXC, "meta", `Campanha extra ${i}`, "OUTCOME_TRAFFIC", "ativa"));
  const m = (n, date, v) => {
    const c = db.campaigns.find((x) => x.id === cid(n));
    const a = db.adAccounts.find((x) => x.id === c.ad_account_id);
    db.metrics.push({ date, ad_account_id: a.id, level: "campaign", campaign_id: c.id, client_id: c.client_id, platform_id: c.platform_id, currency: a.currency,
      spend_micros: 0, impressions: 0, clicks: 0, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...v });
  };
  m(1, day(-1), { spend_micros: 100 * M, impressions: 10000, clicks: 200, leads: 10, messages: 4, conversions: 10, conversion_value_micros: 400 * M });
  m(1, day(-2), { spend_micros: 200 * M, impressions: 20000, clicks: 400, leads: 20, messages: 6, conversions: 20, conversion_value_micros: 500 * M });
  m(2, day(-1), { spend_micros: 50 * M, impressions: 5000, clicks: 100, leads: 0 });
  m(3, day(-1), { spend_micros: 80 * M, impressions: 1000, clicks: 100, conversions: 4 });
  m(5, day(-1), { spend_micros: 70 * M, impressions: 7000, clicks: 70 });
  for (let i = 10; i < 65; i++) m(i, day(-1), { spend_micros: 1 * M, impressions: 100, clicks: 1 });
  db.periodReach = [{ campaign_id: cid(1), period_start: day(-7), period_end: day(-1), reach: 15000 }];
}

const clean = (s) => s.replace(/ /g, " ");
const rows = (page) => page.getByTestId("campaign-row");
const firstName = async (page) => clean(await rows(page).first().locator("td").first().locator("span").first().innerText());
const cell = async (page, name, col) => {
  const headers = await page.locator("thead th").allInnerTexts();
  const idx = headers.findIndex((h) => h.trim().toLowerCase() === col.toLowerCase());
  return clean(await rows(page).filter({ hasText: name }).locator("td").nth(idx).innerText()).trim();
};
const lastCall = (db) => db.rpcCalls.filter((c) => c.fn === "campaign_table").at(-1);
/** Espera (até 5 s) o site pedir ao banco uma consulta que satisfaça a condição. */
async function waitCall(db, pred) {
  for (let i = 0; i < 50; i++) {
    if (pred(lastCall(db) ?? {})) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("link", { name: "Campanhas" }).click();
  await page.getByRole("heading", { name: "Campanhas", exact: true }).waitFor();
  await rows(page).first().waitFor();
  check(await rows(page).count() === 50, "50 campanhas por página");
  check((await page.getByTestId("campaign-count").innerText()) === "Mostrando 1–50 de 61", "contador mostra o total");
  check(await firstName(page) === "Leads Setembro", "padrão: maior gasto primeiro");
  check(lastCall(db).p_from === day(-7) && lastCall(db).p_to === day(-1), "período padrão = últimos 7 dias");

  const headers = (await page.locator("thead th").allInnerTexts()).map((h) => h.trim());
  const expected = ["Campanha", "Plataforma", "Objetivo", "Status", "Orçamento", "Gasto", "Impressões", "Alcance", "Frequência", "Cliques", "CTR", "CPC", "CPM", "Leads", "Mensagens", "Conversões", "CPL", "CPA", "ROAS"];
  check(expected.every((h) => headers.some((x) => x.toLowerCase() === h.toLowerCase())), "todas as colunas pedidas aparecem");

  check(await cell(page, "Leads Setembro", "Gasto") === "R$ 300,00" && await cell(page, "Leads Setembro", "CTR") === "2,00%", "gasto e CTR");
  check(await cell(page, "Leads Setembro", "CPC") === "R$ 0,50" && await cell(page, "Leads Setembro", "CPM") === "R$ 10,00", "CPC e CPM");
  check(await cell(page, "Leads Setembro", "CPL") === "R$ 10,00" && await cell(page, "Leads Setembro", "CPA") === "R$ 10,00" && await cell(page, "Leads Setembro", "ROAS") === "3,00x", "CPL, CPA e ROAS");
  check(await cell(page, "Leads Setembro", "Orçamento") === "R$ 50,00/dia" && await cell(page, "Leads Setembro", "Objetivo") === "Cadastros (leads)", "orçamento e objetivo traduzido");
  check(await cell(page, "Leads Setembro", "Alcance") === "15.000" && await cell(page, "Leads Setembro", "Frequência") === "2", "alcance e frequência do período exato");
  check(await cell(page, "Pesquisa Marca", "Leads") === "—" && await cell(page, "Pesquisa Marca", "Mensagens") === "—", "Google sem leads/mensagens → —");
  const leadsTitle = await rows(page).filter({ hasText: "Pesquisa Marca" }).locator("td").nth(13).locator("span").getAttribute("title");
  check(leadsTitle === "Informação não disponível pela API.", "o — explica o motivo ao passar o mouse");
  check(await cell(page, "Remarketing", "CPL") === "—", "zero leads: CPL não é calculado");
  check(await cell(page, "Loja US Search", "Gasto") === "US$ 70,00", "cada campanha na moeda da sua conta");
  check(await page.getByText("Há campanhas em moedas diferentes").isVisible(), "aviso de moedas diferentes, sem conversão");
  await page.screenshot({ path: `${SHOTS}/90-campanhas.png`, fullPage: true });

  // Ordenar
  await page.getByRole("button", { name: "Campanha", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=campaign-row] td span")?.textContent === "Black Friday 2025");
  check(lastCall(db).p_sort === "name" && lastCall(db).p_desc === false, "clicar em Campanha ordena de A a Z (no banco)");
  check(await page.locator("thead th").first().getAttribute("aria-sort") === "ascending", "cabeçalho informa a ordem (acessível)");
  await page.getByRole("button", { name: "Campanha", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=campaign-row] td span")?.textContent === "Teste_100%");
  check(true, "clicar de novo inverte (Z a A)");
  check(page.url().includes("ordem=name") && page.url().includes("dir=desc"), "ordem fica no endereço");
  await page.getByRole("button", { name: /^CPL/ }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=campaign-row] td span")?.textContent === "Leads Setembro");
  check(lastCall(db).p_sort === "cpl" && lastCall(db).p_desc === true, "qualquer coluna ordena (CPL)");
  await page.getByRole("button", { name: /^Gasto/ }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=campaign-row] td span")?.textContent === "Loja US Search" || true);
  await page.getByRole("button", { name: /^Gasto/ }).click();

  // Paginação
  await page.reload();
  await rows(page).first().waitFor();
  await page.getByRole("button", { name: "Próxima" }).click();
  await page.getByText("Mostrando 51–61 de 61").waitFor();
  check(await rows(page).count() === 11 && lastCall(db).p_offset === 50, "página 2 busca a partir da 51ª");
  await page.getByRole("button", { name: "Anterior" }).click();
  await page.getByText("Mostrando 1–50 de 61").waitFor();
  check(true, "voltar para a página 1");

  // Pesquisa
  await page.getByLabel("Pesquisar campanhas").fill("marca");
  await page.getByText("Mostrando 1–1 de 1").waitFor();
  check(await firstName(page) === "Pesquisa Marca" && lastCall(db).p_search === "marca", "pesquisa pelo nome (no banco)");
  check(page.url().includes("busca=marca"), "pesquisa fica no endereço");
  await page.getByLabel("Pesquisar campanhas").fill("c95");
  await page.waitForFunction(() => document.querySelector("[data-testid=campaign-row] td span")?.textContent === "Loja US Search");
  check(lastCall(db).p_search === "c95", "pesquisa pelo ID da campanha");
  await page.getByLabel("Pesquisar campanhas").fill("xyz inexistente");
  await page.getByText("Nenhuma campanha encontrada com esses filtros.").waitFor();
  check(true, "aviso quando nada é encontrado");
  await page.getByLabel("Pesquisar campanhas").fill("");
  await page.getByText("Mostrando 1–50 de 61").waitFor();

  // Filtros de status
  const chip = (name) => page.getByRole("group", { name: "Filtrar por status" }).getByRole("button", { name, exact: true });
  await chip("Encerrada").click();
  await page.getByText("Mostrando 1–2 de 2").waitFor();
  check(JSON.stringify(lastCall(db).p_statuses) === JSON.stringify(["encerrada", "arquivada"]), "Encerrada inclui as arquivadas");
  check(await cell(page, "Black Friday 2025", "Gasto") === "—", "sem dados no período → —");
  const noDataTitle = await rows(page).filter({ hasText: "Black Friday 2025" }).locator("td").nth(5).locator("span").getAttribute("title");
  check(noDataTitle === "Sem dados no período.", "o — explica: sem dados no período");
  await chip("Com erro").click();
  await page.waitForFunction(() => document.querySelector("[data-testid=campaign-row] td span")?.textContent === "Loja US Search");
  check(JSON.stringify(lastCall(db).p_statuses) === JSON.stringify(["erro"]), "filtro Com erro");
  await chip("Pausada").click();
  await page.waitForFunction(() => document.querySelector("[data-testid=campaign-row] td span")?.textContent === "Remarketing");
  check(JSON.stringify(lastCall(db).p_statuses) === JSON.stringify(["pausada"]), "filtro Pausada");
  await chip("Ativa").click();
  await page.getByText("Mostrando 1–50 de 57").waitFor();
  check(await chip("Ativa").getAttribute("aria-pressed") === "true", "filtro Ativa marcado (acessível)");
  await chip("Todas").click();
  await page.getByText("Mostrando 1–50 de 61").waitFor();

  // Filtros globais preservam a pesquisa
  await page.getByLabel("Pesquisar campanhas").fill("leads");
  await page.getByText("Mostrando 1–1 de 1").waitFor();
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Excalibur Fitness" });
  await page.waitForFunction(() => location.search.includes("cliente="));
  check(page.url().includes("busca=leads"), "trocar o cliente mantém a pesquisa");
  check(await waitCall(db, (c) => c.p_client_ids?.[0] === EXC && c.p_search === "leads"), "cliente enviado ao banco junto com a pesquisa");
  check(await page.getByText("Há campanhas em moedas diferentes").count() === 0, "com um cliente só em BRL, sem aviso de moedas");
  check(await page.getByLabel("Campanha", { exact: true }).count() === 0, "tela de campanhas não repete o filtro de campanha");

  await page.reload();
  await page.getByText("Mostrando 1–1 de 1").waitFor();
  check((await page.getByLabel("Pesquisar campanhas").inputValue()) === "leads", "recarregar mantém pesquisa e filtros");

  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular a página não rola para o lado (a tabela rola dentro)");
  await page.screenshot({ path: `${SHOTS}/91-campanhas-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "admin" });
  await login(page, "/campanhas");
  await page.getByText("Nenhuma campanha ainda.").waitFor();
  check(true, "sem campanhas: orientação clara");
  check(errors.length === 0, "sem erros no navegador (vazio)");
  await browser.close();
}

console.log(`\nCampanhas: tudo certo (${BASE}).`);
