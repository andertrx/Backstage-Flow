/**
 * Teste de navegador da Etapa 12 — Comparação de períodos.
 * Supabase SIMULADO (support.mjs). As datas são relativas a "hoje" em São Paulo.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const br = (d) => d.split("-").reverse().join("/");
const lastYear = (d) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;

const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000601";
const US = "a0000000-0000-4000-8000-000000000604";
const M = 1_000_000;

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const account = (id, platform_id, external_id, client_id, name, currency) => ({ id, platform_id, external_id, client_id, name, currency, unlinked_at: null });
  db.adAccounts.push(account(META, "meta", "611", EXC, "Excalibur Meta", "BRL"), account(US, "google", "6445556667", LOJA, "Loja US", "USD"));
  const row = (date, ad_account_id, v) => {
    const acc = db.adAccounts.find((a) => a.id === ad_account_id);
    return { date, ad_account_id, level: "account", campaign_id: null, client_id: acc.client_id, platform_id: acc.platform_id, currency: acc.currency,
      spend_micros: 0, impressions: 0, clicks: 0, link_clicks: null, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...v };
  };
  db.metrics.push(
    // Últimos 7 dias: R$ 300 · 30.000 impr. · 600 cliques · 30 leads · 30 conversões · R$ 900 em valor
    row(day(-1), META, { spend_micros: 100 * M, impressions: 10000, clicks: 200, leads: 10, conversions: 10, conversion_value_micros: 400 * M }),
    row(day(-2), META, { spend_micros: 200 * M, impressions: 20000, clicks: 400, leads: 20, conversions: 20, conversion_value_micros: 500 * M }),
    // 7 dias anteriores: R$ 200 · 20.000 impr. · 500 cliques · 25 leads · 20 conversões · R$ 400
    row(day(-9), META, { spend_micros: 200 * M, impressions: 20000, clicks: 500, leads: 25, conversions: 20, conversion_value_micros: 400 * M }),
    // Ano passado: R$ 150 · 15 leads · sem valor de conversão
    row(lastYear(day(-1)), META, { spend_micros: 150 * M, impressions: 10000, clicks: 300, leads: 15, conversions: 10 }),
    // Conta em dólar só no período atual
    row(day(-1), US, { spend_micros: 70 * M, impressions: 7000, clicks: 70 }),
  );
}

const clean = (s) => s.replace(/\u00a0/g, " ").trim();
const cell = (page, metric, testId) => page.locator(`[data-testid=compare-row][data-metric=${metric}] [data-testid=${testId}]`);
// Tira as palavras só para leitores de tela ("melhora de", "piora de").
const text = async (page, metric, testId) => clean(await cell(page, metric, testId).innerText()).replace(/^(melhora|piora|variação) de\s*/, "");
/** Espera (até 5 s) uma célula mostrar o texto esperado. */
async function waitCell(page, metric, testId, expected) {
  for (let i = 0; i < 50; i++) {
    if ((await cell(page, metric, testId).count()) && (await text(page, metric, testId)) === expected) return true;
    await page.waitForTimeout(100);
  }
  return false;
}
/** Espera (até 5 s) o texto do período de comparação; devolve o texto final. */
async function previousText(page, expected) {
  let last = "";
  for (let i = 0; i < 50; i++) {
    last = clean(await page.getByTestId("compare-previous").innerText());
    if (last === expected) break;
    await page.waitForTimeout(100);
  }
  return last;
}
const row = async (page, metric) =>
  Promise.all(["compare-current-value", "compare-previous-value", "compare-difference", "compare-percent"].map((t) => text(page, metric, t)));

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);

  // Entrada pelo Dashboard, levando os filtros
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  await page.goto(`${BASE}/?cliente=${EXC}`);
  await page.getByRole("link", { name: "Comparar períodos" }).click();
  await page.getByRole("heading", { name: "Comparar períodos" }).waitFor();
  check(page.url().includes("/comparar") && page.url().includes(`cliente=${EXC}`), "botão do Dashboard abre a comparação com os mesmos filtros");

  // Datas: atual vs anterior com a mesma quantidade de dias
  check(clean(await page.getByTestId("compare-current").innerText()) === `${br(day(-7))} a ${br(day(-1))}`, "período atual = últimos 7 dias");
  check((await previousText(page, `${br(day(-14))} a ${br(day(-8))}`)) === `${br(day(-14))} a ${br(day(-8))}`, "comparado com os 7 dias anteriores");
  check((await page.getByTestId("compare-periods").innerText()).includes("7 dias"), "mostra a quantidade de dias de cada período");

  // As 8 métricas pedidas, na ordem
  check(await waitCell(page, "spend", "compare-current-value", "R$ 300,00"), "investimento atual");
  const labels = await page.locator("[data-testid=compare-row] th").allInnerTexts();
  check(JSON.stringify(labels.map(clean)) === JSON.stringify(["Investimento", "Leads", "CPL", "CTR", "CPC", "CPM", "Conversões", "ROAS"]), "as 8 métricas pedidas, na ordem");

  // Diferença absoluta e percentual
  check(JSON.stringify(await row(page, "spend")) === JSON.stringify(["R$ 300,00", "R$ 200,00", "+R$ 100,00", "+50,0%"]), "Investimento: +R$ 100,00 e +50,0%");
  check(JSON.stringify(await row(page, "leads")) === JSON.stringify(["30", "25", "+5", "+20,0%"]), "Leads: +5 e +20,0%");
  check(JSON.stringify(await row(page, "cpl")) === JSON.stringify(["R$ 10,00", "R$ 8,00", "+R$ 2,00", "+25,0%"]), "CPL: R$ 300 ÷ 30 contra R$ 200 ÷ 25");
  check(JSON.stringify(await row(page, "ctr")) === JSON.stringify(["2,00%", "2,50%", "−0,50 p.p.", "−20,0%"]), "CTR: diferença em pontos percentuais");
  check(JSON.stringify(await row(page, "cpc")) === JSON.stringify(["R$ 0,50", "R$ 0,40", "+R$ 0,10", "+25,0%"]), "CPC");
  check(JSON.stringify(await row(page, "cpm")) === JSON.stringify(["R$ 10,00", "R$ 10,00", "R$ 0,00", "0,0%"]), "CPM igual: diferença zero");
  check(JSON.stringify(await row(page, "conversions")) === JSON.stringify(["30", "20", "+10", "+50,0%"]), "Conversões");
  check(JSON.stringify(await row(page, "roas")) === JSON.stringify(["3,00x", "2,00x", "+1,00x", "+50,0%"]), "ROAS");

  // Cores: custo que sobe = piora; retorno que sobe = melhora; investimento = neutro
  const tone = (m) => cell(page, m, "compare-percent").locator("[data-tone]").getAttribute("data-tone");
  check(await tone("cpl") === "bad" && await tone("ctr") === "bad" && await tone("roas") === "good" && await tone("leads") === "good", "verde = melhorou, vermelho = piorou");
  check(await tone("spend") === "neutral" && await tone("cpm") === "neutral", "investimento e variação zero ficam neutros");
  await page.screenshot({ path: `${SHOTS}/120-comparacao.png`, fullPage: true });

  // Ano contra ano
  await page.getByRole("radio", { name: "Mesmo período do ano anterior" }).click();
  await page.waitForFunction(() => location.search.includes("comparar=ano"));
  check((await previousText(page, `${br(lastYear(day(-7)))} a ${br(lastYear(day(-1)))}`)) === `${br(lastYear(day(-7)))} a ${br(lastYear(day(-1)))}`, "ano contra ano: mesmas datas do ano passado");
  check(await waitCell(page, "spend", "compare-previous-value", "R$ 150,00"), "ano contra ano usa o histórico do ano passado");
  check(JSON.stringify(await row(page, "leads")) === JSON.stringify(["30", "15", "+15", "+100,0%"]), "Leads contra o ano passado");
  check(await text(page, "roas", "compare-previous-value") === "—" && await text(page, "roas", "compare-difference") === "—", "sem valor de conversão no passado: ROAS não é inventado");
  check(await page.getByRole("radio", { name: "Mesmo período do ano anterior" }).getAttribute("aria-checked") === "true", "modo escolhido fica marcado");

  // Mesmos dias do mês anterior
  await page.getByRole("radio", { name: "Mesmos dias do mês anterior" }).click();
  await page.waitForFunction(() => location.search.includes("comparar=mes"));
  const monthBack = (d) => { const [y, m, dd] = d.split("-").map(Number); const t = new Date(Date.UTC(y, m - 2, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(dd, last)); return t.toISOString().slice(0, 10); };
  check((await previousText(page, `${br(monthBack(day(-7)))} a ${br(monthBack(day(-1)))}`)) === `${br(monthBack(day(-7)))} a ${br(monthBack(day(-1)))}`, `mesmos dias do mês anterior`);

  // Personalizado: períodos de tamanhos diferentes e sobrepostos geram avisos
  await page.getByRole("radio", { name: "Outro período (personalizado)" }).click();
  await page.getByLabel("Comparar de").fill(day(-20));
  await page.waitForFunction((d) => location.search.includes(`comp_de=${d}`), day(-20));
  check((await previousText(page, br(day(-20)))) === br(day(-20)), "início depois do fim: o fim acompanha (nunca fica inválido)");
  await page.getByLabel("Comparar até").fill(day(-3));
  await page.waitForFunction((d) => location.search.includes(`comp_ate=${d}`), day(-3));
  check((await previousText(page, `${br(day(-20))} a ${br(day(-3))}`)) === `${br(day(-20))} a ${br(day(-3))}`, "personalizado usa as datas escolhidas");
  await page.getByText("quantidades de dias diferentes").waitFor();
  check(true, "avisa quando os períodos têm tamanhos diferentes");
  check(await page.getByText("têm dias em comum").count() === 1, "avisa quando os períodos se sobrepõem");

  // Recarregar mantém a escolha
  await page.reload();
  await page.getByRole("heading", { name: "Comparar períodos" }).waitFor();
  check(await page.getByRole("radio", { name: "Outro período (personalizado)" }).getAttribute("aria-checked") === "true" &&
    (await previousText(page, `${br(day(-20))} a ${br(day(-3))}`)) === `${br(day(-20))} a ${br(day(-3))}`, "recarregar mantém a comparação escolhida");

  // Volta ao período anterior e troca o período atual pelos filtros
  await page.getByRole("radio", { name: "Período anterior" }).click();
  await page.getByLabel("Período", { exact: true }).selectOption("last_14_days");
  await page.waitForFunction(() => location.search.includes("periodo=last_14_days"));
  check((await previousText(page, `${br(day(-28))} a ${br(day(-15))}`)) === `${br(day(-28))} a ${br(day(-15))}`, "trocar o período atual recalcula a comparação");
  check(!page.url().includes("comparar="), "período anterior é o padrão (endereço limpo)");

  // Outra moeda: nunca soma BRL com USD
  await page.getByLabel("Período", { exact: true }).selectOption("last_7_days");
  await page.getByLabel("Cliente", { exact: true }).selectOption("");
  await page.getByRole("tab", { name: "USD" }).click();
  check(await waitCell(page, "spend", "compare-current-value", "US$ 70,00"), "moeda escolhida: só as contas em dólar, sem conversão");
  check(await text(page, "spend", "compare-difference") === "—", "sem dados no período anterior: diferença não é inventada");
  await page.getByText("Não há dados no período de comparação").waitFor();
  check(true, "explica que falta a base de comparação");
  await page.getByRole("tab", { name: "BRL" }).click();
  check(await waitCell(page, "spend", "compare-current-value", "R$ 300,00"), "voltar para BRL");

  // Sem dados nos dois períodos (hoje contra o mesmo dia do ano passado)
  await page.getByLabel("Período", { exact: true }).selectOption("today");
  await page.getByRole("radio", { name: "Mesmo período do ano anterior" }).click();
  await page.getByText("Nenhum dado de desempenho nos dois períodos").waitFor();
  check(await text(page, "spend", "compare-current-value") === "—", "sem dados: mostra — e explica");

  // Celular
  await page.getByRole("radio", { name: "Período anterior" }).click();
  await page.getByLabel("Período", { exact: true }).selectOption("last_7_days");
  await waitCell(page, "spend", "compare-current-value", "R$ 300,00");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  const card = clean(await page.locator("[data-testid=compare-card][data-metric=cpl]").innerText()).replace(/\s+/g, " ");
  check(card.includes("R$ 10,00") && card.includes("antes: R$ 8,00") && card.includes("+25,0%") && card.includes("+R$ 2,00"), `no celular cada métrica mostra atual, anterior, diferença e variação sem rolar (${card})`);
  check(overflow.sw <= overflow.vw, `no celular a página cabe na tela (a tabela rola dentro da caixa) ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/121-comparacao-celular.png`, fullPage: true });

  // Voltar ao Dashboard
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  check(true, "link de volta ao Dashboard");

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

console.log("Comparação de períodos: tudo certo.");
