/**
 * Teste de navegador da Etapa 39.4 — Inteligência de Resultados: a tela dos números
 * (cards, perfis, contatos por dia, ranking por perfil com abrir conjuntos e anúncios,
 * registros sem dados pessoais, filtros no endereço, atalho na ficha do cliente).
 * Supabase SIMULADO (support.mjs): a última leitura da planilha é montada aqui.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000003941";
const SOURCE = "51ee0000-0000-4000-8000-000000000394";
const ACC = "acc00000-0000-4000-8000-000000003941";
const id = (n) => `c0000000-0000-4000-8000-0000000394${String(n).padStart(2, "0")}`;
const sp = (daysAgo) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - daysAgo * 86_400_000));
const [D2, D3, D10] = [sp(2), sp(3), sp(10)];

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Moda", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  const camp = (n, ext, name) => ({ id: id(n), ad_account_id: ACC, client_id: EXC, platform_id: "meta", external_id: ext, name, status: "ativa", objective: "OUTCOME_LEADS" });
  db.campaigns.push(camp(1, "9001", "Atacado SP"), camp(2, "9002", "Varejo"), camp(3, "9003", "Revenda RJ"), camp(4, "9004", "Duplicada"), camp(5, "9005", "Duplicada"));
  const set = (n, c, ext, name) => ({ id: id(n), campaign_id: id(c), ad_account_id: ACC, client_id: EXC, platform_id: "meta", external_id: ext, name, status: "ativa" });
  db.adGroups.push(set(11, 1, "9011", "Lojistas 25-45"), set(12, 1, "9012", "Revenda"), set(13, 2, "9013", "Aberto"), set(14, 3, "9014", "Kits"));
  const ad = (n, g, c, ext, name) => ({ id: id(n), ad_group_id: id(g), campaign_id: id(c), ad_account_id: ACC, client_id: EXC, platform_id: "meta", external_id: ext, name, status: "ativa" });
  db.ads.push(ad(21, 11, 1, "9021", "Video Vitrine"), ad(22, 12, 1, "9022", "Carrossel Kits"), ad(23, 13, 2, "9023", "Video Look"), ad(24, 14, 3, "9024", "Kit RJ"));
  const m = (date, c, reais) => ({ date, ad_account_id: ACC, level: "campaign", campaign_id: id(c), ad_group_id: null, ad_id: null, client_id: EXC, platform_id: "meta", currency: "BRL", spend_micros: reais * 1_000_000, impressions: 0, clicks: 0 });
  db.metrics.push(m(D2, 1, 100), m(D3, 3, 30), m(D10, 1, 999));
  // Leads e mensagens que o Meta informa no criativo "Video Vitrine" (nível anúncio)
  db.metrics.push({ date: D2, ad_account_id: ACC, level: "ad", campaign_id: id(1), ad_group_id: id(11), ad_id: id(21), client_id: EXC, platform_id: "meta",
    currency: "BRL", spend_micros: 60_000_000, leads: 4, messages: 6, impressions: 0, clicks: 0 });
  db.sheetsKey = { type: "service_account", client_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com" };
  Object.assign(db.sheetsSettings, { service_account_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com", has_key: true });
  const now = new Date().toISOString();
  db.riSources.push({ id: SOURCE, client_id: EXC, spreadsheet_id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", spreadsheet_title: "Leads Excalibur", sheet_name: "Leads", header_row: 1,
    mapping: { record_id: "ID", profile: "Tipo", ad_id: "Ad ID", campaign_name: "Campanha" },
    profile_rules: { lojista: "lojista", sacoleira: "sacoleiro", "consumidor final": "consumidor_final" }, enabled: true,
    read_status: "ok", last_attempt_at: now, last_success_at: now, last_error: null, consecutive_failures: 0, created_at: now, updated_at: now });
  const r = (n, h, d, p, extra = {}) => ({ n, k: `id:${n}`, h, d, p, ...extra });
  db.riSnapshots[SOURCE] = { read_at: now, trigger: "agendada", row_count: 10, stats: { total: 10 }, rows: [
    r(2, "h1", D2, "lojista", { aid: "9021" }),
    r(3, "h2", D3, "lojista", { aid: "9021" }),
    r(4, "h3", D2, "sacoleira", { aid: "9022" }),
    r(5, "h4", D2, "lojista", { aid: "9024" }),
    r(6, "h5", D3, "lojista", { aid: "9024" }),
    r(7, "h6", D3, "consumidor final", { aid: "9023" }),
    r(8, "h7", D2, "lojista", { cn: "Duplicada" }),
    r(9, "h8", D3, ""),
    r(10, "h9", null, "lojista", { aid: "9021" }),
    r(11, "h10", D10, "lojista", { aid: "9021" }),
  ] };
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const kpi = async (page, testid) => clean(await page.getByTestId(testid).getByTestId("ri-kpi-value").innerText());
const rankNames = async (page) => (await page.getByTestId("ri-ranking-row").allInnerTexts()).map((t) => clean(t));

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${EXC}`);
  await page.locator(`main a[href^="/inteligencia-resultados?cliente=${EXC}"]`).click();
  await page.getByTestId("ri-overview").waitFor();
  check(page.url().includes(`cliente=${EXC}`), "atalho na ficha do cliente abre o módulo já no cliente");

  // Visão geral
  check(await kpi(page, "ri-card-contacts") === "8", "cards: 8 contatos únicos no período");
  check(await kpi(page, "ri-card-lojista") === "5" && await kpi(page, "ri-card-sacoleiro") === "1" && await kpi(page, "ri-card-consumidor_final") === "1", "cards: lojistas, sacoleiros e consumidores");
  check(await kpi(page, "ri-card-nao_identificado") === "1", "cards: não identificados");
  check(await kpi(page, "ri-card-classified") === "87,5%", "cards: % classificados");
  check(await kpi(page, "ri-card-origin") === "75%", "cards: % com origem identificada");
  const prevLoj = clean(await page.getByTestId("ri-card-lojista").getByTestId("ri-kpi-previous").innerText());
  check(prevLoj.includes("Período anterior: 1") && prevLoj.includes("400"), `comparação com o período anterior (${prevLoj})`);
  check(clean(await page.getByTestId("ri-profile-bar").innerText()).includes("Lojistas: 5 (62,5%)"), "distribuição com quantidade e %");
  const origin = clean(await page.getByTestId("ri-origin-note").innerText());
  check(origin.includes("6 linha(s) ligadas ao anúncio") && origin.includes("1 linha(s) com nome igual a mais de um item"), "nota da origem: ligadas e ambíguas");
  check(origin.includes("1 linha(s) sem data"), "linhas sem data contadas à parte");
  await page.getByTestId("ri-daily").locator("svg").waitFor();
  check(true, "gráfico de contatos por dia");
  const camps = clean(await page.getByTestId("ri-overview-campaigns").innerText());
  check(camps.includes("Atacado SP") && !/R\$|Investimento|Leads \(Meta\)|Mensagens/.test(camps), "campanhas só com números da planilha (nada do gerenciador)");
  await page.screenshot({ path: `${SHOTS}/39.4-visao-geral.png`, fullPage: true });

  // Registros das linhas ambíguas
  await page.getByTestId("ri-origin-note").getByRole("button", { name: "Ver linhas" }).nth(1).click();
  const modal = page.getByTestId("ri-records");
  await modal.getByTestId("ri-records-rows").waitFor();
  const amb = clean(await modal.innerText());
  check(amb.includes("Nome ambíguo") && amb.includes("“Duplicada”"), "registros: mostra a linha ambígua e o nome da planilha");
  check(!amb.includes("h7") && !/9000[0-9]-/.test(amb), "registros sem impressão digital nem telefone");
  await page.keyboard.press("Escape");

  // Aba Lojistas: campanhas, conjuntos e criativos aparecem juntos (sem precisar abrir)
  await page.getByRole("button", { name: "Lojistas", exact: true }).click();
  await page.getByTestId("ri-tab-lojista").waitFor();
  check(page.url().includes("aba=lojista"), "aba no endereço");
  check(await kpi(page, "ri-profile-total") === "5", "aba Lojistas: total do perfil");
  check(clean(await page.getByTestId("ri-best-campaign").innerText()).includes("2 empatados com 2"), "melhor campanha: avisa o empate");
  const rowsIn = async (level) => (await page.getByTestId(`ri-level-${level}`).getByTestId("ri-ranking-row").allInnerTexts()).map((t) => clean(t));
  await page.getByTestId("ri-level-ad").getByTestId("ri-ranking-row").first().waitFor();
  check(await page.getByTestId("ri-level-campaign").isVisible() && await page.getByTestId("ri-level-ad_group").isVisible() && await page.getByTestId("ri-level-ad").isVisible(),
    "campanhas, conjuntos e criativos na mesma tela");
  let rows = await rowsIn("campaign");
  check(rows.length === 2 && rows[0].startsWith("1empate Atacado SP") && rows[1].startsWith("1empate Revenda RJ"), `campanhas com empate na mesma posição (${rows.join(" | ")})`);
  check(clean(await page.getByTestId("ri-level-campaign").getByTestId("ri-ranking-note").innerText()).includes("1 campanha(s) com contatos, mas nenhum lojista"), "avisa quem ficou fora");
  check((await rowsIn("ad_group")).length === 2, "conjuntos que trouxeram lojistas (sem clicar)");
  const ads = await rowsIn("ad");
  check(clean(await page.getByTestId("ri-level-ad").getByTestId("ri-level-summary").innerText()) === "4 lojistas vieram de 2 criativo(s)", "resumo: quantos lojistas e de quantos criativos");
  const vitrine = ads.find((t) => t.includes("Video Vitrine")) ?? "";
  check(vitrine.includes("Atacado SP › Lojistas 25-45") && /Video Vitrine.* 2 100% 2 Registros$/.test(vitrine), `criativo com campanha › conjunto e só números da planilha (${vitrine})`);
  const head = clean(await page.getByTestId("ri-level-ad").locator("thead").innerText());
  check(!/Leads|Mensagens|Investimento|Custo/.test(head), "sem colunas do gerenciador (leads, mensagens, investimento, custo)");
  check(await page.getByLabel("Ordenar por").count() === 0 && await page.getByLabel("Direção").count() === 0, "sem caixas de ordenar: só as setinhas da coluna");
  await page.getByLabel("Buscar pelo nome").fill("rj");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ri-level-campaign] [data-testid=ri-ranking-row]").length === 1);
  check((await rowsIn("campaign"))[0].includes("Revenda RJ") && (await rowsIn("ad")).length === 1 && (await rowsIn("ad"))[0].includes("Kit RJ"), "busca vale para campanhas, conjuntos e criativos");
  await page.getByLabel("Buscar pelo nome").fill("");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ri-level-ad] [data-testid=ri-ranking-row]").length === 2);
  await page.screenshot({ path: `${SHOTS}/39.4-lojistas.png`, fullPage: true });

  // Clicar na campanha filtra conjuntos e criativos (as campanhas continuam na tela)
  await page.getByTestId("ri-level-campaign").getByRole("button", { name: "Atacado SP" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ri-level-ad] [data-testid=ri-ranking-row]").length === 1);
  check(page.url().includes(`campanha=${id(1)}`), "campanha escolhida fica no endereço");
  check(clean(await page.getByTestId("ri-active-filters").innerText()).includes("Campanha: Atacado SP"), "mostra o filtro ativo");
  check((await rowsIn("campaign")).length === 2, "as campanhas continuam todas visíveis");
  check((await rowsIn("ad_group")).length === 1 && (await rowsIn("ad_group"))[0].includes("Lojistas 25-45"), "conjuntos só da campanha");
  check((await rowsIn("ad"))[0].includes("Video Vitrine"), "criativos só da campanha");
  await page.getByTestId("ri-level-ad_group").getByRole("button", { name: "Lojistas 25-45" }).click();
  await page.getByRole("heading", { name: "Criativos de Lojistas 25-45" }).waitFor();
  check(page.url().includes(`conjunto=${id(11)}`), "conjunto escolhido fica no endereço");
  await page.getByTestId("ri-level-ad").getByRole("button", { name: "Registros" }).click();
  await page.getByTestId("ri-records-rows").waitFor();
  check(clean(await page.getByTestId("ri-records-count").innerText()) === "1–2 de 2 linha(s)", "registros do criativo: 2 linhas");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Tirar o filtro Campanha/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ri-level-ad] [data-testid=ri-ranking-row]").length === 2);
  check(!page.url().includes("campanha=") && !page.url().includes("conjunto="), "tirar o filtro mostra tudo de novo");

  // Período e aba Planilha
  await page.getByLabel("Período").selectOption("yesterday");
  await page.getByTestId("ri-level-campaign").getByTestId("ri-ranking-empty").waitFor();
  check(page.url().includes("periodo=yesterday"), "período no endereço; sem lojistas ontem, sem lista inventada");
  await page.getByRole("button", { name: "Planilha", exact: true }).click();
  await page.getByTestId("ri-source-summary").waitFor();
  check(await page.getByRole("button", { name: "Editar configuração" }).count() === 1, "aba Planilha com a configuração");

  await page.goto(`${BASE}/inteligencia-resultados?cliente=${EXC}&aba=lojista`);
  await page.getByTestId("ri-tab-lojista").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular não há rolagem para o lado");
  await page.screenshot({ path: `${SHOTS}/39.4-celular.png`, fullPage: true });
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ------------------------------------------------------------ visualizador vê; cliente não
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC, created_at: "" });
  await login(page, `/inteligencia-resultados?cliente=${EXC}&aba=sacoleiro`);
  await page.getByTestId("ri-tab-sacoleiro").waitFor();
  check((await rankNames(page))[0]?.includes("Atacado SP"), "visualizador vê o ranking de sacoleiros");
  check(errors.length === 0, "sem erros no navegador (visualizador)");
  await browser.close();
}
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "cliente" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC, created_at: "" });
  await login(page, "/");
  check(await page.getByRole("link", { name: "Inteligência de Resultados" }).count() === 0, "cliente não vê o módulo");
  await browser.close();
}

console.log(`\nInteligência de Resultados 39.4: tudo certo (${BASE}).`);
