/**
 * Teste de navegador da Etapa 19.2 — acesso do cliente ao dashboard:
 * login (papel cliente) e link secreto, cada um com liga/desliga.
 * Supabase SIMULADO (support.mjs). Datas relativas a "hoje" em São Paulo.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (o) => new Date(Date.parse(`${today}T00:00:00Z`) + o * 86_400_000).toISOString().slice(0, 10);
const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000001921";
const META = "a0000000-0000-4000-8000-000000001921";

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  db.adAccounts.push({ id: META, platform_id: "meta", external_id: "921", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null,
    connection_id: null, timezone: null, raw_status: null, status_reason: null, business_name: null, is_prepay: null, linked_at: "2026-09-01T12:00:00Z", details_updated_at: null, assets: [] });
  const base = { ad_account_id: META, client_id: EXC, platform_id: "meta", currency: "BRL", reach: null, level: "account", campaign_id: null,
    impressions: 10000, clicks: 300, link_clicks: 200, messages: null, conversions: null, conversion_value_micros: null, raw_actions: null };
  db.metrics.push({ ...base, date: day(-1), spend_micros: 100 * M, leads: 10 }, { ...base, date: day(-20), spend_micros: 50 * M, leads: 5 });
  db.reportSettings.push({ client_id: EXC, title: "Resultados Excalibur", subtitle: null, main_result: { source: "leads", label: "Leads" },
    kpis: ["spend", "main_result", "cost_per_result"], sections: {}, default_period: "last_7_days", agency_notes: "Semana boa.", next_steps: null, updated_by: USER_ID });
}
const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

let savedLink;
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${EXC}`);
  const card = page.getByTestId("client-portal-card");
  await card.waitFor();
  const loginSwitch = card.getByRole("switch", { name: "Login do cliente" });
  const linkSwitch = card.getByRole("switch", { name: "Link secreto" });
  check((await loginSwitch.getAttribute("aria-checked")) === "false" && (await linkSwitch.getAttribute("aria-checked")) === "false", "começa tudo desligado");
  check(await linkSwitch.isDisabled(), "link não liga antes de ser gerado");
  check((await card.getByTestId("portal-client-users").innerText()).includes("Nenhum usuário com papel Cliente"), "explica como criar o login do cliente");

  // Gerar o link (30 dias)
  await card.getByLabel("Validade do link").selectOption("30");
  await card.getByRole("button", { name: "Gerar link" }).click();
  await card.getByTestId("portal-fresh-link").waitFor();
  savedLink = await card.getByLabel("Link do cliente").inputValue();
  check(/\/r\/[A-Za-z0-9_-]{43}$/.test(savedLink), `link com código secreto de 43 caracteres (${savedLink.replace(/[^/]+$/, "…")})`);
  check((await card.getByTestId("portal-fresh-link").innerText()).includes("só aparece desta vez"), "avisa que o link completo só aparece uma vez");
  await page.waitForFunction(() => document.querySelector("[role=switch][aria-label='Link secreto']")?.getAttribute("aria-checked") === "true");
  check(true, "gerar o link já liga o link");
  check((await card.getByTestId("portal-link-info").innerText()).includes("Validade: até"), "mostra a validade");
  check(db.rpcCalls.some((c) => c.fn === "client_portal_new_link" && c.p_valid_days === 30), "validade de 30 dias enviada");

  // Ligar o login
  await loginSwitch.click();
  await page.waitForFunction(() => document.querySelector("[role=switch][aria-label='Login do cliente']")?.getAttribute("aria-checked") === "true");
  check(db.portals[EXC].login_enabled === true, "login do cliente ligado");
  await page.screenshot({ path: `${SHOTS}/client-portal-card.png`, fullPage: true });

  // Abrir o link numa janela sem login
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "pt-BR" });
  const pub = await ctx2.newPage();
  const pubErrors = [];
  pub.on("pageerror", (e) => pubErrors.push(e.message));
  await mockSupabaseShared(pub, db);
  await pub.goto(savedLink);
  await pub.getByTestId("report-title").waitFor();
  check(clean(await pub.getByTestId("report-title").innerText()) === "Resultados Excalibur", "link abre o dashboard sem login");
  check((await pub.getByTestId("report-period").innerText()).startsWith("Últimos 7 dias"), "abre nos últimos 7 dias");
  check(clean(await pub.getByTestId("report-summary").innerText()).startsWith("Foram investidos R$ 100,00 e gerados 10 leads"), "resumo com os números do cliente");
  check(await pub.getByTestId("sidebar").count() === 0 && await pub.getByRole("button", { name: "Personalizar" }).count() === 0, "sem menu interno e sem Personalizar");
  check(await pub.getByRole("button", { name: "Baixar PDF" }).count() === 1, "cliente pode baixar o PDF");
  check((await pub.locator('meta[name="robots"]').getAttribute("content")) === "noindex, nofollow", "página não aparece em buscadores");
  check((await pub.getByTestId("report-notes").innerText()).includes("Semana boa."), "análise da agência aparece");
  await pub.getByRole("button", { name: "Últimos 30 dias" }).click();
  await pub.waitForFunction(() => document.querySelector("[data-testid=report-period]")?.textContent.startsWith("Últimos 30 dias"));
  check(clean(await pub.getByTestId("report-summary").innerText()).startsWith("Foram investidos R$ 150,00"), "trocar o período pelo link funciona");
  check(db.rpcCalls.some((c) => c.fn === "client_report_public" && c.p_period === "last_30_days"), "período enviado ao servidor (datas no fuso do cliente)");
  await pub.screenshot({ path: `${SHOTS}/client-portal-public.png`, fullPage: true });

  // Aberturas contadas
  await page.reload();
  await card.getByTestId("portal-link-info").waitFor();
  check((await card.getByTestId("portal-link-info").innerText()).includes("Aberturas: 2"), "conta as aberturas do link");
  check(!(await card.getByTestId("portal-fresh-link").count()), "depois de recarregar, o link completo não aparece de novo");

  // Desligar o link: para na hora
  await linkSwitch.click();
  await page.waitForFunction(() => document.querySelector("[role=switch][aria-label='Link secreto']")?.getAttribute("aria-checked") === "false");
  await pub.goto(savedLink);
  await pub.getByTestId("public-report-error").waitFor();
  check((await pub.getByTestId("public-report-error").innerText()).includes("não existe mais ou foi desativado"), "link desligado: mensagem clara, sem dados");

  // Religar e trocar o link: o antigo para, o novo funciona
  await linkSwitch.click();
  await page.waitForFunction(() => document.querySelector("[role=switch][aria-label='Link secreto']")?.getAttribute("aria-checked") === "true");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Gerar novo link" }).click();
  await card.getByTestId("portal-fresh-link").waitFor();
  const newLink = await card.getByLabel("Link do cliente").inputValue();
  check(newLink !== savedLink, "novo link diferente do anterior");
  await pub.goto(savedLink);
  await pub.getByTestId("public-report-error").waitFor();
  check(true, "link antigo parou de funcionar");
  await pub.goto(newLink);
  await pub.getByTestId("report-title").waitFor();
  check(true, "link novo funciona");
  await pub.goto(`${BASE}/r/codigo-inventado`);
  await pub.getByTestId("public-report-error").waitFor();
  check(true, "código inventado não abre nada");

  check(errors.length === 0 && pubErrors.length === 0, `sem erros no navegador (${[...errors, ...pubErrors].join(" | ")})`);
  await ctx2.close();
  await browser.close();
}

/** Mesma "base" simulada numa segunda janela (sem login). */
async function mockSupabaseShared(page, db) {
  const { createMockBackend } = await import("../src/demo/mockBackend.js");
  const handle = createMockBackend(db, { role: "anon" });
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "*" };
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: cors });
    const r = await handle({ url: req.url(), method: req.method(), body: req.postData() });
    return route.fulfill(r.body === undefined
      ? { status: r.status, headers: cors }
      : { status: r.status, headers: cors, contentType: "application/json", body: r.body });
  });
}

