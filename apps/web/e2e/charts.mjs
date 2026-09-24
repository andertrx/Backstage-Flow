/**
 * Teste de navegador da Etapa 11 — Gráficos do Dashboard.
 * Supabase SIMULADO (support.mjs). Datas relativas a "hoje" em São Paulo.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (o) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000000b01";
const GOOGLE = "a0000000-0000-4000-8000-000000000b02";

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.adAccounts.push(
    { id: META, platform_id: "meta", external_id: "b01", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null },
    { id: GOOGLE, platform_id: "google", external_id: "1234567890", client_id: EXC, name: "Excalibur Google", currency: "BRL", status: "ativa", unlinked_at: null },
  );
  const m = (account, platform, date, v) => db.metrics.push({ date, level: "account", ad_account_id: account, client_id: EXC, platform_id: platform, currency: "BRL",
    campaign_id: null, spend_micros: 0, impressions: 0, clicks: 0, leads: null, messages: null, conversions: null, conversion_value_micros: null, reach: null, ...v });
  // Últimos 7 dias; o dia -4 não tem dados (a linha deve ser interrompida)
  for (const d of [-7, -6, -5, -3, -2, -1]) {
    m(META, "meta", day(d), { spend_micros: (100 + d * -10) * M, impressions: 10000, clicks: 200, leads: 10, reach: 5000 + d * -100 });
    m(GOOGLE, "google", day(d), { spend_micros: 40 * M, impressions: 2000, clicks: 80, conversions: 4 });
  }
}

const clean = (s) => s.replace(/ /g, " ");
/** Espera (até 5 s) o site pedir ao banco uma série que satisfaça a condição. */
async function waitSeries(db, pred) {
  for (let i = 0; i < 50; i++) {
    const last = db.rpcCalls.filter((c) => c.fn === "dashboard_timeseries").at(-1);
    if (last && pred(last)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
const tooltip = async (page) => clean(await page.getByTestId("chart-tooltip").innerText());
/** Espera (até 3 s) o tooltip conter o texto; devolve o texto final. */
async function tooltipWith(page, text) {
  let last = "";
  for (let i = 0; i < 30; i++) {
    last = (await page.getByTestId("chart-tooltip").count()) ? await tooltip(page) : "";
    if (last.includes(text)) return last;
    await page.waitForTimeout(100);
  }
  return last;
}
const chartArea = (page) => page.getByRole("img", { name: /^Gráfico de/ });
const reader = (page) => page.getByRole("region", { name: "Evolução" }).locator("rect[tabindex='0']");

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: "Evolução" }).waitFor();
  await page.getByTestId("line-total").waitFor();
  check(true, "Dashboard mostra o gráfico de Evolução");
  const d = await page.getByTestId("line-total").getAttribute("d");
  check((d.match(/M/g) ?? []).length === 2, "dia sem dados interrompe a linha (não vira zero)");
  check((await chartArea(page).getAttribute("aria-label")).startsWith("Gráfico de Investimento por dia"), "gráfico descrito para leitores de tela");

  // Passar o mouse: valor exato do dia
  await chartArea(page).scrollIntoViewIfNeeded();
  const box = await reader(page).boundingBox();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.getByTestId("chart-tooltip").waitFor();
  const t1 = await tooltipWith(page, "R$ 150,00");
  check(t1.includes(`${ddmm(day(-1))}/`) && t1.includes("R$ 150,00"), "tooltip mostra a data e o valor exato (R$ 110 Meta + R$ 40 Google)");
  await page.screenshot({ path: `${SHOTS}/110-grafico.png`, fullPage: false });
  await page.mouse.move(box.x + box.width * (3 / 6), box.y + box.height / 2);
  check((await tooltipWith(page, "sem dados")).includes("sem dados"), "no dia sem dados o tooltip diz 'sem dados'");
  await page.mouse.move(0, 0);

  // Teclado
  await reader(page).focus();
  await page.getByTestId("chart-tooltip").waitFor();
  await page.keyboard.press("ArrowLeft");
  const t2 = await tooltipWith(page, "R$ 160,00");
  check(t2.includes(`${ddmm(day(-2))}/`) && t2.includes("R$ 160,00"), "setas do teclado navegam pelos dias");
  await page.keyboard.press("Escape");
  check(await page.getByTestId("chart-tooltip").count() === 0, "Esc fecha a leitura");
  await reader(page).blur();

  // Trocar a métrica
  await page.getByLabel("Métrica do gráfico").selectOption("cpl");
  await page.waitForFunction(() => location.search.includes("grafico=cpl"));
  await reader(page).focus();
  check((await tooltipWith(page, "R$ 15,00")).includes("R$ 15,00"), "métrica CPL (R$ 150 ÷ 10 leads)");
  await reader(page).blur();
  const metricOptions = await page.getByLabel("Métrica do gráfico").locator("option").allInnerTexts();
  check(["Investimento", "Leads", "CPL", "Cliques", "CTR", "CPM", "CPC", "Conversões", "ROAS", "Alcance", "Impressões"].every((m) => metricOptions.includes(m)), "todas as métricas pedidas estão disponíveis");
  await page.getByLabel("Métrica do gráfico").selectOption("ctr");
  await page.waitForFunction(() => location.search.includes("grafico=ctr"));
  await reader(page).focus();
  check((await tooltipWith(page, "2,33%")).includes("2,33%"), "CTR em % (280 cliques ÷ 12.000 impressões = 2,33%)");
  await reader(page).blur();

  // Agrupamento
  await page.getByLabel("Métrica do gráfico").selectOption("spend");
  await page.getByRole("group", { name: "Agrupar por" }).getByRole("button", { name: "Semanal" }).click();
  await page.waitForFunction(() => location.search.includes("agrupar=week"));
  check(await waitSeries(db, (c) => c.p_granularity === "week"), "semanal consulta o banco por semana");
  await page.getByTestId("line-total").waitFor();
  await reader(page).focus();
  check((await tooltipWith(page, "Semana de")).startsWith("Semana de"), "tooltip mostra a semana (segunda a domingo)");
  await reader(page).blur();
  await page.getByRole("group", { name: "Agrupar por" }).getByRole("button", { name: "Mensal" }).click();
  await page.waitForFunction(() => location.search.includes("agrupar=month"));
  check(await waitSeries(db, (c) => c.p_granularity === "month"), "mensal consulta o banco por mês");
  await page.getByRole("group", { name: "Agrupar por" }).getByRole("button", { name: "Diário" }).click();

  // Separar por plataforma
  await page.getByLabel("Separar por plataforma").click();
  await page.waitForFunction(() => location.search.includes("porplataforma=1"));
  await page.getByTestId("line-meta").waitFor();
  check(await page.getByTestId("line-google").count() === 1, "uma linha para cada plataforma");
  const legend = await page.getByRole("list", { name: "Legenda" }).innerText();
  check(legend.includes("Meta Ads") && legend.includes("Google Ads"), "legenda identifica cada linha (não só pela cor)");
  check(await page.getByTestId("line-meta").getAttribute("stroke") !== await page.getByTestId("line-google").getAttribute("stroke"), "cores diferentes por plataforma");
  await reader(page).focus();
  const t3 = await tooltipWith(page, "Google Ads");
  check(t3.includes("R$ 110,00") && t3.includes("Meta Ads") && t3.includes("R$ 40,00") && t3.includes("Google Ads"), "tooltip mostra as duas plataformas no mesmo dia");
  await reader(page).blur();
  await page.screenshot({ path: `${SHOTS}/111-grafico-plataformas.png`, fullPage: false });

  // Tabela
  await page.getByRole("button", { name: "Ver tabela" }).click();
  await page.getByTestId("chart-table-row").first().waitFor();
  check(await page.getByTestId("chart-table-row").count() === 7, "tabela com um período por linha");
  const gapRow = clean(await page.getByTestId("chart-table-row").nth(3).innerText());
  check(gapRow.includes("—"), "dia sem dados aparece como — na tabela");
  await page.getByRole("button", { name: "Ver gráfico" }).click();
  await page.getByLabel("Separar por plataforma").click();
  await page.waitForFunction(() => !location.search.includes("porplataforma=1"));

  // Alcance: só com uma conta, no diário
  await page.getByLabel("Métrica do gráfico").selectOption("reach");
  await page.getByTestId("chart-empty").waitFor();
  check((await page.getByTestId("chart-empty").innerText()).includes("não pode ser somado"), "alcance de várias contas: explica por que não aparece");
  await page.getByLabel("Conta", { exact: true }).selectOption({ label: "Excalibur Meta (act_b01)" });
  await page.getByTestId("line-total").waitFor();
  await reader(page).focus();
  check((await tooltipWith(page, "5.100")).includes("5.100"), "com uma conta, o alcance diário aparece");
  await reader(page).blur();

  // Recarregar mantém as escolhas
  await page.reload();
  await page.getByTestId("line-total").waitFor();
  check((await page.getByLabel("Métrica do gráfico").inputValue()) === "reach", "recarregar mantém a métrica escolhida");

  // Filtros do Dashboard valem para o gráfico
  check(await waitSeries(db, (c) => c.p_ad_account_ids?.[0] === META), "filtros do Dashboard valem para o gráfico");

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("line-total").waitFor();
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => {
    const vw = window.innerWidth;
    const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > vw + 1).slice(0, 5).map((el) => `${el.tagName}.${el.className?.baseVal ?? el.className}`.slice(0, 80));
    return { sw: document.documentElement.scrollWidth, vw, wide };
  });
  check(overflow.sw <= overflow.vw, `no celular o gráfico cabe na tela ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/112-grafico-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "admin" });
  await login(page, "/");
  await page.getByTestId("chart-empty").waitFor();
  check((await page.getByTestId("chart-empty").innerText()).includes("Sem dados no período"), "sem dados: nenhum gráfico inventado");
  check(errors.length === 0, "sem erros no navegador (vazio)");
  await browser.close();
}

console.log(`\nGráficos: tudo certo (${BASE}).`);
