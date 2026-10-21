/**
 * Teste de navegador da Etapa 39.5 — Inteligência de Resultados: exportação CSV/Excel
 * (sem dados pessoais) e a aba Qualidade dos dados (o que corrigir na planilha).
 * Supabase SIMULADO (support.mjs): a última leitura da planilha é montada aqui.
 */
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
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
  db.sheetsKey = { type: "service_account", client_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com" };
  Object.assign(db.sheetsSettings, { service_account_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com", has_key: true });
  const now = new Date().toISOString();
  db.riSources.push({ id: SOURCE, client_id: EXC, spreadsheet_id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", spreadsheet_title: "Leads Excalibur", sheet_name: "Leads", header_row: 1,
    mapping: { record_id: "ID", profile: "Tipo", ad_id: "Ad ID", campaign_name: "Campanha" },
    profile_rules: { lojista: "lojista", sacoleira: "sacoleiro", "consumidor final": "consumidor_final" }, enabled: true,
    read_status: "ok", last_attempt_at: now, last_success_at: now, last_error: null, consecutive_failures: 0, created_at: now, updated_at: now });
  const r = (n, h, d, p, extra = {}) => ({ n, k: `id:${n}`, h, d, p, ...extra });
  db.riSnapshots[SOURCE] = { read_at: now, trigger: "agendada", row_count: 11, stats: { total: 12, duplicates: 1 }, rows: [
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
    r(12, "h11", D2, "loja fisica", { cn: "Campanha Antiga" }),
  ] };
}

const clean = (s) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const download = async (page, button) => {
  const [d] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return { name: d.suggestedFilename(), data: readFileSync(await d.path()) };
};

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/inteligencia-resultados?cliente=${EXC}&aba=lojista`);
  await page.getByTestId("ri-tab-lojista").waitFor();
  const bar = page.getByTestId("ri-export");
  await bar.getByRole("button", { name: "CSV" }).and(page.locator(":enabled")).waitFor();

  // CSV dos lojistas
  const csv = await download(page, bar.getByRole("button", { name: "CSV" }));
  const text = csv.data.toString("utf8");
  check(csv.name === `inteligencia-excalibur-moda-lojistas-${sp(7)}-a-${sp(1)}.csv`, `nome do arquivo (${csv.name})`);
  check(text.includes("Cliente: Excalibur Moda") && text.includes("Perfil: Lojistas"), "CSV: cliente, período e perfil no cabeçalho");
  check(text.includes("Posição;Empate;Campanha;Lojistas"), "CSV: ranking de campanhas com posição e empate");
  check(/1;sim;Atacado SP;2;66,67;3;0\r?\n/.test(text) && !/Investimento|Custo por|Leads \(Meta\)/.test(text), "CSV: Atacado SP com %, sem investimento nem custo (só planilha)");
  check(text.includes("Conjunto") && text.includes("Lojistas 25-45") && text.includes("Video Vitrine"), "CSV: conjuntos e anúncios");
  check(!/h1|hash|90000/.test(text) && text.includes("Sem dados pessoais"), "CSV sem impressão digital, telefone ou nome");

  // Excel dos lojistas
  const xlsx = await download(page, bar.getByRole("button", { name: "Excel" }));
  const files = unzipSync(new Uint8Array(xlsx.data));
  const workbook = strFromU8(files["xl/workbook.xml"]);
  check(xlsx.name.endsWith(".xlsx") && ["Resumo", "Campanhas", "Conjuntos", "Anúncios"].every((n) => workbook.includes(`name="${n}"`)), "Excel com as abas Resumo, Campanhas, Conjuntos e Anúncios");
  check(strFromU8(files["xl/worksheets/sheet2.xml"]).includes("Revenda RJ"), "Excel: ranking na aba Campanhas");

  // Visão geral: todos os perfis
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await page.getByTestId("ri-overview").waitFor();
  const all = (await download(page, page.getByTestId("ri-export").getByRole("button", { name: "CSV" }))).data.toString("utf8");
  check(all.includes("Perfil: Todos os perfis") && all.includes("Lojistas;Sacoleiros;Consumidores finais;Não identificados"), "CSV de todos os perfis: uma coluna por perfil");

  // Qualidade dos dados
  await page.getByRole("button", { name: "Qualidade dos dados", exact: true }).click();
  await page.getByTestId("ri-quality").waitFor();
  check(page.url().includes("aba=qualidade"), "aba Qualidade no endereço");
  check(clean(await page.getByTestId("ri-q-rows").innerText()).includes("11"), "linhas da última leitura (todas as datas)");
  const problems = clean(await page.getByTestId("ri-q-problems").innerText());
  check(problems.includes("1 linha(s) com perfil escrito de um jeito que ainda não tem regra"), "valor de perfil sem regra");
  check(problems.includes("1 linha(s) com a coluna de perfil vazia"), "perfil vazio");
  check(problems.includes("1 linha(s) sem data"), "sem data");
  check(problems.includes("1 linha(s) com nome que existe mais de uma vez"), "nome ambíguo");
  check(problems.includes("1 linha(s) com origem que não existe no CRM"), "origem não encontrada");
  check(problems.includes("1 linha(s) com ID repetido"), "ID repetido (da leitura)");
  check(problems.includes("DD/MM/AAAA") && problems.includes("ID do anúncio"), "cada problema diz o que fazer");
  check(clean(await page.getByTestId("ri-q-unknown").innerText()).includes("“loja fisica” 1 linha(s)"), "lista os valores sem regra");
  const names = clean(await page.getByTestId("ri-q-names").innerText());
  check(names.includes("Campanha Antiga") && names.includes("Não encontrado no CRM") && names.includes("Duplicada") && names.includes("Nome ambíguo"), "nomes que não ligaram, com o motivo");
  await page.getByTestId("ri-q-nao-encontrada").getByRole("button", { name: "Ver linhas" }).click();
  await page.getByTestId("ri-records-rows").waitFor();
  const rec = clean(await page.getByTestId("ri-records").innerText());
  check(rec.includes("Todas as datas") && rec.includes("“Campanha Antiga”"), "ver linhas de todas as datas");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/39.5-qualidade.png`, fullPage: true });
  await page.getByTestId("ri-q-sem-regra").getByRole("button", { name: "Editar as regras dos perfis" }).click();
  await page.getByTestId("ri-setup").waitFor();
  check(true, "atalho para editar as regras dos perfis");

  await page.goto(`${BASE}/inteligencia-resultados?cliente=${EXC}&aba=qualidade`);
  await page.getByTestId("ri-quality").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular não há rolagem para o lado");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ------------------------------------------------------------ visualizador: vê e exporta, não edita
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC, created_at: "" });
  await login(page, `/inteligencia-resultados?cliente=${EXC}&aba=qualidade`);
  await page.getByTestId("ri-quality").waitFor();
  check(await page.getByRole("button", { name: "Editar as regras dos perfis" }).count() === 0
    && (await page.getByTestId("ri-q-sem-regra").innerText()).includes("Peça a um administrador"), "visualizador vê a qualidade, sem editar regras");
  await page.getByRole("button", { name: "Sacoleiros", exact: true }).click();
  await page.getByTestId("ri-tab-sacoleiro").waitFor();
  check(await page.getByTestId("ri-export").getByRole("button", { name: "Excel" }).count() === 1, "visualizador pode exportar");
  check(errors.length === 0, "sem erros no navegador (visualizador)");
  await browser.close();
}

console.log(`\nInteligência de Resultados 39.5: tudo certo (${BASE}).`);
