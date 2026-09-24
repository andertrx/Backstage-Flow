/**
 * Teste de navegador da Etapa 18 — Relatórios (prévia, CSV, Excel e PDF).
 * Supabase SIMULADO (support.mjs). Datas relativas a "hoje" em São Paulo.
 */
import { readFile, writeFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (o) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000001801";
const GOOGLE = "a0000000-0000-4000-8000-000000001802";
const US = "a0000000-0000-4000-8000-000000001803";
const cid = (n) => `d0000000-0000-4000-8000-${String(1800 + n).padStart(12, "0")}`;

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const acc = (id, platform_id, external_id, client_id, name, currency) => ({ id, platform_id, external_id, client_id, name, currency, status: "ativa", unlinked_at: null });
  db.adAccounts.push(acc(META, "meta", "918", EXC, "Excalibur Meta", "BRL"), acc(GOOGLE, "google", "9223334418", EXC, "Excalibur Google", "BRL"), acc(US, "google", "9445556618", LOJA, "Loja US", "USD"));
  const camp = (n, account, client_id, platform_id, name, status) => ({ id: cid(n), ad_account_id: account, client_id, platform_id, external_id: `r${n}`, name, objective: null, status });
  db.campaigns.push(
    camp(1, META, EXC, "meta", "Leads Setembro", "ativa"),
    camp(2, META, EXC, "meta", "Remarketing", "pausada"),
    camp(3, GOOGLE, EXC, "google", "Pesquisa Marca", "ativa"),
    camp(4, US, LOJA, "google", "Loja US Search", "ativa"),
    camp(5, META, EXC, "meta", "Sem entrega", "ativa"),
  );
  // Métricas por campanha e por conta (mesmos números: uma linha de conta por campanha/dia).
  const m = (n, date, v) => {
    const c = db.campaigns.find((x) => x.id === cid(n));
    const a = db.adAccounts.find((x) => x.id === c.ad_account_id);
    const base = { date, ad_account_id: a.id, client_id: c.client_id, platform_id: c.platform_id, currency: a.currency,
      spend_micros: 0, impressions: 0, clicks: 0, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...v };
    db.metrics.push({ ...base, level: "campaign", campaign_id: c.id }, { ...base, level: "account", campaign_id: null });
  };
  m(1, day(-1), { spend_micros: 100 * M, impressions: 10000, clicks: 200, leads: 10, messages: 4 });
  m(1, day(-2), { spend_micros: 80 * M, impressions: 8000, clicks: 100, leads: 8 });
  m(2, day(-2), { spend_micros: 20 * M, impressions: 2000, clicks: 20, leads: 2 });
  m(3, day(-1), { spend_micros: 50 * M, impressions: 1000, clicks: 50, conversions: 5, conversion_value_micros: 500 * M });
  m(4, day(-1), { spend_micros: 30 * M, impressions: 3000, clicks: 30, conversions: 2 });
  m(1, day(-9), { spend_micros: 150 * M, impressions: 10000, clicks: 100, leads: 30 }); // período anterior
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const titles = (page) => page.getByTestId("report-table").evaluateAll((els) => els.map((e) => e.getAttribute("data-title")));
async function waitTitles(page, expected) {
  await page.waitForFunction((exp) => JSON.stringify([...document.querySelectorAll("[data-testid=report-table]")].map((e) => e.getAttribute("data-title"))) === JSON.stringify(exp), expected, { timeout: 6000 }).catch(() => {});
  return titles(page);
}
const table = (page, title) => page.locator(`[data-testid=report-table][data-title="${title}"]`);
async function download(page, name) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByTestId("report-actions").getByRole("button", { name, exact: true }).click()]);
  return { name: file.suggestedFilename(), data: await readFile(await file.path()) };
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  await page.getByRole("link", { name: /^Relatórios/ }).first().click();
  await page.getByRole("heading", { name: "Relatórios", level: 1 }).waitFor();

  const all = ["Resumo (BRL)", "Resumo (USD)", "Campanhas (BRL)", "Campanhas (USD)", "Dia a dia (BRL)", "Dia a dia (USD)"];
  check(JSON.stringify(await waitTitles(page, all)) === JSON.stringify(all), "uma tabela por parte e por moeda (BRL e USD nunca somados)");

  // Resumo com comparação
  const resumo = clean(await table(page, "Resumo (BRL)").innerText());
  check(resumo.includes("Investimento R$ 250,00 R$ 150,00 +66,7%"), `resumo: período, anterior e variação (${resumo.slice(0, 160)})`);
  check(resumo.includes("CPL R$ 12,50 R$ 5,00"), "CPL calculado");
  // Campanhas: a que mais investiu primeiro; sem dados no período não entra
  const camps = await table(page, "Campanhas (BRL)").locator("tbody tr").evaluateAll((rows) => rows.map((r) => r.querySelector("td").textContent));
  check(JSON.stringify(camps) === JSON.stringify(["Leads Setembro", "Pesquisa Marca", "Remarketing"]), `campanhas por investimento, sem linha zerada inventada (${camps})`);
  const leads = clean(await table(page, "Campanhas (BRL)").locator("tbody tr").first().innerText());
  check(leads.includes("Excalibur Fitness") && leads.includes("Meta Ads") && leads.includes("R$ 180,00") && leads.includes("—"), "linha da campanha: cliente, plataforma, investimento e vazio quando não informado");
  const dias = await table(page, "Dia a dia (BRL)").locator("tbody tr").count();
  check(dias === 2, "dia a dia: só os dias com dados");
  check(clean(await page.getByTestId("report-preview").innerText()).includes("Período:"), "cabeçalho com os filtros usados");
  await page.screenshot({ path: `${SHOTS}/180-relatorios.png`, fullPage: true });

  // Filtros: cliente e campanha
  await page.getByLabel("Cliente", { exact: true }).selectOption(EXC);
  const exc = ["Resumo (BRL)", "Campanhas (BRL)", "Dia a dia (BRL)"];
  check(JSON.stringify(await waitTitles(page, exc)) === JSON.stringify(exc), "filtro por cliente: só a moeda dele");
  await page.getByLabel("Campanha", { exact: true }).selectOption(cid(1));
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=report-table][data-title='Campanhas (BRL)'] tbody tr").length === 1, null, { timeout: 5000 }).catch(() => {});
  check(await table(page, "Campanhas (BRL)").locator("tbody tr").count() === 1, "filtro por campanha");
  await page.getByLabel("Plataforma", { exact: true }).selectOption("google");
  await page.getByLabel("Plataforma", { exact: true }).selectOption("");

  // Downloads (todos os dados, sem filtro de campanha)
  await page.getByRole("button", { name: /Limpar filtros/ }).click();
  await waitTitles(page, all);
  const csv = await download(page, "CSV");
  const csvText = csv.data.toString("utf8");
  check(csv.name.endsWith(".csv") && csvText.startsWith("﻿Relatório de desempenho"), `CSV baixado (${csv.name})`);
  check(csvText.includes("Leads Setembro;Excalibur Fitness;Meta Ads;Excalibur Meta;Ativa;180,00;18000"), "CSV: números em português, prontos para o Excel");

  const xlsx = await download(page, "Excel");
  const files = unzipSync(new Uint8Array(xlsx.data));
  const workbook = strFromU8(files["xl/workbook.xml"]);
  check(xlsx.name.endsWith(".xlsx") && ["Resumo", "Campanhas", "Dia a dia"].every((s) => workbook.includes(`name="${s}"`)), "Excel: arquivo .xlsx com 3 abas");
  check(strFromU8(files["xl/worksheets/sheet2.xml"]).includes("Loja US Search"), "Excel: campanhas das duas moedas (em tabelas separadas)");

  const pdf = await download(page, "PDF");
  await writeFile(`${SHOTS}/182-relatorio.pdf`, pdf.data);
  check(pdf.name.endsWith(".pdf") && pdf.data.subarray(0, 5).toString() === "%PDF-" && pdf.data.length > 3000, `PDF gerado (${pdf.data.length} bytes)`);

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check(overflow.sw <= overflow.vw, `no celular a página cabe na tela ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/181-relatorios-celular.png`, fullPage: true });
  await page.setViewportSize({ width: 1366, height: 820 });

  // Período sem dados: nada inventado e botões desligados
  await page.goto(`${BASE}/relatorios?periodo=custom&de=2020-01-01&ate=2020-01-07`);
  await page.getByTestId("report-empty").waitFor();
  check(await page.getByTestId("report-actions").getByRole("button", { name: "PDF", exact: true }).isDisabled(), "sem dados: nada para baixar");

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Operador gera relatórios; visualizador e cliente não
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "operador" });
  seed(db);
  await login(page, "/relatorios");
  await page.getByRole("heading", { name: "Relatórios", level: 1 }).waitFor();
  await waitTitles(page, ["Resumo (BRL)", "Resumo (USD)", "Campanhas (BRL)", "Campanhas (USD)", "Dia a dia (BRL)", "Dia a dia (USD)"]);
  check(await page.getByTestId("report-table").count() === 6, "operador gera relatórios");
  check(errors.length === 0, "sem erros (operador)");
  await browser.close();
}
for (const role of ["visualizador", "cliente"]) {
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role });
  seed(db);
  await login(page, "/relatorios");
  await page.waitForTimeout(1500);
  check(!(await page.getByRole("heading", { name: "Relatórios", level: 1 }).count()), `perfil ${role} não acessa relatórios`);
  const menu = await page.getByRole("navigation").first().innerText().catch(() => "");
  check(!menu.includes("Relatórios"), `perfil ${role} não vê "Relatórios" no menu`);
  await browser.close();
}

console.log("Relatórios: tudo certo.");
