/**
 * Teste de navegador da Etapa 10 — Campanha → Conjunto/Grupo → Anúncio.
 * Supabase SIMULADO (support.mjs). Datas relativas a "hoje" em São Paulo.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (o) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000000a01";
const GOOGLE = "a0000000-0000-4000-8000-000000000a02";
const C1 = "d0000000-0000-4000-8000-0000000000c1";
const C3 = "d0000000-0000-4000-8000-0000000000c3";
const G1 = "f0000000-0000-4000-8000-0000000000a1";
const G2 = "f0000000-0000-4000-8000-0000000000a2";
const G3 = "f0000000-0000-4000-8000-0000000000a3";
const A1 = "b0000000-0000-4000-8000-0000000000b1";
const A2 = "b0000000-0000-4000-8000-0000000000b2";

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.adAccounts.push(
    { id: META, platform_id: "meta", external_id: "a01", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null },
    { id: GOOGLE, platform_id: "google", external_id: "1234567890", client_id: EXC, name: "Excalibur Google", currency: "BRL", status: "ativa", unlinked_at: null },
  );
  db.campaigns.push(
    { id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Setembro", objective: "OUTCOME_LEADS", status: "ativa", budget_micros: 50 * M, budget_period: "diario" },
    { id: C3, ad_account_id: GOOGLE, client_id: EXC, platform_id: "google", external_id: "c3", name: "Pesquisa Marca", objective: "SEARCH", status: "ativa" },
  );
  const group = (id, campaign, account, platform_id, external_id, name, status, optimization_goal, budget_micros = null, budget_period = null) =>
    ({ id, campaign_id: campaign, ad_account_id: account, client_id: EXC, platform_id, external_id, name, status, optimization_goal, budget_micros, budget_period });
  db.adGroups.push(
    group(G1, C1, META, "meta", "g1", "Público Frio", "ativa", "LEAD_GENERATION", 30 * M, "diario"),
    group(G2, C1, META, "meta", "g2", "Remarketing 7d", "pausada", "LEAD_GENERATION"),
    group(G3, C3, GOOGLE, "google", "g3", "Marca Exata", "ativa", "SEARCH_STANDARD"),
  );
  db.ads.push(
    { id: A1, ad_group_id: G1, campaign_id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "ad1", name: "Vídeo Depoimento", status: "ativa", creative_type: "VIDEO", review_status: "APPROVED", thumbnail_url: `${BASE}/favicon.svg` },
    { id: A2, ad_group_id: G1, campaign_id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "ad2", name: "Imagem Promoção", status: "erro", creative_type: "IMAGE", review_status: "DISAPPROVED", thumbnail_url: null },
  );
  const m = (level, ids, date, v) => db.metrics.push({ date, level, ad_account_id: META, client_id: EXC, platform_id: "meta", currency: "BRL",
    spend_micros: 0, impressions: 0, clicks: 0, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...ids, ...v });
  m("campaign", { campaign_id: C1 }, day(-1), { spend_micros: 150 * M, impressions: 15000, clicks: 270, leads: 15 });
  m("campaign", { campaign_id: C1 }, day(-9), { spend_micros: 100 * M, impressions: 10000, clicks: 200, leads: 10 });
  m("ad_group", { campaign_id: C1, ad_group_id: G1 }, day(-1), { spend_micros: 120 * M, impressions: 12000, clicks: 240, leads: 12 });
  m("ad_group", { campaign_id: C1, ad_group_id: G2 }, day(-1), { spend_micros: 30 * M, impressions: 3000, clicks: 30, leads: 3 });
  m("ad", { campaign_id: C1, ad_group_id: G1, ad_id: A1 }, day(-1), { spend_micros: 100 * M, impressions: 10000, clicks: 200, leads: 10 });
  m("ad", { campaign_id: C1, ad_group_id: G1, ad_id: A2 }, day(-1), { spend_micros: 20 * M, impressions: 2000, clicks: 40, leads: 2 });
  db.entityChanges.push(
    { id: 1, entity_level: "campaign", entity_id: C1, field: "status", old_value: "pausada", new_value: "ativa", source: "sync", changed_at: null, detected_at: hoursAgo(5) },
    { id: 2, entity_level: "campaign", entity_id: C1, field: "budget_micros", old_value: 30 * M, new_value: 50 * M, source: "sync", changed_at: null, detected_at: hoursAgo(2) },
    { id: 3, entity_level: "ad", entity_id: A2, field: "review_status", old_value: "APPROVED", new_value: "DISAPPROVED", source: "sync", changed_at: null, detected_at: hoursAgo(1) },
  );
}

const clean = (s) => s.replace(/ /g, " ");
const kpi = async (page, name) => clean(await page.getByRole("group", { name, exact: true }).innerText());
const childNames = (page) => page.getByTestId("child-row").locator("td:first-child a").allInnerTexts();
const cell = async (page, rowName, col) => {
  const headers = (await page.locator("thead th").allInnerTexts()).map((h) => h.trim().toLowerCase());
  const idx = headers.indexOf(col.toLowerCase());
  return clean(await page.getByTestId("child-row").filter({ hasText: rowName }).locator("td").nth(idx).innerText()).trim();
};
const crumbs = async (page) => clean(await page.getByRole("navigation", { name: "Caminho" }).innerText()).replace(/\s+/g, " ").trim();

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/campanhas");
  await page.getByRole("link", { name: "Leads Setembro" }).click();
  await page.waitForURL(`**/campanhas/${C1}`);
  await page.getByRole("heading", { name: "Leads Setembro" }).waitFor();
  check(true, "nome da campanha abre a página da campanha");

  const header = clean(await page.locator("main").innerText());
  check(header.toLowerCase().includes("campanha · meta ads") && header.includes("Cadastros (leads)") && header.includes("R$ 50,00 por dia"), "cabeçalho: nível, plataforma, objetivo e orçamento");
  check((await kpi(page, "Investimento")).includes("R$ 150,00") && (await kpi(page, "Investimento")).includes("+50,0%"), "números da campanha com comparação");
  check((await kpi(page, "CPL")).includes("R$ 10,00"), "CPL da campanha");

  await page.getByRole("heading", { name: "Conjuntos de anúncios" }).waitFor();
  check(JSON.stringify(await childNames(page)) === JSON.stringify(["Público Frio", "Remarketing 7d"]), "Meta: lista os conjuntos da campanha (maior gasto primeiro)");
  check(await cell(page, "Público Frio", "Otimização") === "Geração de cadastros" && await cell(page, "Público Frio", "Orçamento") === "R$ 30,00/dia", "otimização traduzida e orçamento do conjunto");
  check(await cell(page, "Público Frio", "CPL") === "R$ 10,00" && await cell(page, "Público Frio", "Gasto") === "R$ 120,00", "números do conjunto");

  const changes = await page.getByTestId("change-item").allInnerTexts();
  check(changes.length === 2 && clean(changes[0]).includes("Orçamento:") && clean(changes[0]).includes("R$ 30,00") && clean(changes[0]).includes("R$ 50,00"), "histórico: orçamento alterado (mais recente primeiro)");
  check(clean(changes[1]).includes("Status:") && changes[1].includes("Pausada") && changes[1].includes("Ativa"), "histórico: mudança de status traduzida");
  await page.screenshot({ path: `${SHOTS}/100-campanha-detalhe.png`, fullPage: true });

  // Filtros, busca e ordem dos filhos
  await page.getByRole("group", { name: "Filtrar por status" }).getByRole("button", { name: "Pausados" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=child-row]").length === 1);
  check(JSON.stringify(await childNames(page)) === JSON.stringify(["Remarketing 7d"]), "filtro de status nos conjuntos");
  await page.getByRole("group", { name: "Filtrar por status" }).getByRole("button", { name: "Todos" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=child-row]").length === 2);
  await page.getByLabel("Pesquisar conjuntos de anúncios").fill("frio");
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll("[data-testid=child-row] td:first-child a");
    return rows.length === 1 && rows[0].textContent === "Público Frio";
  });
  check(JSON.stringify(await childNames(page)) === JSON.stringify(["Público Frio"]), "pesquisa nos conjuntos");
  await page.getByLabel("Pesquisar conjuntos de anúncios").fill("");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=child-row]").length === 2);
  await page.getByRole("button", { name: /^Gasto/ }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=child-row] td a")?.textContent === "Remarketing 7d");
  check(db.rpcCalls.filter((c) => c.fn === "entity_rows").at(-1).p_desc === false, "ordenação dos conjuntos (menor gasto primeiro)");

  // Conjunto → anúncios
  await page.getByRole("link", { name: "Público Frio" }).click();
  await page.waitForURL(`**/conjuntos/${G1}`);
  await page.getByRole("heading", { name: "Público Frio" }).waitFor();
  await page.getByRole("navigation", { name: "Caminho" }).getByRole("link", { name: "Leads Setembro" }).waitFor();
  check(await crumbs(page) === "Campanhas Leads Setembro Público Frio", "caminho: Campanhas › Campanha › Conjunto");
  check(clean(await page.locator("main").innerText()).toLowerCase().includes("conjunto de anúncios · meta ads"), "Meta chama de conjunto de anúncios");
  await page.getByRole("heading", { name: "Anúncios" }).waitFor();
  check(JSON.stringify(await childNames(page)) === JSON.stringify(["Vídeo Depoimento", "Imagem Promoção"]), "lista os anúncios do conjunto");
  check(await cell(page, "Vídeo Depoimento", "Tipo") === "Vídeo" && await cell(page, "Vídeo Depoimento", "Revisão") === "Aprovado", "tipo do criativo e revisão");
  check(await cell(page, "Imagem Promoção", "Revisão") === "Reprovado" && await cell(page, "Imagem Promoção", "Status") === "Com erro", "anúncio reprovado e com erro");
  check(await page.getByTestId("child-row").filter({ hasText: "Vídeo Depoimento" }).locator("img").count() === 1, "miniatura do anúncio na lista");
  check((await kpi(page, "Investimento")).includes("R$ 120,00"), "números do conjunto no topo");
  await page.screenshot({ path: `${SHOTS}/101-conjunto-detalhe.png`, fullPage: true });

  // Anúncio
  await page.getByRole("link", { name: "Imagem Promoção" }).click();
  await page.waitForURL(`**/anuncios/${A2}`);
  await page.getByRole("heading", { name: "Imagem Promoção" }).waitFor();
  await page.getByRole("navigation", { name: "Caminho" }).getByRole("link", { name: "Público Frio" }).waitFor();
  check(await crumbs(page) === "Campanhas Leads Setembro Público Frio Imagem Promoção", "caminho completo até o anúncio");
  const adText = clean(await page.locator("main").innerText());
  check(adText.toLowerCase().includes("anúncio · meta ads") && adText.includes("Imagem") && adText.includes("Reprovado"), "anúncio: tipo e revisão no cabeçalho");
  check((await kpi(page, "Investimento")).includes("R$ 20,00"), "números do anúncio");
  check(await page.getByRole("heading", { name: "Anúncios" }).count() === 0, "anúncio não tem lista de filhos");
  const adChanges = await page.getByTestId("change-item").allInnerTexts();
  check(adChanges.length === 1 && adChanges[0].includes("Revisão:") && adChanges[0].includes("Reprovado"), "histórico do anúncio (revisão)");

  // Voltar pelo caminho
  await page.getByRole("navigation", { name: "Caminho" }).getByRole("link", { name: "Público Frio" }).click();
  await page.waitForURL(`**/conjuntos/${G1}`);
  await page.getByRole("navigation", { name: "Caminho" }).getByRole("link", { name: "Leads Setembro" }).click();
  await page.waitForURL(`**/campanhas/${C1}`);
  check(true, "caminho volta para o conjunto e para a campanha");

  // Período leva junto ao navegar
  await page.getByLabel("Período", { exact: true }).selectOption("last_30_days");
  await page.waitForFunction(() => location.search.includes("periodo=last_30_days"));
  let asked = false;
  for (let i = 0; i < 50 && !asked; i++) {
    asked = db.rpcCalls.some((c) => c.fn === "entity_rows" && c.p_from === day(-30) && c.p_to === day(-1));
    if (!asked) await new Promise((r) => setTimeout(r, 100));
  }
  check(asked, "trocar o período consulta de novo");
  await page.getByRole("link", { name: "Público Frio" }).click();
  await page.waitForURL(`**/conjuntos/${G1}?periodo=last_30_days`);
  check(true, "o período escolhido vai junto para o conjunto");
  await page.getByRole("navigation", { name: "Caminho" }).getByRole("link", { name: "Campanhas" }).click();
  await page.waitForURL("**/campanhas?periodo=last_30_days");
  check(true, "e volta junto para a lista de campanhas");

  // Google: grupo de anúncios
  await page.goto(`${BASE}/campanhas/${C3}`);
  await page.getByRole("heading", { name: "Pesquisa Marca" }).waitFor();
  await page.getByRole("heading", { name: "Grupos de anúncios" }).waitFor();
  check(true, "Google chama de grupos de anúncios");
  check(await cell(page, "Marca Exata", "Otimização") === "Pesquisa (padrão)" && await cell(page, "Marca Exata", "Gasto") === "—", "grupo sem dados no período → —");
  check(await page.getByText("Sem dados deste item no período escolhido.").isVisible(), "campanha sem dados: aviso, sem número inventado");
  check(await page.getByText("Nenhuma alteração registrada ainda.").isVisible(), "sem histórico: explica que as mudanças aparecem sozinhas");

  // Item inexistente ou sem acesso
  await page.goto(`${BASE}/anuncios/00000000-0000-4000-8000-000000000999`);
  await page.getByText("Item não encontrado ou você não tem acesso a ele.").waitFor();
  check(true, "item inexistente/sem acesso: mensagem clara");

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/conjuntos/${G1}`);
  await page.getByRole("heading", { name: "Público Frio" }).waitFor();
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular a página não rola para o lado");
  await page.screenshot({ path: `${SHOTS}/102-conjunto-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

console.log(`\nConjuntos e anúncios: tudo certo (${BASE}).`);
