/**
 * Teste de navegador da Etapa 37.2 — Monitoramento: Comparativos, Campanhas e Criativos.
 * Supabase SIMULADO (support.mjs). Datas relativas a hoje (fuso de São Paulo).
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000901";
const US = "a0000000-0000-4000-8000-000000000903";
const C1 = "c0000000-0000-4000-8000-000000000901";
const C2 = "c0000000-0000-4000-8000-000000000902";
const C3 = "c0000000-0000-4000-8000-000000000903";
const G1 = "b0000000-0000-4000-8000-000000000901";
const A1 = "d0000000-0000-4000-8000-000000000901";
const A2 = "d0000000-0000-4000-8000-000000000902";
const A3 = "d0000000-0000-4000-8000-000000000903";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const br = (d) => d.split("-").reverse().join("/");

function seed(db) {
  const client = (id, name) => ({ id, name, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "" });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  db.adAccounts.push(
    { id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", unlinked_at: null },
    { id: US, platform_id: "meta", external_id: "613", client_id: LOJA, name: "Loja US", currency: "USD", timezone: "America/Sao_Paulo", status: "ativa", unlinked_at: null },
  );
  db.coverage[META] = { history_from: day(-400), history_to: today };
  db.coverage[US] = { history_from: day(-10), history_to: today }; // não cobre o período anterior inteiro
  const camp = (id, acc, cli, name, objective) => ({ id, ad_account_id: acc, client_id: cli, platform_id: "meta", external_id: id.slice(-3), name, objective, status: "ativa" });
  db.campaigns.push(camp(C1, META, EXC, "Leads Setembro", "OUTCOME_LEADS"), camp(C2, META, EXC, "Tráfego Site", "OUTCOME_TRAFFIC"), camp(C3, US, LOJA, "Loja US Vendas", "OUTCOME_SALES"));
  db.adGroups.push({ id: G1, campaign_id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", name: "Público frio", status: "ativa" });
  const ad = (id, name, creative, thumb) => ({ id, ad_group_id: G1, campaign_id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", name, status: "ativa",
    creative_external_id: creative, thumbnail_url: thumb, creative_type: "VIDEO", preview_link: null });
  db.ads.push(ad(A1, "Depoimento Ana", "cr1", "https://cdn.test/cr1.png"), ad(A2, "Depoimento Ana (cópia)", "cr1", "https://cdn.test/cr1.png"), ad(A3, "Foto academia", null, null));

  const m = (level, ids, date, v) => db.metrics.push({ date, level, client_id: ids.cli ?? EXC, platform_id: "meta", currency: ids.cur ?? "BRL", superseded: false,
    ad_account_id: ids.acc ?? META, campaign_id: ids.c ?? null, ad_group_id: ids.g ?? null, ad_id: ids.a ?? null,
    spend_micros: v.spend, impressions: v.impr, clicks: v.clk, link_clicks: v.link ?? null, leads: v.leads ?? null, messages: null, conversions: v.conv ?? null, conversion_value_micros: v.value ?? null });
  for (let i = 1; i <= 7; i++) {
    const cur = day(-i), prev = day(-7 - i);
    // C1: mesmo investimento, metade dos leads → custo por lead dobra (crítico)
    m("campaign", { c: C1 }, prev, { spend: 10_000_000, impr: 2000, clk: 60, leads: 4 });
    m("campaign", { c: C1 }, cur, { spend: 10_000_000, impr: 2000, clk: 60, leads: 2 });
    // C2: estável
    m("campaign", { c: C2 }, prev, { spend: 5_000_000, impr: 3000, clk: 90, link: 80 });
    m("campaign", { c: C2 }, cur, { spend: 5_000_000, impr: 3000, clk: 90, link: 80 });
    // C3 (USD): conversões caem, mas o histórico é incompleto → só informativo
    m("campaign", { c: C3, acc: US, cli: LOJA, cur: "USD" }, prev, { spend: 3_000_000, impr: 1500, clk: 40, conv: 3 });
    m("campaign", { c: C3, acc: US, cli: LOJA, cur: "USD" }, cur, { spend: 3_000_000, impr: 1500, clk: 40, conv: 1 });
    // Contas
    m("account", {}, prev, { spend: 15_000_000, impr: 5000, clk: 150, leads: 4 });
    m("account", {}, cur, { spend: 15_000_000, impr: 5000, clk: 150, leads: 2 });
    m("account", { acc: US, cli: LOJA, cur: "USD" }, cur, { spend: 3_000_000, impr: 1500, clk: 40, conv: 1 });
    // Anúncios da C1
    m("ad", { c: C1, g: G1, a: A1 }, cur, { spend: 4_000_000, impr: 800, clk: 24, leads: 1 });
    m("ad", { c: C1, g: G1, a: A2 }, cur, { spend: 3_000_000, impr: 600, clk: 18, leads: 1 });
    m("ad", { c: C1, g: G1, a: A3 }, prev, { spend: 3_000_000, impr: 600, clk: 18, leads: 1 });
  }
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const rowsOf = (page) => page.getByTestId("compare-row");
async function waitRows(page, n) {
  await page.waitForFunction((k) => document.querySelectorAll("[data-testid=compare-row]").length === k, n, { timeout: 6000 }).catch(() => {});
  return rowsOf(page).count();
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  // Miniatura servida localmente (sem depender da internet)
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.route("https://cdn.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();
  const tabs = await page.getByRole("tab").allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(["Visão geral", "Alertas", "Comparativos", "Campanhas", "Criativos", "Histórico", "Configurações"]), `abas novas (${tabs})`);

  // Campanhas: últimos 7 dias × 7 anteriores
  await page.getByRole("tab", { name: "Campanhas" }).click();
  check(await waitRows(page, 3) === 3, "3 campanhas comparadas");
  const periods = clean(await page.getByTestId("periodos").innerText());
  check(periods.includes(`${br(day(-7))} a ${br(day(-1))}`) && periods.includes(`${br(day(-14))} a ${br(day(-8))}`) && periods.includes("7 dias cada"), `períodos de mesma duração (${periods})`);
  const order = await rowsOf(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-severity")));
  check(JSON.stringify(order) === JSON.stringify(["critico", "informativo", "normal"]), `mais grave primeiro (${order})`);
  const first = clean(await rowsOf(page).first().innerText());
  check(first.startsWith("Leads Setembro") && first.includes("Crítico"), "Leads Setembro em crítico");
  check(clean(await rowsOf(page).first().locator("[data-metric=cost_per_result]").innerText()) === "+100,0%", "custo por lead +100%");
  check(clean(await rowsOf(page).first().locator("[data-metric=results]").innerText()) === "−50,0%", "leads −50%");
  const us = clean(await rowsOf(page).nth(1).innerText());
  check(us.startsWith("Loja US Vendas") && us.includes("Histórico incompleto") && us.includes("US$"), `campanha em dólar com histórico incompleto fica informativa (${us})`);
  check(clean(await page.getByTestId("resumo-critico").innerText()).endsWith("1") && clean(await page.getByTestId("resumo-normal").innerText()).endsWith("1"), "resumo por gravidade");
  await page.screenshot({ path: `${SHOTS}/37.2-campanhas.png`, fullPage: true });

  // Só variações relevantes
  await page.getByLabel("Só variações relevantes (atenção ou crítico)").click();
  await page.waitForURL(/relevantes=1/);
  check(await waitRows(page, 1) === 1, "filtro de relevantes deixa só a crítica");
  check(await page.getByLabel("Só variações relevantes (atenção ou crítico)").isChecked(), "filtro marcado e guardado no endereço");
  await page.getByLabel("Só variações relevantes (atenção ou crítico)").click();
  await waitRows(page, 3);

  // Detalhe da campanha: métricas, gráfico e dia a dia
  await page.getByRole("button", { name: "Leads Setembro" }).click();
  const dlg = page.getByRole("dialog", { name: "Leads Setembro" });
  await dlg.getByTestId("detalhe").waitFor();
  const cpl = clean(await dlg.getByTestId("detalhe-cost_per_result").innerText());
  check(cpl.includes("R$ 5,00") && cpl.includes("R$ 2,50") && cpl.includes("+100,0%") && cpl.includes("Crítico") && cpl.includes("Limite 20% / 40%"), `custo por lead R$ 2,50 → R$ 5,00 com o limite aplicado (${cpl})`);
  const leads = clean(await dlg.getByTestId("detalhe-results").innerText());
  check(leads.includes("14") && leads.includes("28") && leads.includes("−50,0%"), `leads 28 → 14 (${leads})`);
  check(clean(await dlg.innerText()).includes("Resultado: Leads"), "resultado pelo objetivo (Leads)");
  await dlg.locator("svg").first().waitFor();
  check(await dlg.locator("svg path").count() > 0, "gráfico de tendência desenhado");
  await dlg.getByText(/Comparação dia a dia/).click();
  check(await dlg.getByTestId("dia-a-dia").locator("tbody tr").count() === 7, "dia a dia com os 7 dias");
  await page.screenshot({ path: `${SHOTS}/37.2-detalhe.png`, fullPage: false });

  // Navegar na hierarquia: anúncios desta campanha
  await dlg.getByRole("button", { name: "Ver anúncios desta campanha" }).click();
  await page.getByTestId("filtro-campanha").waitFor();
  check(page.url().includes("aba=comparativos") && page.url().includes("nivel=ad") && page.url().includes(`campanha=${C1}`), "abre Comparativos no nível de anúncio, só da campanha");
  check(await waitRows(page, 3) === 3, "3 anúncios da campanha");
  check(clean(await page.locator("table").innerText()).includes("Foto academia"), "anúncio do período anterior também aparece (sem entrega agora)");
  await page.getByTestId("filtro-campanha").click();
  await page.getByRole("button", { name: "Contas" }).click();
  check(await waitRows(page, 2) === 2, "nível de conta: 2 contas");

  // Período personalizado
  await page.getByLabel("Período").selectOption("custom");
  await page.getByLabel("De").fill(day(-3));
  await page.getByLabel("Até").fill(day(-1));
  await page.waitForFunction((t) => document.querySelector("[data-testid=periodos]")?.textContent.includes(t), `${br(day(-3))} a ${br(day(-1))}`, { timeout: 5000 }).catch(() => {});
  const cp = clean(await page.getByTestId("periodos").innerText());
  check(cp.includes(`${br(day(-6))} a ${br(day(-4))}`) && cp.includes("3 dias cada"), `personalizado compara com os 3 dias anteriores (${cp})`);

  // Criativos
  await page.getByRole("tab", { name: "Criativos" }).click();
  await page.getByLabel("Período").selectOption("last_7_days");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=criativo-card]").length === 2, null, { timeout: 6000 }).catch(() => {});
  const cards = page.getByTestId("criativo-card");
  check(await cards.count() === 2, `2 criativos: cr1 (2 anúncios) e a foto sem código (${await cards.count()})`);
  const cr1 = clean(await cards.filter({ hasText: "2 anúncios" }).innerText());
  check(cr1.includes("Leads Setembro") && cr1.includes("R$ 49,00") && cr1.includes("Resultados 14"), `criativo cr1 soma os 2 anúncios: 7 dias × R$ 7 (${cr1})`);
  const img = cards.filter({ hasText: "2 anúncios" }).locator("img");
  check(await img.count() === 1 && (await img.getAttribute("referrerpolicy")) === "no-referrer", "miniatura carregada sem enviar o endereço do CRM");
  check(await cards.filter({ hasText: "Foto academia" }).getByTestId("sem-previa").count() === 1, "sem miniatura: 'Prévia indisponível'");
  const foto = clean(await cards.filter({ hasText: "Foto academia" }).innerText());
  check(foto.includes("Investimento R$ 0,00 −100,0%"), `sem entrega no período coberto = R$ 0,00 (${foto})`);
  check(await page.getByRole("link", { name: "Ver prévia oficial" }).count() === 0, "sem link oficial, sem botão de prévia");
  await page.screenshot({ path: `${SHOTS}/37.2-criativos.png`, fullPage: true });
  await cards.filter({ hasText: "2 anúncios" }).getByRole("button").first().click();
  const cd = page.getByRole("dialog");
  await cd.getByTestId("detalhe").waitFor();
  check(clean(await cd.innerText()).includes("2 anúncios usam este criativo"), "detalhe do criativo avisa que é consolidado");
  await cd.getByRole("button", { name: "Fechar janela" }).click();

  const calls = db.rpcCalls.filter((c) => c.fn === "monitor_compare");
  check(calls.every((c) => c.p_limit === 500) && calls.some((c) => c.p_level === "creative"), "consultas limitadas e no nível certo");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

{
  // Visualizador também consulta (só leitura)
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: (await import("./support.mjs")).USER_ID, client_id: EXC });
  await login(page, "/monitoramento");
  await page.getByRole("tab", { name: "Campanhas" }).click();
  check(await waitRows(page, 2) === 2, "visualizador vê só as campanhas dos clientes liberados");
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}

{
  // Celular: tabela rola dentro do cartão, página sem rolagem lateral
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "/monitoramento");
  await page.getByRole("tab", { name: "Criativos" }).click();
  await page.getByTestId("criativo-card").first().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `celular: sem rolagem lateral (${overflow}px)`);
  await browser.close();
}

console.log("Monitoramento — comparativos (37.2): tudo certo.");
