/**
 * Teste de navegador da Etapa 13 — Visão Meta Ads.
 * Supabase SIMULADO (support.mjs). As datas são relativas a "hoje" em São Paulo.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META1 = "a0000000-0000-4000-8000-000000000701";
const META2 = "a0000000-0000-4000-8000-000000000702";
const GOOGLE = "a0000000-0000-4000-8000-000000000703";
const METAUS = "a0000000-0000-4000-8000-000000000704";
const C1 = "c0000000-0000-4000-8000-000000000701";
const C2 = "c0000000-0000-4000-8000-000000000702";
const C3 = "c0000000-0000-4000-8000-000000000703";
const CG = "c0000000-0000-4000-8000-000000000704";
const G1 = "90000000-0000-4000-8000-000000000701";
const G2 = "90000000-0000-4000-8000-000000000702";
const M = 1_000_000;

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const account = (id, platform_id, external_id, client_id, name, currency, extra = {}) => ({ id, platform_id, external_id, client_id, name, currency, status: "ativa", unlinked_at: null, ...extra });
  db.adAccounts.push(
    account(META1, "meta", "611", EXC, "Excalibur Meta", "BRL", { is_prepay: false }),
    account(META2, "meta", "612", EXC, "Excalibur Remarketing", "BRL", { status: "pagamento_pendente" }),
    account(GOOGLE, "google", "6223334445", EXC, "Excalibur Google", "BRL"),
    account(METAUS, "meta", "613", LOJA, "Loja US", "USD"),
  );
  db.snapshots[META1] = { captured_at: `${day(0)}T09:00:00Z`, available_micros: 500 * M, available_basis: "meta_spend_cap",
    funding_description: "Visa terminado em 1234", amount_due_micros: 120 * M, spend_cap_micros: 2000 * M, amount_spent_micros: 1500 * M };

  const camp = (id, ad_account_id, platform_id, external_id, name, status, objective) => ({ id, ad_account_id, client_id: EXC, platform_id, external_id, name, status, objective });
  db.campaigns.push(
    camp(C1, META1, "meta", "c1", "Leads Setembro", "ativa", "OUTCOME_LEADS"),
    camp(C2, META1, "meta", "c2", "Remarketing Site", "pausada", "OUTCOME_SALES"),
    camp(C3, META2, "meta", "c3", "Tráfego Blog", "ativa", "OUTCOME_TRAFFIC"),
    camp(CG, GOOGLE, "google", "cg", "Pesquisa Marca", "ativa", "SEARCH"),
  );
  db.adGroups.push(
    { id: G1, campaign_id: C1, ad_account_id: META1, client_id: EXC, platform_id: "meta", external_id: "g1", name: "Público Frio", status: "ativa" },
    { id: G2, campaign_id: C2, ad_account_id: META1, client_id: EXC, platform_id: "meta", external_id: "g2", name: "Visitantes 7d", status: "pausada" },
  );
  db.ads.push(
    { id: "a1", ad_group_id: G1, campaign_id: C1, ad_account_id: META1, client_id: EXC, platform_id: "meta", external_id: "ad1", name: "Vídeo", status: "ativa" },
    { id: "a2", ad_group_id: G1, campaign_id: C1, ad_account_id: META1, client_id: EXC, platform_id: "meta", external_id: "ad2", name: "Imagem", status: "erro" },
    { id: "a3", ad_group_id: G2, campaign_id: C2, ad_account_id: META1, client_id: EXC, platform_id: "meta", external_id: "ad3", name: "Carrossel", status: "pausada" },
  );

  const row = (date, ad_account_id, level, v, campaign_id = null) => {
    const acc = db.adAccounts.find((a) => a.id === ad_account_id);
    return { date, ad_account_id, level, campaign_id, client_id: acc.client_id, platform_id: acc.platform_id, currency: acc.currency,
      spend_micros: 0, impressions: 0, clicks: 0, link_clicks: null, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...v };
  };
  db.metrics.push(
    // Últimos 7 dias, Meta em BRL: R$ 350 · 35.000 impr. · 600 cliques · 35 leads · 10 mensagens · 15 conversões · R$ 900 em valor
    row(day(-1), META1, "account", { spend_micros: 100 * M, impressions: 10000, clicks: 200, leads: 10, messages: 4, conversions: 5, conversion_value_micros: 300 * M }),
    row(day(-2), META1, "account", { spend_micros: 200 * M, impressions: 20000, clicks: 300, leads: 20, messages: 6, conversions: 10, conversion_value_micros: 600 * M }),
    row(day(-1), META2, "account", { spend_micros: 50 * M, impressions: 5000, clicks: 100, leads: 5 }),
    // Google no mesmo período: NÃO entra na visão do Meta
    row(day(-1), GOOGLE, "account", { spend_micros: 999 * M, impressions: 1000, clicks: 10, conversions: 3 }),
    // Dólar (outro cliente)
    row(day(-1), METAUS, "account", { spend_micros: 70 * M, impressions: 7000, clicks: 70 }),
    // 7 dias anteriores
    row(day(-9), META1, "account", { spend_micros: 280 * M, impressions: 28000, clicks: 560, leads: 28, messages: 8, conversions: 14, conversion_value_micros: 700 * M }),
    // Campanhas
    row(day(-1), META1, "campaign", { spend_micros: 80 * M, impressions: 8000, clicks: 160, leads: 9 }, C1),
    row(day(-1), META1, "campaign", { spend_micros: 20 * M, impressions: 2000, clicks: 40, leads: 1 }, C2),
  );
  // Alcance pronto da API, para o período EXATO
  db.reachRows = [
    { ad_account_id: META1, level: "account", entity_external_id: "611", period_start: day(-7), period_end: day(-1), reach: 12000, frequency: 2.5 },
    { ad_account_id: META1, level: "account", entity_external_id: "611", period_start: day(-14), period_end: day(-8), reach: 10000, frequency: 2.8 },
    { ad_account_id: META1, level: "campaign", entity_external_id: "c1", period_start: day(-7), period_end: day(-1), reach: 8000, frequency: 2.1 },
  ];
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const kpi = (page, name) => page.getByTestId("platform-kpis").getByRole("group", { name, exact: true });
const kpiText = async (page, name) => clean(await kpi(page, name).innerText());
/** Espera (até 5 s) o card mostrar o texto; devolve o texto final. */
async function waitKpi(page, name, expected) {
  let last = "";
  for (let i = 0; i < 50; i++) {
    last = await kpiText(page, name);
    if (last.includes(expected)) break;
    await page.waitForTimeout(100);
  }
  return last;
}
const tileText = async (page, testId) => clean(await page.getByTestId(testId).innerText());
async function waitTile(page, testId, expected) {
  let last = "";
  for (let i = 0; i < 50; i++) {
    last = await tileText(page, testId);
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

  // Menu lateral abre a visão (antes era "em breve")
  await page.getByRole("link", { name: "Meta Ads" }).first().click();
  await page.getByRole("heading", { name: "Meta Ads", level: 1 }).waitFor();
  check(page.url().endsWith("/meta-ads"), "menu Meta Ads abre a visão da plataforma");
  check(await page.getByLabel("Plataforma", { exact: true }).count() === 0, "filtro de plataforma fica fixo (não aparece)");

  // Todos os indicadores pedidos
  const names = ["Investimento", "Alcance", "Impressões", "Frequência", "Cliques", "CTR", "CPC", "CPM", "Leads", "Mensagens", "Conversões", "CPL", "CPA", "ROAS"];
  await kpi(page, "Investimento").waitFor();
  const shown = await page.getByTestId("platform-kpis").getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(JSON.stringify(shown) === JSON.stringify(names), "os 14 indicadores pedidos, na ordem");

  // Só Meta (o Google fica de fora), em BRL
  check((await waitKpi(page, "Investimento", "R$ 350,00")).includes("R$ 350,00"), "investimento só do Meta (R$ 999 do Google não entra)");
  check((await kpiText(page, "Impressões")).includes("35.000") && (await kpiText(page, "Cliques")).includes("600"), "impressões e cliques");
  check((await kpiText(page, "CTR")).includes("1,71%"), "CTR = 600 ÷ 35.000");
  check((await kpiText(page, "CPC")).includes("R$ 0,58") && (await kpiText(page, "CPM")).includes("R$ 10,00"), "CPC e CPM");
  check((await kpiText(page, "Leads")).includes("35") && (await kpiText(page, "Mensagens")).includes("10"), "leads e mensagens");
  check((await kpiText(page, "CPL")).includes("R$ 10,00") && (await kpiText(page, "CPA")).includes("R$ 23,33"), "CPL e CPA (R$ 350 ÷ 15 conversões)");
  check((await kpiText(page, "ROAS")).includes("2,57x"), "ROAS = R$ 900 ÷ R$ 350");
  check((await kpiText(page, "Investimento")).includes("antes: R$ 280,00"), "comparação com o período anterior");

  // Alcance: várias contas → não soma, explica
  check((await kpiText(page, "Alcance")).includes("pode ser somado entre contas"), "várias contas: alcance não é somado (explica o motivo)");
  check((await kpiText(page, "Frequência")).includes("pode ser somado entre contas"), "frequência segue a mesma regra");

  // Estrutura (contas vinculadas do Meta)
  check((await waitTile(page, "structure-campaigns", "3")).startsWith("Campanhas Ver 3"), "3 campanhas do Meta (a do Google fica de fora)");
  check((await tileText(page, "structure-accounts")).includes("3"), "3 contas do Meta vinculadas");
  check(await page.getByTestId("structure-groups").getByRole("heading", { name: "Conjuntos" }).count() === 1, "nível do meio com o nome do Meta: Conjuntos");

  // Contas: saldo, status e cobrança
  const cards = page.getByTestId("platform-account");
  await cards.first().waitFor();
  check(await cards.count() === 3, "cartões só das contas do Meta");
  const meta1 = page.getByRole("group", { name: "Conta Excalibur Meta" });
  check(clean(await meta1.getByTestId("account-available").innerText()) === "R$ 500,00", "saldo disponível informado pela API");
  check(clean(await meta1.getByTestId("account-funding").innerText()) === "Visa terminado em 1234", "forma de pagamento exatamente como veio");
  check(clean(await meta1.getByTestId("account-billing").innerText()).startsWith("Pós-paga"), "tipo de cobrança (pós-paga)");
  check(clean(await meta1.innerText()).includes("R$ 120,00"), "valor devido");
  const meta2 = page.getByRole("group", { name: "Conta Excalibur Remarketing" });
  check(clean(await meta2.getByTestId("account-issues").innerText()) === "Pagamento pendente", "problemas de cobrança: pagamento pendente");
  check(clean(await meta1.getByTestId("account-issues").innerText()) === "Nenhum informado", "conta verificada sem problemas de cobrança");
  check(clean(await meta2.getByTestId("account-available").innerText()) === "Não informado pela API", "sem dado da API: não inventa saldo");
  check((await meta2.innerText()).includes("Ainda não verificada"), "conta ainda não verificada é identificada");

  // Campanhas com mais investimento
  const top = page.getByTestId("top-campaign");
  await top.first().waitFor();
  check(await top.count() === 2 && clean(await top.first().innerText()).startsWith("Leads Setembro"), "campanhas com mais investimento (só com dados)");
  check(clean(await top.first().innerText()).includes("R$ 80,00") && clean(await top.first().innerText()).includes("R$ 8,89"), "investimento e CPL por campanha");
  await page.screenshot({ path: `${SHOTS}/130-meta-ads.png`, fullPage: true });

  // Uma conta → alcance e frequência como a API calculou
  await page.getByLabel("Conta", { exact: true }).selectOption(META1);
  check((await waitKpi(page, "Alcance", "12.000")).includes("12.000"), "uma conta: alcance do período exato (12.000 pessoas)");
  check((await kpiText(page, "Alcance")).includes("+20,0%") && (await kpiText(page, "Alcance")).includes("antes: 10.000"), "alcance comparado com o período anterior");
  check((await kpiText(page, "Frequência")).includes("2,5"), "frequência informada pela API");
  check((await waitKpi(page, "Investimento", "R$ 300,00")).includes("R$ 300,00"), "números da conta escolhida");
  check((await waitTile(page, "structure-campaigns", "1 ativo · 1 pausado")).includes("2"), "campanhas da conta: 2 (1 ativa, 1 pausada)");
  check((await tileText(page, "structure-ads")).includes("3") && (await tileText(page, "structure-ads")).includes("1 com erro"), "anúncios: 3, 1 com erro");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=platform-account]").length === 1, null, { timeout: 5000 }).catch(() => {});
  check(await cards.count() === 1, "só o cartão da conta escolhida");

  // Campanha escolhida → alcance da campanha
  await page.getByLabel("Campanha", { exact: true }).selectOption(C1);
  check((await waitKpi(page, "Alcance", "8.000")).includes("8.000"), "campanha escolhida: alcance da campanha");
  check((await waitTile(page, "structure-groups", "1")).startsWith("Conjuntos 1"), "estrutura da campanha escolhida");

  // Filtro de status (várias campanhas) → não soma alcance
  await page.getByLabel("Campanha", { exact: true }).selectOption("");
  await page.getByLabel("Status da campanha").selectOption("ativa");
  check((await waitKpi(page, "Alcance", "entre campanhas")).includes("pode ser somado entre campanhas"), "filtro de status: alcance não é somado");
  await page.getByLabel("Status da campanha").selectOption("");

  // Conta sem alcance buscado → explica
  await page.getByLabel("Conta", { exact: true }).selectOption(META2);
  check((await waitKpi(page, "Alcance", "Ainda não foi buscado")).includes("Ainda não foi buscado"), "alcance não buscado: explica, não inventa");

  // Outra moeda
  await page.getByLabel("Conta", { exact: true }).selectOption("");
  await page.getByRole("tab", { name: "USD" }).click();
  check((await waitKpi(page, "Investimento", "US$ 70,00")).includes("US$ 70,00"), "dólar separado, sem conversão");
  await page.getByRole("tab", { name: "BRL" }).click();

  // Links: todas as campanhas do Meta e detalhe da campanha
  await page.getByRole("link", { name: "Ver todas as campanhas do Meta Ads" }).click();
  await page.waitForURL(/\/campanhas\?/);
  check(new URL(page.url()).searchParams.get("plataforma") === "meta", "'Ver todas' abre Campanhas filtrado no Meta");
  await page.goBack();
  await page.getByRole("heading", { name: "Meta Ads", level: 1 }).waitFor();
  await page.getByTestId("top-campaign").first().getByRole("link", { name: "Leads Setembro" }).click();
  await page.getByRole("heading", { name: "Leads Setembro" }).waitFor();
  check(page.url().includes(`/campanhas/${C1}`), "campanha abre o detalhe (conjuntos e anúncios)");
  await page.goBack();

  // Celular
  await page.getByRole("heading", { name: "Meta Ads", level: 1 }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check(overflow.sw <= overflow.vw, `no celular a página cabe na tela ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/131-meta-ads-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Perfil cliente não abre a visão interna
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "cliente" });
  await login(page, "/meta-ads");
  await page.waitForTimeout(1500);
  check(!(await page.getByRole("heading", { name: "Meta Ads", level: 1 }).count()), "perfil cliente não acessa a visão Meta Ads");
  await browser.close();
}

console.log("Visão Meta Ads: tudo certo.");
