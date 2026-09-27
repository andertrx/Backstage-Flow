/**
 * Teste de navegador da Etapa 19.1 — Dashboard do cliente (modelo por cliente,
 * período, resumo, cartões, funil, dia a dia, ações, campanhas, personalização e PDF).
 * Supabase SIMULADO (support.mjs). Datas relativas a "hoje" em São Paulo.
 */
import { writeFile } from "node:fs/promises";
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (o) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const br = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000001901";
const META = "a0000000-0000-4000-8000-000000001901";
const GOOGLE = "a0000000-0000-4000-8000-000000001902";
const OLD = "a0000000-0000-4000-8000-000000001903";
const cid = (n) => `d0000000-0000-4000-8000-${String(1900 + n).padStart(12, "0")}`;
const raw = (o) => ({ actions: Object.entries(o).map(([action_type, value]) => ({ action_type, value: String(value) })), action_values: [] });

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  const acc = (id, platform_id, external_id, name) => ({ id, platform_id, external_id, client_id: EXC, name, currency: "BRL", status: "ativa", unlinked_at: null,
    connection_id: null, timezone: null, raw_status: null, status_reason: null, business_name: null, is_prepay: null, linked_at: "2026-09-01T12:00:00Z", details_updated_at: null, assets: [] });
  db.adAccounts.push(acc(META, "meta", "919", "Excalibur Meta"), acc(GOOGLE, "google", "9223334419", "Excalibur Google"), acc(OLD, "meta", "920", "Conta antiga"));
  const camp = (n, account, platform_id, name, status) => ({ id: cid(n), ad_account_id: account, client_id: EXC, platform_id, external_id: `c${n}`, name, objective: null, status });
  db.campaigns.push(camp(1, META, "meta", "Leads Setembro", "ativa"), camp(2, META, "meta", "Remarketing", "pausada"), camp(3, GOOGLE, "google", "Pesquisa Marca", "ativa"));
  const m = (n, date, v) => {
    const c = db.campaigns.find((x) => x.id === cid(n));
    const base = { date, ad_account_id: c.ad_account_id, client_id: EXC, platform_id: c.platform_id, currency: "BRL", reach: null,
      spend_micros: 0, impressions: 0, clicks: 0, link_clicks: null, leads: null, messages: null, conversions: null, conversion_value_micros: null, raw_actions: null, ...v };
    db.metrics.push({ ...base, level: "campaign", campaign_id: c.id }, { ...base, level: "account", campaign_id: null });
  };
  m(1, day(-1), { spend_micros: 100 * M, impressions: 10000, clicks: 300, link_clicks: 200, leads: 10, messages: 4,
    raw_actions: raw({ link_click: 200, landing_page_view: 120, omni_landing_page_view: 120, lead: 10, "onsite_conversion.messaging_conversation_started_7d": 4, omni_purchase: 2, purchase: 2, offsite_lead_add_20_s_calls: 5 }) });
  m(2, day(-2), { spend_micros: 80 * M, impressions: 8000, clicks: 150, link_clicks: 100, leads: 10, raw_actions: raw({ link_click: 100, landing_page_view: 60, lead: 10 }) });
  m(1, day(-9), { spend_micros: 150 * M, impressions: 10000, clicks: 200, link_clicks: 150, leads: 25, raw_actions: raw({ link_click: 150, lead: 25, omni_purchase: 1 }) });
  m(3, day(-1), { spend_micros: 50 * M, impressions: 1000, clicks: 50, conversions: 5, conversion_value_micros: 500 * M });
  db.reachRows = [{ ad_account_id: META, level: "account", entity_external_id: "919", period_start: day(-7), period_end: day(-1), reach: 9000, frequency: 2 }];
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const section = (page, name) => page.getByRole("region", { name: `Conta ${name}` });

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${EXC}`);
  await page.getByRole("link", { name: "Dashboard do cliente" }).click();
  await page.getByTestId("report-title").waitFor();
  check(new URL(page.url()).pathname === `/clientes/${EXC}/dashboard`, "botão na página do cliente abre o dashboard");
  check(clean(await page.getByTestId("report-title").innerText()) === "Relatório de anúncios · Excalibur Fitness", "título padrão (sem modelo salvo)");
  await page.getByTestId("report-account").first().waitFor();
  check((await page.getByTestId("report-period").innerText()).startsWith(`Últimos 7 dias: ${br(day(-7))} a ${br(day(-1))}`), "abre nos últimos 7 dias (sem hoje)");
  check((await page.getByRole("button", { name: "Últimos 7 dias" }).getAttribute("aria-pressed")) === "true", "botão do período marcado");
  const call = db.rpcCalls.find((c) => c.fn === "client_report_accounts");
  check(call.p_from === day(-7) && call.p_to === day(-1) && call.p_client_id === EXC, "consulta o período certo no banco");

  // Uma seção por conta, a que mais investiu primeiro; conta sem dados listada à parte
  const names = await page.getByTestId("report-account").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(JSON.stringify(names) === JSON.stringify(["Conta Excalibur Meta", "Conta Excalibur Google"]), `uma seção por conta, por investimento (${names})`);
  check((await page.getByTestId("report-accounts-without-data").innerText()).includes("Conta antiga"), "conta sem dados no período aparece numa nota");

  const meta = section(page, "Excalibur Meta");
  const summary = clean(await meta.getByTestId("report-summary").innerText());
  check(summary === "Foram investidos R$ 180,00 e gerados 20 leads, a R$ 9,00 cada. Comparado ao período anterior: 20,0% menos leads e custo por resultado 50,0% maior.", `resumo automático só com fatos (${summary})`);

  // Cartões na ordem do modelo, com variação
  const kpis = await meta.locator("[data-kpi]").evaluateAll((els) => els.map((e) => e.getAttribute("data-kpi")));
  check(JSON.stringify(kpis) === JSON.stringify(["spend", "main_result", "cost_per_result", "impressions", "reach", "clicks", "ctr", "cpc", "cpm"]), `cartões padrão na ordem (${kpis})`);
  const reachCard = clean(await meta.locator("[data-kpi=reach]").innerText());
  check(reachCard.includes("9.000"), `alcance do período exato (${reachCard})`);
  const cprCard = clean(await meta.locator("[data-kpi=cost_per_result]").innerText());
  check(cprCard.includes("R$ 9,00") && cprCard.includes("+50,0%") && cprCard.includes("antes: R$ 6,00"), `custo por resultado com variação (${cprCard})`);
  check(await meta.locator("[data-kpi=cost_per_result] [data-tone=bad]").count() === 1, "custo maior = piora (vermelho)");

  // Google: resultado = Conversões; alcance não informado vai para a nota
  const google = section(page, "Excalibur Google");
  check((await google.innerText()).includes("no Google Ads o resultado é Conversões"), "Google usa Conversões como resultado");
  check(await google.locator("[data-kpi=reach]").count() === 0, "sem cartão de alcance quando a plataforma não informa");
  check((await google.getByTestId("report-missing").innerText()).startsWith("Alcance: informação não disponível"), "nota das métricas não informadas");
  check(clean(await google.getByTestId("report-summary").innerText()).startsWith("Foram investidos R$ 50,00 e gerados 5 conversões, a R$ 10,00 cada."), "resumo do Google");
  check(await google.getByTestId("report-actions").count() === 0, "Google sem tabela de ações do Meta");

  // Funil com taxas entre as etapas
  const funnel = clean(await meta.getByTestId("report-funnel").innerText());
  check(funnel.includes("Impressões 18.000") && funnel.includes("1,67% CTR do link") && funnel.includes("Cliques no link 300") &&
    funnel.includes("60,00% dos cliques chegaram à página") && funnel.includes("Visualizações da página 180") && funnel.includes("11,11% taxa de conversão") && funnel.includes("Leads 20"), `funil (${funnel})`);

  // Dia a dia: gráficos separados (sem eixo duplo)
  check(await meta.getByTestId("report-daily").locator("svg").count() === 4, "4 gráficos dia a dia (investimento, resultado, custo, CTR)");

  // Ações por tipo: sem repetir e sem tipos estranhos
  const actions = await meta.getByTestId("report-action-row").evaluateAll((rows) => rows.map((r) => r.querySelector("td").textContent));
  check(JSON.stringify(actions) === JSON.stringify(["Cliques no link", "Visualizações da página de destino", "Compras", "Leads (todos)", "Conversas iniciadas"]), `ações em português, uma vez cada (${actions})`);
  const compras = clean(await meta.getByTestId("report-action-row").nth(2).innerText());
  check(compras === "Compras 2 R$ 90,00 1 +100,0%", `compras: quantidade, custo, antes e variação (${compras})`);

  // Campanhas
  const camps = await meta.getByTestId("report-campaign-row").evaluateAll((rows) => rows.map((r) => r.querySelector("td span").textContent));
  check(JSON.stringify(camps) === JSON.stringify(["Leads Setembro", "Remarketing"]), `campanhas da conta (${camps})`);
  check(clean(await meta.getByTestId("report-campaign-row").first().innerText()).includes("R$ 100,00 10 R$ 10,00 10.000 200 2,00%"), "linha da campanha com resultado e custo");
  await page.screenshot({ path: `${SHOTS}/client-report-desktop.png`, fullPage: true });

  // Trocar período
  await page.getByRole("button", { name: "Últimos 30 dias" }).click();
  await page.waitForFunction(() => location.search.includes("periodo=last_30_days"));
  await page.waitForFunction(() => document.querySelector("[data-testid=report-period]")?.textContent.startsWith("Últimos 30 dias"));
  for (let i = 0; i < 50 && !db.rpcCalls.some((c) => c.fn === "client_report_accounts" && c.p_from === day(-30)); i++) await page.waitForTimeout(100);
  check(db.rpcCalls.some((c) => c.fn === "client_report_accounts" && c.p_from === day(-30)), "trocar para 30 dias consulta o novo período");
  const explained = await section(page, "Excalibur Meta").getByText(/O alcance \(pessoas únicas\) só aparece/).waitFor({ timeout: 6000 }).then(() => true, () => false);
  check(explained, "alcance fora dos períodos com dado: explicação");
  await page.getByLabel("De").fill(day(-2));
  await page.getByLabel("Até").fill(day(-1));
  await page.getByRole("button", { name: "Ver período" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=report-period]")?.textContent.startsWith("Período personalizado"));
  check(new URL(page.url()).searchParams.get("de") === day(-2), "período personalizado no endereço");
  await page.goto(`${BASE}/clientes/${EXC}/dashboard?periodo=custom&de=2020-01-01&ate=${day(-1)}`);
  await page.getByText("Escolha no máximo 400 dias.").waitFor();
  check(true, "período longo demais é recusado com aviso");

  // Personalizar (admin)
  await page.goto(`${BASE}/clientes/${EXC}/dashboard`);
  await page.getByTestId("report-account").first().waitFor();
  await page.getByRole("button", { name: "Personalizar" }).click();
  const form = page.getByTestId("report-settings-form");
  await form.getByLabel("Título", { exact: true }).fill("Resultados Excalibur");
  await form.getByLabel("Subtítulo (opcional)").fill("Academia · Unidade Centro");
  await form.getByLabel("Resultado principal", { exact: true }).selectOption({ label: "Compras" });
  check((await form.getByLabel("Nome do resultado").inputValue()) === "Compras", "resultado vindo das ações do Meta dos últimos 90 dias");
  await form.getByLabel("Nome do resultado").fill("Vendas");
  await form.getByLabel("Tirar CPM", { exact: true }).click();
  await form.getByLabel("Subir Alcance", { exact: true }).click();
  await form.getByLabel("Período ao abrir").selectOption("last_14_days");
  await form.getByLabel(/^Funil/).uncheck();
  await form.getByLabel("Análise da agência (o cliente vê)").fill("Semana com custo maior por causa do novo público.");
  await form.getByLabel("Próximos passos (o cliente vê)").fill("Testar dois criativos novos.");
  await form.getByRole("button", { name: "Salvar modelo" }).click();
  await form.waitFor({ state: "detached" });
  const saved = db.reportSettings[0];
  check(saved.main_result.source === "action" && saved.main_result.action_type === "omni_purchase" && saved.main_result.label === "Vendas", "modelo salvo com o resultado principal (ação do Meta)");
  check(JSON.stringify(saved.kpis) === JSON.stringify(["spend", "main_result", "cost_per_result", "reach", "impressions", "clicks", "ctr", "cpc"]), `métricas e ordem salvas (${saved.kpis})`);
  check(saved.sections.funnel === false && saved.default_period === "last_14_days", "seções e período padrão salvos");

  await page.goto(`${BASE}/clientes/${EXC}/dashboard`);
  await page.getByTestId("report-account").first().waitFor();
  check(clean(await page.getByTestId("report-title").innerText()) === "Resultados Excalibur", "título do modelo");
  check((await page.getByTestId("report-period").innerText()).startsWith("Últimos 14 dias"), "abre no período padrão do modelo");
  const meta2 = section(page, "Excalibur Meta");
  check(clean(await meta2.getByTestId("report-summary").innerText()).includes("e gerados 3 vendas, a R$ 110,00 cada"), "resumo usa o resultado escolhido");
  check(await meta2.getByTestId("report-funnel").count() === 0, "funil desligado não aparece");
  check(await meta2.locator("[data-kpi=cpm]").count() === 0, "métrica tirada não aparece");
  check((await page.getByTestId("report-notes").innerText()).includes("Testar dois criativos novos."), "análise e próximos passos aparecem");

  // PDF (impressão do navegador, A4, sem menu)
  await page.evaluate(() => document.documentElement.classList.add("pdf-mode"));
  await page.waitForTimeout(400);
  await page.emulateMedia({ media: "print" });
  check(!(await page.getByTestId("sidebar").isVisible()) && !(await page.getByRole("button", { name: "Baixar PDF" }).isVisible()), "no PDF: sem menu e sem botões");
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => document.documentElement.classList.remove("pdf-mode"));
  await writeFile(`${SHOTS}/client-report.pdf`, pdf);
  check(pdf.length > 20_000 && pdf.subarray(0, 4).toString() === "%PDF", `PDF gerado (${Math.round(pdf.length / 1024)} KB)`);

  // Celular: sem rolagem lateral da página
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `celular sem rolagem lateral (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/client-report-mobile.png`, fullPage: true });

  // Relatórios: atalho para o dashboard do cliente
  await page.setViewportSize({ width: 1366, height: 820 });
  await page.goto(`${BASE}/relatorios?cliente=${EXC}`);
  await page.getByTestId("client-dashboard-cta").getByRole("link", { name: /Abrir dashboard de Excalibur Fitness/ }).click();
  await page.getByTestId("report-title").waitFor();
  check(true, "Relatórios leva ao dashboard do cliente escolhido");

  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// Operador vê, mas não personaliza (o banco também bloqueia)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "operador" });
  seed(db);
  await login(page, `/clientes/${EXC}/dashboard`);
  await page.getByTestId("report-account").first().waitFor();
  check(await page.getByRole("button", { name: "Personalizar" }).count() === 0, "operador: sem o botão Personalizar");
  check(await page.getByRole("button", { name: "Baixar PDF" }).count() === 1, "operador: pode baixar o PDF");
  check(errors.length === 0, "operador sem erros");
  await browser.close();
}
console.log("Dashboard do cliente: tudo certo.");