// Papel cliente: login desligado → aviso; ligado → vai direto para o painel dele
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "cliente" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC, created_at: "" });
  await login(page, "/");
  await page.getByTestId("client-home-off").waitFor();
  check((await page.getByTestId("client-home-off").innerText()).includes("Fale com a agência"), "login desligado: cliente não vê dados");
  db.portals[EXC] = { client_id: EXC, login_enabled: true, link_enabled: false, link_created_at: null, link_expires_at: null, link_last_used_at: null, link_uses: 0 };
  await page.goto(`${BASE}/`);
  await page.waitForURL(`**/clientes/${EXC}/dashboard`);
  await page.getByTestId("report-summary").waitFor();
  check(true, "login ligado: cliente vai direto para o dashboard da empresa");
  check(await page.getByRole("button", { name: "Personalizar" }).count() === 0, "cliente não personaliza");
  check(await page.getByRole("link", { name: /Excalibur Fitness/ }).count() === 0, "cliente não vê o link para a ficha interna");
  const nav = await page.getByTestId("sidebar").getByRole("link").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check(JSON.stringify(nav) === JSON.stringify(["Dashboard"]), `menu do cliente só com Dashboard (${nav})`);
  await page.goto(`${BASE}/executivo`);
  await page.waitForURL(`**/clientes/${EXC}/dashboard`);
  check(true, "cliente não abre telas internas (volta para o painel dele)");
  check(errors.length === 0, `cliente sem erros (${errors.join(" | ")})`);
  await browser.close();
}

// Operador: vê o dashboard, mas não mexe no acesso
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "operador" });
  seed(db);
  await login(page, `/clientes/${EXC}`);
  await page.getByRole("heading", { name: "Excalibur Fitness" }).waitFor();
  await page.waitForTimeout(500);
  check(await page.getByTestId("client-portal-card").count() === 0, "operador não vê os interruptores de acesso");
  check(errors.length === 0, "operador sem erros");
  await browser.close();
}
console.log("Acesso do cliente: tudo certo.");
