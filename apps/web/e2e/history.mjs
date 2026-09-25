/**
 * Teste de navegador da Etapa 23 — Histórico.
 * Supabase SIMULADO (support.mjs). A regra real (cobertura, importação do passado,
 * conta vinculada de novo) é testada em supabase/tests/etapa23_history.sql.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const clean = (s) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const ymShift = (n) => {
  const [y, m] = today.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const LAST = ymShift(-1); // mês passado
const TWO = ymShift(-2); // dois meses atrás
const THREE = ymShift(-3); // três meses atrás (ainda não importado)
const br = (d) => d.split("-").reverse().join("/");
const monthName = (ym) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000000a01";
const GOOGLE = "a0000000-0000-4000-8000-000000000a02";

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.adAccounts.push(
    { id: META, platform_id: "meta", external_id: "1001", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] },
    { id: GOOGLE, platform_id: "google", external_id: "1234567890", client_id: EXC, name: "Excalibur Google", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] },
  );
  const m = (account, platform, date, v) => db.metrics.push({ date, level: "account", ad_account_id: account, client_id: EXC, platform_id: platform, currency: "BRL",
    spend_micros: 0, impressions: 0, clicks: 0, leads: null, messages: null, conversions: null, conversion_value_micros: null, ...v });
  m(META, "meta", `${LAST}-05`, { spend_micros: 60 * M, impressions: 6000, clicks: 60, leads: 6 });
  m(META, "meta", `${LAST}-06`, { spend_micros: 40 * M, impressions: 4000, clicks: 40, leads: 4 });
  m(GOOGLE, "google", `${LAST}-22`, { spend_micros: 50 * M, impressions: 1000, clicks: 30, conversions: 2 });
  m(META, "meta", `${TWO}-10`, { spend_micros: 80 * M, impressions: 8000, clicks: 80, leads: 4 });
  // Meta: histórico desde 2 meses atrás. Google: só desde o dia 20 do mês passado (importando).
  db.coverage[META] = { history_from: `${TWO}-01`, history_to: today };
  db.coverage[GOOGLE] = { history_from: `${LAST}-20`, history_to: today, importing: true };
}

const answer = (page) => page.getByTestId("history-sentence");

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { level: 1 }).first().waitFor();

  // Entrada pelo Dashboard, levando o cliente escolhido
  await page.goto(`${BASE}/?cliente=${EXC}`);
  await page.getByRole("link", { name: "Histórico por mês" }).click();
  await page.waitForURL((u) => u.pathname === "/historico" && u.searchParams.get("cliente") === EXC);
  await page.getByRole("heading", { name: "Histórico", level: 1 }).waitFor();
  check(true, "link \"Histórico por mês\" no Dashboard, com o mesmo cliente");
  await page.waitForFunction(() => document.title === "Histórico · Backstage Flow");
  check(true, "título da aba: Histórico");

  // Padrão: mês passado. Google só tem histórico desde o dia 20 → resposta parcial, com aviso
  await answer(page).waitFor();
  const warning = page.getByTestId("coverage-warning");
  await warning.waitFor();
  const w = clean(await warning.innerText());
  check(w.includes("Resposta parcial") && w.includes(`Excalibur Google desde ${br(`${LAST}-20`)}`), `mês passado: aviso de resposta parcial dizendo qual conta (${w.slice(0, 120)})`);
  const s1 = clean(await answer(page).innerText());
  check(s1 === `Em ${monthName(LAST)}, Excalibur Fitness investiu R$ 150,00, teve 10 leads e CPL de R$ 15,00.`, `resposta em frase: ${s1}`);
  const kpis = await page.getByTestId("history-kpis").innerText();
  check(kpis.includes("Investimento") && kpis.includes("CPL") && kpis.includes("Conversões"), "cards com os números do mês");
  await page.screenshot({ path: `${SHOTS}/230-historico.png`, fullPage: true });

  // "Quanto a conta gastou em agosto?" — só a conta Meta (histórico completo)
  await page.getByRole("combobox", { name: /^Conta\b/ }).selectOption(META);
  await page.waitForFunction(() => document.querySelector("[data-testid=history-sentence]")?.textContent?.includes("Excalibur Meta"));
  const s2 = clean(await answer(page).innerText());
  check(s2 === `Em ${monthName(LAST)}, a conta Excalibur Meta investiu R$ 100,00, teve 10 leads e CPL de R$ 10,00.`, `pergunta por conta: ${s2}`);
  check(await page.getByTestId("coverage-warning").count() === 0, "conta com histórico completo: sem aviso");

  // Mês a mês: 13 meses; dois meses atrás com dados; três meses atrás sem histórico
  const rows = page.getByTestId("history-month-row");
  check(await rows.count() === 13, "tabela mês a mês com 13 meses");
  const two = clean(await page.locator(`[data-testid=history-month-row][data-month="${TWO}"]`).innerText());
  check(two.includes("R$ 80,00") && two.includes("R$ 20,00"), `mês com dados: investimento e CPL (${two})`);
  const three = clean(await page.locator(`[data-testid=history-month-row][data-month="${THREE}"]`).innerText());
  check(three.includes("sem histórico") && !three.includes("R$"), `mês ainda não importado: "sem histórico", sem número inventado (${three})`);

  // Clicar num mês = perguntar sobre ele
  await page.locator(`[data-testid=history-month-row][data-month="${THREE}"]`).click();
  await page.waitForURL((u) => u.searchParams.get("mes") === THREE);
  await page.waitForFunction(() => document.querySelector("[data-testid=history-sentence]")?.textContent?.includes("não disponível"));
  check(clean(await answer(page).innerText()) === `Em ${monthName(THREE)}: informação ainda não disponível no histórico.`, "mês sem histórico: diz que não há informação (não mostra zero)");
  check(clean(await page.getByTestId("coverage-warning").innerText()).includes("Ainda não temos o histórico"), "aviso de histórico ainda não importado");
  check(await page.getByTestId("history-kpis").count() === 0, "sem cards de números quando não há histórico");

  // Um período livre
  await page.getByRole("radio", { name: "Um período" }).click();
  await page.getByLabel("De").fill(`${TWO}-01`);
  await page.getByLabel("Até").fill(`${TWO}-28`);
  await page.waitForFunction((d) => document.querySelector("[data-testid=history-sentence]")?.textContent?.includes(d), br(`${TWO}-01`));
  const s3 = clean(await answer(page).innerText());
  check(s3 === `De ${br(`${TWO}-01`)} a ${br(`${TWO}-28`)}, a conta Excalibur Meta investiu R$ 80,00, teve 4 leads e CPL de R$ 20,00.`, `pergunta por período livre: ${s3}`);

  // Histórico guardado: por conta, com progresso da importação
  const cov = clean(await page.getByTestId("history-coverage").innerText());
  check(cov.includes(`Histórico de ${br(`${TWO}-01`)} até ${br(today)}`) && cov.includes("Importando o passado"), "cada conta mostra até onde vai o histórico");
  const progress = clean(await page.getByTestId("history-progress").innerText());
  check(/Importação do passado: \d+% dos últimos 13 meses\./.test(progress), `progresso da importação (${progress})`);

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/historico?cliente=${EXC}`);
  await answer(page).waitFor();
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check(o.sw <= o.vw, `no celular a página cabe na tela ${JSON.stringify(o)}`);
  await page.screenshot({ path: `${SHOTS}/231-historico-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- perfis
for (const [role, allowed] of [["visualizador", true], ["cliente", false]]) {
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.goto(`${BASE}/historico`);
  await page.waitForFunction(() => location.pathname !== "/historico" || document.querySelector("h1")?.textContent === "Histórico", null, { timeout: 5000 }).catch(() => {});
  const at = new URL(page.url()).pathname;
  check(allowed ? at === "/historico" : at === "/", `${role}: ${allowed ? "pode" : "não pode"} abrir o Histórico (${at})`);
  if (!allowed) check(!db.rpcCalls.some((c) => c.fn === "history_coverage"), "cliente: cobertura nem é pedida ao banco");
  check(errors.length === 0, `${role}: sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

console.log("Histórico: tudo certo.");
