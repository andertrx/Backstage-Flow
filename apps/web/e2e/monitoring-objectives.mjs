/**
 * Teste de navegador — Monitoramento: filtro de objetivo da campanha (vários objetivos, salvo por pessoa,
 * vale para todas as abas, volta sozinho em outro aparelho). Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000000901";
const CAMPS = [
  ["c0000000-0000-4000-8000-000000000901", "Vendas Loja", "OUTCOME_SALES", "critico"],
  ["c0000000-0000-4000-8000-000000000902", "Cadastro EndForm", "OUTCOME_LEADS", "atencao"],
  ["c0000000-0000-4000-8000-000000000903", "WhatsApp Conversas", "OUTCOME_ENGAGEMENT", "critico"],
  ["c0000000-0000-4000-8000-000000000904", "Tráfego Blog", "LINK_CLICKS", "atencao"],
];

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "" });
  db.adAccounts.push({ id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] });
  db.syncState[META] = { status: "sucesso", last_success_at: ago(20), history_from: day(-60), history_to: day(-1) };
  CAMPS.forEach(([id, name, objective, severity], i) => {
    db.campaigns.push({ id, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: `c${i}`, name, objective, status: "ativa" });
    db.monitorAlerts.push({
      id: i + 1, kind: "limite", level: "campaign", metric: "cpc", severity, status: "novo", version: 1, client_id: EXC, platform_id: "meta",
      ad_account_id: META, campaign_id: id, ad_id: null, currency: "BRL", current_value: 1, previous_value: 0.5, variation_pct: 100,
      period_from: day(-7), period_to: day(-1), prev_from: day(-14), prev_to: day(-8), attention_pct: 20, critical_pct: 40,
      explanation: "CPC: alta de 100,0%.", context: [], details: {}, detections: 1, first_detected_at: ago(120), last_detected_at: ago(10),
      recurrence_of: null, recurrence_count: 0, resolved_at: null, resolution: null, assigned_to: null, task_id: null,
    });
    for (let d = 1; d <= 14; d++) {
      db.metrics.push({ date: day(-d), level: "campaign", client_id: EXC, platform_id: "meta", currency: "BRL", superseded: false,
        ad_account_id: META, campaign_id: id, ad_group_id: null, ad_id: null,
        spend_micros: (i + 1) * 10_000_000, impressions: 1000, clicks: 50, link_clicks: 40, leads: 2, messages: null, conversions: null, conversion_value_micros: null });
    }
  });
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const pressed = async (page, label) => (await page.getByTestId("filtro-objetivo").getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed")) === "true";

let saved;
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/monitoramento");
  await page.getByTestId("filtro-objetivo").waitFor();
  check(await pressed(page, "Todos"), "começa com Todos (nada salvo)");
  await page.getByTestId("abertos-critico").waitFor();
  check((await text(page.getByTestId("abertos-critico"))).includes("2"), "Visão geral sem filtro: 2 críticos");

  // Escolhe Vendas e Leads
  await page.getByTestId("filtro-objetivo").getByRole("button", { name: "Vendas", exact: true }).click();
  await page.getByTestId("filtro-objetivo").getByRole("button", { name: "Leads (cadastros)", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=abertos-critico]")?.textContent.includes("1"), null, { timeout: 5000 }).catch(() => {});
  check(JSON.stringify(db.monitorViewPrefs?.[USER_ID]) === JSON.stringify(["leads", "vendas"]), "filtro salvo no banco (Vendas + Leads)");
  check(await pressed(page, "Vendas") && await pressed(page, "Leads (cadastros)") && !(await pressed(page, "Todos")), "dois objetivos marcados ao mesmo tempo");
  check((await text(page.getByTestId("abertos-critico"))).includes("1") && (await text(page.getByTestId("abertos-atencao"))).includes("1"), "Visão geral filtrada: 1 crítico e 1 de atenção");
  check(await page.getByTestId("alerta-urgente").count() === 2, "Mais urgentes: só Vendas e Leads");
  await page.screenshot({ path: `${SHOTS}/objetivo-visao-geral.png` });

  // Alertas
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=alerta]").length === 2, null, { timeout: 5000 }).catch(() => {});
  const list = await text(page.locator("main"));
  check(await page.getByTestId("alerta").count() === 2 && list.includes("Vendas Loja") && list.includes("Cadastro EndForm") && !list.includes("WhatsApp Conversas"), "Alertas: só as campanhas de Vendas e Leads");

  // Campanhas
  await page.getByRole("tab", { name: "Campanhas" }).click();
  await page.getByText("Vendas Loja").first().waitFor();
  const camp = await text(page.locator("main"));
  check(camp.includes("Cadastro EndForm") && !camp.includes("Tráfego Blog") && !camp.includes("WhatsApp Conversas"), "Campanhas: só Vendas e Leads");
  check(db.rpcCalls.some((c) => c.fn === "monitor_compare" && JSON.stringify([...(c.p_objectives ?? [])].sort()) === JSON.stringify(["leads", "vendas"])), "comparação pede os objetivos ao banco");

  // Histórico
  await page.getByRole("tab", { name: "Histórico" }).click();
  await page.getByTestId("hist-criados").waitFor();
  check((await text(page.getByTestId("hist-criados"))).match(/criados\s*2/i) !== null, "Histórico: 2 alertas criados (Vendas + Leads)");

  // Engajamento sozinho
  await page.getByTestId("filtro-objetivo").getByRole("button", { name: "Vendas", exact: true }).click();
  await page.getByTestId("filtro-objetivo").getByRole("button", { name: "Leads (cadastros)", exact: true }).click();
  check(await pressed(page, "Todos"), "desmarcar tudo volta para Todos");
  await page.getByTestId("filtro-objetivo").getByRole("button", { name: "Engajamento (conversas)", exact: true }).click();
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=alerta]").length === 1, null, { timeout: 5000 }).catch(() => {});
  check(await page.getByTestId("alerta").count() === 1 && (await text(page.getByTestId("alerta").first())).includes("WhatsApp Conversas"), "Engajamento: só a campanha de conversas");

  // Configurações não mostra o filtro
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page.getByTestId("prefs-form").waitFor();
  check(await page.getByTestId("filtro-objetivo").count() === 0, "Configurações não tem o filtro de objetivo");

  // A faixa do dashboard continua mostrando tudo
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await page.getByTestId("monitor-shortcut").waitFor();
  check((await text(page.getByTestId("monitor-shortcut"))).includes("2 críticos"), "faixa do dashboard continua com todos os objetivos");

  // Volta com Vendas + Leads para o teste de outro aparelho
  await page.getByRole("link", { name: "Monitoramento" }).first().click();
  await page.getByTestId("filtro-objetivo").getByRole("button", { name: "Engajamento (conversas)", exact: true }).click();
  await page.getByTestId("filtro-objetivo").getByRole("button", { name: "Vendas", exact: true }).click();
  await page.getByTestId("filtro-objetivo").getByRole("button", { name: "Leads (cadastros)", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=filtro-objetivo] [aria-pressed=true]").length === 2, null, { timeout: 5000 }).catch(() => {});
  saved = db.monitorViewPrefs;
  check(JSON.stringify(saved?.[USER_ID]) === JSON.stringify(["leads", "vendas"]), "filtro salvo de novo (Vendas + Leads)");
  check(errors.length === 0, `sem erros ${errors.join(" | ")}`);
  await browser.close();
}

// Outro aparelho (novo navegador, mesmo banco): o filtro volta sozinho.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.monitorViewPrefs = saved;
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "/monitoramento");
  await page.getByTestId("filtro-objetivo").waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=filtro-objetivo] [aria-pressed=true]").length === 2, null, { timeout: 5000 }).catch(() => {});
  check(await pressed(page, "Vendas") && await pressed(page, "Leads (cadastros)"), "em outro aparelho, Vendas e Leads já vêm marcados");
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=alerta]").length === 2, null, { timeout: 5000 }).catch(() => {});
  check(await page.getByTestId("alerta").count() === 2, "e a lista já vem filtrada");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `celular sem rolagem lateral (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/objetivo-celular.png` });
  check(errors.length === 0, "sem erros (outro aparelho)");
  await browser.close();
}
