/**
 * Teste de navegador da Etapa 6 — Dashboard principal (cards + filtros globais).
 * Supabase SIMULADO (support.mjs). As datas são relativas a "hoje" em São Paulo.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000601";
const GOOGLE = "a0000000-0000-4000-8000-000000000602";
const US = "a0000000-0000-4000-8000-000000000604";
const LEADS = "d0000000-0000-4000-8000-000000000001";
const REMKT = "d0000000-0000-4000-8000-000000000002";
const M = 1_000_000;

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const account = (id, platform_id, external_id, client_id, name, currency) => ({ id, platform_id, external_id, client_id, name, currency, unlinked_at: null });
  db.adAccounts.push(
    account(META, "meta", "611", EXC, "Excalibur Meta", "BRL"),
    account(GOOGLE, "google", "6223334445", EXC, "Excalibur Google", "BRL"),
    account(US, "google", "6445556667", LOJA, "Loja US", "USD"),
  );
  db.campaigns.push(
    { id: LEADS, name: "Leads", ad_account_id: META, client_id: EXC, platform_id: "meta", status: "ativa" },
    { id: REMKT, name: "Remarketing", ad_account_id: META, client_id: EXC, platform_id: "meta", status: "pausada" },
  );
  const row = (date, ad_account_id, level, v, campaign_id = null) => {
    const acc = db.adAccounts.find((a) => a.id === ad_account_id);
    return { date, ad_account_id, level, campaign_id, client_id: acc.client_id, platform_id: acc.platform_id, currency: acc.currency,
      spend_micros: 0, impressions: 0, clicks: 0, link_clicks: null, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...v };
  };
  db.metrics.push(
    // Últimos 7 dias (BRL): R$ 350 · 35.000 impr. · 700 cliques · 30 leads · 10 mensagens · 35 conversões · R$ 900 em valor
    row(day(-1), META, "account", { spend_micros: 100 * M, impressions: 10000, clicks: 200, leads: 10, messages: 4, conversions: 10, conversion_value_micros: 400 * M }),
    row(day(-2), META, "account", { spend_micros: 200 * M, impressions: 20000, clicks: 400, leads: 20, messages: 6, conversions: 20, conversion_value_micros: 500 * M }),
    row(day(-1), GOOGLE, "account", { spend_micros: 50 * M, impressions: 5000, clicks: 100, conversions: 5 }),
    row(day(-1), US, "account", { spend_micros: 70 * M, impressions: 7000, clicks: 70 }),
    // 7 dias anteriores (BRL): R$ 300 · 20 leads · 750 cliques
    row(day(-9), META, "account", { spend_micros: 280 * M, impressions: 40000, clicks: 700, leads: 20, messages: 10, conversions: 20, conversion_value_micros: 1000 * M }),
    row(day(-9), GOOGLE, "account", { spend_micros: 20 * M, impressions: 1000, clicks: 50, conversions: 5 }),
    // Nível campanha: Leads (ativa) R$ 250, Remarketing (pausada) R$ 50
    row(day(-1), META, "campaign", { spend_micros: 80 * M, impressions: 8000, clicks: 160, leads: 9 }, LEADS),
    row(day(-2), META, "campaign", { spend_micros: 170 * M, impressions: 17000, clicks: 350, leads: 19 }, LEADS),
    row(day(-1), META, "campaign", { spend_micros: 20 * M, impressions: 2000, clicks: 40, leads: 1 }, REMKT),
    row(day(-2), META, "campaign", { spend_micros: 30 * M, impressions: 3000, clicks: 50, leads: 1 }, REMKT),
  );
}

const clean = (s) => s.replace(/ /g, " ");
const cardText = async (page, name) => clean(await page.getByRole("group", { name, exact: true }).innerText());
const value = async (page, name) => clean(await page.getByRole("group", { name, exact: true }).getByTestId(/kpi-value|kpi-missing/).innerText());
const waitValue = async (page, name, expected) => {
  await page.getByRole("group", { name, exact: true }).getByText(expected, { exact: true }).waitFor();
};

// ------------------------------------------------------------ com dados
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: "Resumo geral" }).waitFor();
  await waitValue(page, "Investimento", "R$ 350,00");
  check(true, "investimento dos últimos 7 dias (BRL, nível conta) = R$ 350,00");
  check(db.rpcCalls[0].p_from === day(-7) && db.rpcCalls[0].p_to === day(-1), "padrão = últimos 7 dias, sem incluir hoje");
  check(db.rpcCalls.some((c) => c.p_from === day(-14) && c.p_to === day(-8)), "compara com os 7 dias anteriores");

  check(await value(page, "Leads") === "30" && await value(page, "Mensagens") === "10" && await value(page, "Conversões") === "35", "leads, mensagens e conversões");
  check(await value(page, "CPL") === "R$ 11,67" && await value(page, "CPC") === "R$ 0,50" && await value(page, "CPM") === "R$ 10,00", "CPL, CPC e CPM calculados");
  check(await value(page, "CTR") === "2,00%" && await value(page, "ROAS") === "2,57x", "CTR e ROAS calculados");

  const leads = page.getByRole("group", { name: "Leads", exact: true });
  check(clean(await leads.innerText()).includes("+50,0%") && await leads.locator("[data-tone=good]").count() === 1, "leads subiram 50% → indicador verde");
  const cpc = page.getByRole("group", { name: "CPC", exact: true });
  check(clean(await cpc.innerText()).includes("+25,0%") && await cpc.locator("[data-tone=bad]").count() === 1, "CPC subiu 25% → indicador vermelho (custo)");
  const cpl = page.getByRole("group", { name: "CPL", exact: true });
  check(clean(await cpl.innerText()).includes("−22,2%") && await cpl.locator("[data-tone=good]").count() === 1, "CPL caiu → indicador verde");
  check((await cardText(page, "Investimento")).includes("antes: R$ 300,00"), "mostra o valor do período anterior");
  check((await value(page, "Saldo")) === "Informação não disponível pela API.", "card de saldo sem verificação: não inventa valor");

  await page.getByRole("button", { name: "O que é CPL?" }).hover();
  await page.getByRole("tooltip").filter({ hasText: "Custo por lead" }).waitFor();
  check(true, "tooltip explica a métrica ao passar o mouse");
  await page.getByRole("button", { name: "O que é CTR?" }).focus();
  await page.getByRole("tooltip").filter({ hasText: "Taxa de cliques" }).waitFor();
  check(true, "tooltip também abre pelo teclado");
  await page.keyboard.press("Escape");

  check(await page.getByRole("tab", { name: "USD" }).isVisible(), "contas em USD ficam em aba separada (sem somar com BRL)");
  await page.screenshot({ path: `${SHOTS}/60-dashboard.png`, fullPage: true });
  await page.getByRole("tab", { name: "USD" }).click();
  await waitValue(page, "Investimento", "US$ 70,00");
  check(await value(page, "Leads") === "Informação não disponível pela API.", "USD: leads não informados → não disponível (não vira 0)");
  check(page.url().includes("moeda=USD"), "moeda escolhida fica no endereço");

  // Cliente
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Excalibur Fitness" });
  await waitValue(page, "Investimento", "R$ 350,00");
  check(!(await page.getByRole("tab", { name: "USD" }).count()), "filtro por cliente: só BRL, sem abas de moeda");
  check(db.rpcCalls.at(-1).p_client_ids?.[0] === EXC, "cliente enviado ao banco");

  // Plataforma
  await page.getByLabel("Plataforma").selectOption("google");
  await waitValue(page, "Investimento", "R$ 50,00");
  check(await value(page, "Mensagens") === "Informação não disponível pela API.", "Google: mensagens não disponíveis pela API");
  check(await value(page, "CPL") === "Informação não disponível pela API.", "Google sem leads: CPL não é calculado");
  const accountOptions = await page.getByLabel("Conta", { exact: true }).locator("option").allInnerTexts();
  check(accountOptions.length === 2 && accountOptions[1].includes("622-333-4445"), "lista de contas segue cliente + plataforma");
  await page.getByLabel("Plataforma").selectOption("");

  // Status da campanha → soma das campanhas
  await page.getByLabel("Status da campanha").selectOption("ativa");
  await waitValue(page, "Investimento", "R$ 250,00");
  check(await page.getByText("1 campanha (soma das campanhas filtradas)").isVisible(), "status ativa → soma só a campanha ativa e avisa");
  check(db.rpcCalls.at(-1).p_campaign_statuses?.[0] === "ativa", "status enviado ao banco");

  // Campanha
  const campaignOptions = await page.getByLabel("Campanha", { exact: true }).locator("option").allInnerTexts();
  check(campaignOptions.includes("Leads") && campaignOptions.includes("Remarketing"), "lista de campanhas do cliente");
  await page.getByLabel("Campanha", { exact: true }).selectOption({ label: "Remarketing" });
  await page.getByText("Nenhum dado de desempenho neste período").waitFor();
  check(await value(page, "Investimento") === "Sem dados no período.", "campanha pausada + filtro 'ativa' → sem dados (não inventa)");
  await page.getByLabel("Status da campanha").selectOption("");
  await waitValue(page, "Investimento", "R$ 50,00");
  check(true, "campanha Remarketing sozinha = R$ 50,00");

  // Recarregar mantém os filtros
  await page.reload();
  await waitValue(page, "Investimento", "R$ 50,00");
  check(await page.getByLabel("Campanha", { exact: true }).inputValue() === REMKT, "filtros continuam após recarregar a página");

  // Trocar o cliente limpa conta/campanha
  await page.getByLabel("Cliente", { exact: true }).selectOption("");
  await waitValue(page, "Investimento", "US$ 70,00");
  check(true, "sem cliente, volta a moeda escolhida antes (USD)");
  await page.getByRole("tab", { name: "BRL" }).click();
  await waitValue(page, "Investimento", "R$ 350,00");
  check(!page.url().includes("campanha="), "trocar o cliente limpa a campanha");
  check(await page.getByLabel("Campanha", { exact: true }).isDisabled(), "campanha pede cliente ou conta antes");

  // Período
  await page.getByLabel("Período").selectOption("today");
  await page.getByText("Nenhum dado de desempenho neste período").waitFor();
  check(db.rpcCalls.at(-1).p_from === today || db.rpcCalls.at(-2).p_from === today, "Hoje consulta o dia de hoje");
  await page.getByLabel("Período").selectOption("custom");
  await page.getByLabel("De", { exact: true }).fill(day(-2));
  await page.getByLabel("Até", { exact: true }).fill(day(-1));
  await waitValue(page, "Investimento", "R$ 350,00");
  check(page.url().includes(`periodo=custom&de=${day(-2)}&ate=${day(-1)}`), "período personalizado fica no endereço");
  check((await page.getByTestId("period-text").innerText()).includes("comparado com"), "mostra as datas comparadas");

  // Limpar filtros
  await page.getByLabel("Status da campanha").selectOption("pausada");
  await waitValue(page, "Investimento", "R$ 50,00");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await waitValue(page, "Investimento", "R$ 350,00");
  check(page.url().includes("periodo=custom") && !page.url().includes("status="), "limpar filtros mantém o período");

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, "no celular não há rolagem para o lado");
  await page.screenshot({ path: `${SHOTS}/61-dashboard-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ------------------------------------------------------------ banco vazio
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "gestor" });
  await login(page, "/");
  await page.getByText("Nenhum dado de desempenho neste período").waitFor();
  check(await value(page, "Investimento") === "Sem dados no período.", "sem dados: nenhum número inventado");
  check(await page.getByLabel("Conta", { exact: true }).locator("option").first().innerText() === "Nenhuma conta vinculada", "sem contas vinculadas: filtro avisa");
  check(errors.length === 0, "sem erros no navegador (banco vazio)");
  await browser.close();
}

console.log(`\nDashboard: tudo certo (${BASE}).`);
