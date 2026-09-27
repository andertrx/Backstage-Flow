/**
 * Teste de navegador da Etapa 19.3 — "Quem viu e onde" no dashboard do
 * cliente: idade, gênero, plataforma, aparelho, horário e localização.
 * Supabase SIMULADO (support.mjs). Datas relativas a "hoje" em São Paulo.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (o) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const br = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000001931";
const META = "a0000000-0000-4000-8000-000000001931";
const GOOGLE = "a0000000-0000-4000-8000-000000001932";

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  const acc = (id, platform_id, external_id, name) => ({ id, platform_id, external_id, client_id: EXC, name, currency: "BRL", status: "ativa", unlinked_at: null,
    connection_id: null, timezone: null, raw_status: null, status_reason: null, business_name: null, is_prepay: null, linked_at: "2026-09-01T12:00:00Z", details_updated_at: null, assets: [] });
  db.adAccounts.push(acc(META, "meta", "931", "Excalibur Meta"), acc(GOOGLE, "google", "9310000000", "Excalibur Google"));
  const base = { reach: null, level: "account", campaign_id: null, messages: null, conversion_value_micros: null, raw_actions: null, client_id: EXC, currency: "BRL" };
  db.metrics.push(
    { ...base, ad_account_id: META, platform_id: "meta", date: day(-1), spend_micros: 100 * M, impressions: 10000, clicks: 300, link_clicks: 200, leads: 10, conversions: null },
    { ...base, ad_account_id: GOOGLE, platform_id: "google", date: day(-1), spend_micros: 40 * M, impressions: 2000, clicks: 80, link_clicks: null, leads: null, conversions: 4 },
  );
  const b = (date, dimension, value, spend, leads, extra = {}) => ({
    date, ad_account_id: META, client_id: EXC, platform_id: "meta", currency: "BRL", dimension, value, spend_micros: spend * M, impressions: spend * 100,
    clicks: spend * 3, link_clicks: spend * 2, leads, messages: 0, conversions: 0, conversion_value_micros: 0, actions: { lead: leads }, ...extra,
  });
  db.breakdowns.push(
    b(day(-1), "age", "35-44", 40, 6), b(day(-1), "age", "18-24", 25, 1), b(day(-1), "age", "unknown", 5, 0), b(day(-1), "age", "25-34", 30, 3),
    b(day(-1), "gender", "female", 60, 7), b(day(-1), "gender", "male", 40, 3),
    b(day(-1), "publisher_platform", "instagram", 70, 8), b(day(-1), "publisher_platform", "facebook", 30, 2),
    b(day(-1), "device", "mobile_app", 90, 9), b(day(-1), "device", "desktop", 10, 1),
    b(day(-1), "hour", "20", 60, 7), b(day(-1), "hour", "09", 40, 3),
    ...Array.from({ length: 13 }, (_, i) => b(day(-1), "region", `Estado ${String.fromCharCode(65 + i)}`, 13 - i, 1)),
  );
  // Meta: guardado a partir de 3 dias atrás (período de 7 dias fica parcial). Google: nunca buscado.
  db.breakdownCoverage.push({ ad_account_id: META, covered_from: day(-3), covered_to: day(0) });
}
const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texts = (loc) => loc.evaluateAll((els) => els.map((e) => `${e.children[0].textContent} ${e.children[2].textContent}`.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()));

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${EXC}/dashboard`);
  await page.getByTestId("report-breakdowns").waitFor();
  const meta = page.getByRole("region", { name: "Conta Excalibur Meta" });
  const bd = meta.getByTestId("report-breakdowns");

  const call = db.rpcCalls.find((c) => c.fn === "client_report_breakdowns");
  check(call.p_from === day(-7) && call.p_to === day(-1), "divisões do mesmo período do dashboard");
  check((await bd.getByRole("button", { name: "Leads" }).getAttribute("aria-pressed")) === "true", "abre mostrando o resultado principal (Leads)");

  const age = await texts(bd.getByTestId("breakdown-age").getByTestId("breakdown-item"));
  check(JSON.stringify(age.map((t) => t.split(" ")[0])) === JSON.stringify(["18-24", "25-34", "35-44", "Não"]), `idade na ordem das faixas, não informado por último (${age})`);
  check(age[2].startsWith("35-44 6 60%"), `valor e fatia (${age[2]})`);
  const ageTitle = clean(await bd.getByTestId("breakdown-age").getByTestId("breakdown-item").nth(2).getAttribute("title"));
  check(ageTitle === "Investimento R$ 40,00 · Leads 6 · Custo por resultado R$ 6,67 · CTR 2,00%", `detalhe ao passar o mouse (${ageTitle})`);

  const gender = await texts(bd.getByTestId("breakdown-gender").getByTestId("breakdown-item"));
  check(gender[0].startsWith("Mulheres 7 70%") && gender[1].startsWith("Homens 3"), `gênero em português (${gender})`);
  check((await texts(bd.getByTestId("breakdown-publisher_platform").getByTestId("breakdown-item")))[0].startsWith("Instagram 8"), "Facebook × Instagram");
  check((await texts(bd.getByTestId("breakdown-device").getByTestId("breakdown-item")))[0].startsWith("Celular (aplicativo)"), "aparelho em português");

  const regions = await texts(bd.getByTestId("breakdown-region").getByTestId("breakdown-item"));
  check(regions.length === 11 && regions[10].startsWith("Outros (3)"), `estados: 10 maiores + Outros (${regions.length})`);

  check(await bd.getByTestId("breakdown-hour").count() === 24, "horário com as 24 horas");
  await bd.getByTestId("breakdown-hour").nth(20).hover();
  check(clean(await bd.getByTestId("breakdown-hour-panel").innerText()).includes("20h: 7"), "hora com o valor exato ao passar o mouse");

  check((await bd.getByTestId("breakdown-partial").innerText()).includes(br(day(-3))), "avisa que o período é só parcialmente coberto");
  check((await bd.innerText()).includes("A localização vem por estado"), "nota: localização por estado");

  // Trocar a métrica
  await bd.getByRole("button", { name: "Investimento" }).click();
  const ageSpend = await texts(bd.getByTestId("breakdown-age").getByTestId("breakdown-item"));
  check(ageSpend[2].startsWith("35-44 R$ 40,00 40%"), `métrica investimento (${ageSpend[2]})`);

  // Conta sem divisões ainda
  const google = page.getByRole("region", { name: "Conta Excalibur Google" });
  check((await google.getByTestId("breakdown-empty").innerText()).includes("Ainda não temos as divisões"), "conta sem divisões: aviso claro, sem números inventados");
  await page.screenshot({ path: `${SHOTS}/client-breakdowns.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `celular sem rolagem lateral (${overflow}px)`);
  await page.setViewportSize({ width: 1366, height: 820 });

  // Seção desligada no modelo
  db.reportSettings.push({ client_id: EXC, title: "Resultados", subtitle: null, main_result: { source: "leads", label: "Leads" }, kpis: ["spend"],
    sections: { breakdowns: false }, default_period: "last_7_days", agency_notes: null, next_steps: null });
  const before = db.rpcCalls.filter((c) => c.fn === "client_report_breakdowns").length;
  await page.goto(`${BASE}/clientes/${EXC}/dashboard`);
  await page.getByTestId("report-account").first().waitFor();
  await page.waitForTimeout(500);
  check(await page.getByTestId("report-breakdowns").count() === 0, "seção desligada no modelo não aparece");
  check(db.rpcCalls.filter((c) => c.fn === "client_report_breakdowns").length === before, "e nem consulta o banco");

  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
console.log("Divisões do dashboard: tudo certo.");
