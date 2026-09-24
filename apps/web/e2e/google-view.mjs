/**
 * Teste de navegador da Etapa 14 — Visão Google Ads.
 * Supabase SIMULADO (support.mjs). As datas são relativas a "hoje" em São Paulo.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const EXC = "e0000000-0000-4000-8000-000000000001";
const G1 = "a0000000-0000-4000-8000-000000000801";
const G2 = "a0000000-0000-4000-8000-000000000802";
const META = "a0000000-0000-4000-8000-000000000803";
const GC1 = "c0000000-0000-4000-8000-000000000801";
const GC2 = "c0000000-0000-4000-8000-000000000802";
const GC3 = "c0000000-0000-4000-8000-000000000803";
const MC = "c0000000-0000-4000-8000-000000000804";
const AG1 = "90000000-0000-4000-8000-000000000801";
const AG2 = "90000000-0000-4000-8000-000000000802";
const M = 1_000_000;

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  const account = (id, platform_id, external_id, name) => ({ id, platform_id, external_id, client_id: EXC, name, currency: "BRL", status: "ativa", unlinked_at: null });
  db.adAccounts.push(
    account(G1, "google", "1234567890", "Excalibur Pesquisa"),
    account(G2, "google", "2345678901", "Excalibur Display"),
    account(META, "meta", "611", "Excalibur Meta"),
  );
  db.snapshots[G1] = { captured_at: `${day(0)}T09:00:00Z`, budget_micros: 3000 * M, budget_end_at: "2026-12-31T23:59:59Z", amount_spent_micros: 1200 * M,
    available_micros: 1800 * M, available_basis: "google_account_budget", issues: [] };
  db.snapshots[G2] = { captured_at: `${day(0)}T09:00:00Z`, issues: ["cobranca_problema"] };

  const camp = (id, ad_account_id, platform_id, name, status, objective) => ({ id, ad_account_id, client_id: EXC, platform_id, external_id: id.slice(-3), name, status, objective });
  db.campaigns.push(
    camp(GC1, G1, "google", "Pesquisa Marca", "ativa", "SEARCH"),
    camp(GC2, G1, "google", "Performance Max", "pausada", "PERFORMANCE_MAX"),
    camp(GC3, G2, "google", "Display Remarketing", "ativa", "DISPLAY"),
    camp(MC, META, "meta", "Leads Meta", "ativa", "OUTCOME_LEADS"),
  );
  db.adGroups.push(
    { id: AG1, campaign_id: GC1, ad_account_id: G1, client_id: EXC, platform_id: "google", external_id: "ag1", name: "Marca Exata", status: "ativa" },
    { id: AG2, campaign_id: GC1, ad_account_id: G1, client_id: EXC, platform_id: "google", external_id: "ag2", name: "Marca Ampla", status: "pausada" },
  );
  db.ads.push(
    { id: "d1", ad_group_id: AG1, campaign_id: GC1, ad_account_id: G1, client_id: EXC, platform_id: "google", external_id: "d1", name: "RSA 1", status: "ativa" },
    { id: "d2", ad_group_id: AG1, campaign_id: GC1, ad_account_id: G1, client_id: EXC, platform_id: "google", external_id: "d2", name: "RSA 2", status: "erro" },
    { id: "d3", ad_group_id: AG2, campaign_id: GC1, ad_account_id: G1, client_id: EXC, platform_id: "google", external_id: "d3", name: "RSA 3", status: "pausada" },
  );

  const row = (date, ad_account_id, level, v, campaign_id = null) => {
    const acc = db.adAccounts.find((a) => a.id === ad_account_id);
    return { date, ad_account_id, level, campaign_id, client_id: EXC, platform_id: acc.platform_id, currency: "BRL",
      spend_micros: 0, impressions: 0, clicks: 0, link_clicks: null, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...v };
  };
  db.metrics.push(
    // Últimos 7 dias, Google: R$ 400 · 20.000 impr. · 1.000 cliques · 40,5 conversões · R$ 1.500 em valor
    row(day(-1), G1, "account", { spend_micros: 200 * M, impressions: 10000, clicks: 500, conversions: 20, conversion_value_micros: 1000 * M }),
    row(day(-2), G1, "account", { spend_micros: 100 * M, impressions: 5000, clicks: 250, conversions: 10, conversion_value_micros: 500 * M }),
    row(day(-1), G2, "account", { spend_micros: 100 * M, impressions: 5000, clicks: 250, conversions: 10.5 }),
    // Meta no mesmo período: NÃO entra na visão do Google
    row(day(-1), META, "account", { spend_micros: 777 * M, impressions: 1000, clicks: 10, leads: 5 }),
    // 7 dias anteriores
    row(day(-9), G1, "account", { spend_micros: 300 * M, impressions: 20000, clicks: 600, conversions: 25, conversion_value_micros: 1200 * M }),
    // Campanhas
    row(day(-1), G1, "campaign", { spend_micros: 150 * M, impressions: 7000, clicks: 350, conversions: 12 }, GC1),
    row(day(-1), G1, "campaign", { spend_micros: 50 * M, impressions: 3000, clicks: 150, conversions: 2 }, GC2),
  );
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const kpi = (page, name) => page.getByTestId("platform-kpis").getByRole("group", { name, exact: true });
const kpiText = async (page, name) => clean(await kpi(page, name).innerText());
async function waitKpi(page, name, expected) {
  let last = "";
  for (let i = 0; i < 50; i++) {
    last = await kpiText(page, name);
    if (last.includes(expected)) break;
    await page.waitForTimeout(100);
  }
  return last;
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();

  await page.getByRole("link", { name: "Google Ads" }).first().click();
  await page.getByRole("heading", { name: "Google Ads", level: 1 }).waitFor();
  check(page.url().endsWith("/google-ads"), "menu Google Ads abre a visão da plataforma");
  check(await page.getByLabel("Plataforma", { exact: true }).count() === 0, "filtro de plataforma fica fixo (não aparece)");

  // Indicadores pedidos, com os nomes do Google
  await kpi(page, "Investimento").waitFor();
  const names = ["Investimento", "Impressões", "Cliques", "CTR", "CPC", "CPM", "Conversões", "Custo/conversão", "Valor de conversão", "ROAS"];
  const shown = await page.getByTestId("platform-kpis").getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(JSON.stringify(shown) === JSON.stringify(names), "os 10 indicadores pedidos, na ordem e com os nomes do Google");

  check((await waitKpi(page, "Investimento", "R$ 400,00")).includes("R$ 400,00"), "investimento só do Google (R$ 777 do Meta não entra)");
  check((await kpiText(page, "Impressões")).includes("20.000") && (await kpiText(page, "Cliques")).includes("1.000"), "impressões e cliques");
  check((await kpiText(page, "CTR")).includes("5,00%") && (await kpiText(page, "CPC")).includes("R$ 0,40") && (await kpiText(page, "CPM")).includes("R$ 20,00"), "CTR, CPC e CPM");
  check((await kpiText(page, "Conversões")).includes("40,5"), "conversões fracionadas do Google (40,5)");
  check((await kpiText(page, "Custo/conversão")).includes("R$ 9,88"), "custo/conversão = R$ 400 ÷ 40,5");
  check((await kpiText(page, "Valor de conversão")).includes("R$ 1.500,00"), "valor de conversão");
  check((await kpiText(page, "ROAS")).includes("3,75x"), "ROAS = R$ 1.500 ÷ R$ 400");
  check((await kpiText(page, "Investimento")).includes("antes: R$ 300,00") && (await kpiText(page, "Valor de conversão")).includes("antes: R$ 1.200,00"), "comparação com o período anterior");
  check(!db.reachQueries, "Google não busca alcance (não faz parte desta visão)");

  // Estrutura
  const tile = async (id) => clean(await page.getByTestId(id).innerText());
  await page.getByTestId("structure-campaigns").getByTestId("structure-total").waitFor();
  check((await tile("structure-campaigns")).includes("3") && (await tile("structure-campaigns")).includes("2 ativos · 1 pausado"), "campanhas do Google (a do Meta fica de fora)");
  check(await page.getByTestId("structure-groups").getByRole("heading", { name: "Grupos" }).count() === 1, "nível do meio com o nome do Google: Grupos");
  check((await tile("structure-groups")).includes("2") && (await tile("structure-ads")).includes("1 com erro"), "grupos e anúncios, com erro destacado");
  check((await tile("structure-accounts")).includes("2"), "2 contas do Google vinculadas");

  // Contas: orçamento, status e problemas de cobrança
  check(await page.getByRole("heading", { name: "Contas: orçamento, status e cobrança" }).count() === 1, "seção de contas fala em orçamento");
  const g1 = page.getByRole("group", { name: "Conta Excalibur Pesquisa" });
  await g1.waitFor();
  check(clean(await g1.getByTestId("account-budget").innerText()).startsWith("R$ 3.000,00") && clean(await g1.getByTestId("account-budget").innerText()).includes("até"), "orçamento da conta e validade");
  check(clean(await g1.getByTestId("account-spent").innerText()) === "R$ 1.200,00" && clean(await g1.getByTestId("account-available").innerText()) === "R$ 1.800,00", "já veiculado e disponível no orçamento");
  check(clean(await g1.getByTestId("account-issues").innerText()) === "Nenhum informado", "sem problemas de cobrança");
  const g2 = page.getByRole("group", { name: "Conta Excalibur Display" });
  check(clean(await g2.getByTestId("account-issues").innerText()) === "Problema na cobrança", "problema de cobrança informado pelo Google");
  check(clean(await g2.getByTestId("account-budget").innerText()) === "Não informado pela API", "sem orçamento: não inventa");
  check(!(await g1.innerText()).includes("Forma de pagamento"), "campos só do Meta não aparecem no Google");
  check(await page.getByTestId("platform-account").count() === 2, "cartões só das contas do Google");

  // Campanhas com mais investimento: resultado = conversões
  const top = page.getByTestId("top-campaign");
  await top.first().waitFor();
  const first = clean(await top.first().innerText());
  check(first.startsWith("Pesquisa Marca") && first.includes("Conversões") && first.includes("Custo/conv.") && first.includes("R$ 12,50"), "campanhas mostram conversões e custo/conversão");
  await page.screenshot({ path: `${SHOTS}/140-google-ads.png`, fullPage: true });

  // Filtro de conta
  await page.getByLabel("Conta", { exact: true }).selectOption(G1);
  check((await waitKpi(page, "Investimento", "R$ 300,00")).includes("R$ 300,00"), "filtro de conta");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=platform-account]").length === 1, null, { timeout: 5000 }).catch(() => {});
  check(await page.getByTestId("platform-account").count() === 1, "só o cartão da conta escolhida");

  // Trocar para o Meta pelo menu: cada plataforma com seus indicadores
  await page.getByRole("link", { name: "Meta Ads" }).first().click();
  await page.getByRole("heading", { name: "Meta Ads", level: 1 }).waitFor();
  await kpi(page, "Alcance").waitFor();
  check(await kpi(page, "Custo/conversão").count() === 0 && await kpi(page, "CPA").count() === 1, "Meta mantém os próprios indicadores (CPA, Alcance)");
  await page.goBack();
  await page.getByRole("heading", { name: "Google Ads", level: 1 }).waitFor();

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check(overflow.sw <= overflow.vw, `no celular a página cabe na tela ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/141-google-ads-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "cliente" });
  await login(page, "/google-ads");
  await page.waitForTimeout(1500);
  check(!(await page.getByRole("heading", { name: "Google Ads", level: 1 }).count()), "perfil cliente não acessa a visão Google Ads");
  await browser.close();
}

console.log("Visão Google Ads: tudo certo.");
