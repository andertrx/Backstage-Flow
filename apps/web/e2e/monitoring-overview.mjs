/**
 * Teste de navegador da Etapa 37.6 — Monitoramento: Visão geral (com você, sem responsável, mais urgentes,
 * por cliente), aba Histórico, filtros no endereço e os blocos no dashboard, ficha do cliente e visões Meta/Google.
 * Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const BRAVO = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000901";
const GOOG = "a0000000-0000-4000-8000-000000000902";
const C1 = "c0000000-0000-4000-8000-000000000901";
const C2 = "c0000000-0000-4000-8000-000000000902";
const MARIA = "22222222-2222-2222-2222-222222222222";

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const alert = (id, o) => ({
  id, kind: "limite", level: "campaign", metric: "cost_per_result", severity: "critico", status: "novo", version: 1, client_id: EXC, platform_id: "meta",
  ad_account_id: META, campaign_id: C1, ad_id: null, currency: "BRL", current_value: 5, previous_value: 2, variation_pct: 150,
  period_from: day(-7), period_to: day(-1), prev_from: day(-14), prev_to: day(-8), attention_pct: 20, critical_pct: 40,
  explanation: "Custo por resultado: alta de 150,0%.", context: [], details: {}, detections: 1, first_detected_at: ago(120), last_detected_at: ago(10),
  recurrence_of: null, recurrence_count: 0, resolved_at: null, resolution: null, assigned_to: null, task_id: null, ...o,
});

function seed(db) {
  const client = (id, name) => ({ id, name, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-24T10:00:00Z", updated_at: "" });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(BRAVO, "Bravo Imóveis"));
  db.adAccounts.push(
    { id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] },
    { id: GOOG, platform_id: "google", external_id: "1234567890", client_id: BRAVO, name: "Bravo Google", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] },
  );
  db.campaigns.push(
    { id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Setembro", status: "ativa" },
    { id: C2, ad_account_id: GOOG, client_id: BRAVO, platform_id: "google", external_id: "c2", name: "Pesquisa Marca", status: "ativa" },
  );
  db.syncState[META] = { status: "sucesso", last_success_at: ago(20) };
  db.syncState[GOOG] = { status: "sucesso", last_success_at: ago(20) };
  db.access.push({ user_id: MARIA, client_id: EXC });
  db.monitorAlerts.push(
    alert(1, { assigned_to: USER_ID }),
    alert(2, { metric: "cpc", severity: "atencao", variation_pct: 33.3, status: "em_analise", last_detected_at: ago(30) }),
    alert(3, { client_id: BRAVO, platform_id: "google", ad_account_id: GOOG, campaign_id: C2, metric: "ctr", variation_pct: -45 }),
    alert(4, { metric: "cpm", severity: "atencao", status: "resolvido", first_detected_at: ago(3 * 1440), resolved_at: ago(2 * 1440), resolution: "manual" }),
    alert(5, { metric: "cpm", severity: "atencao", status: "resolvido", first_detected_at: ago(3 * 1440), resolved_at: ago(1440), resolution: "automatica", details: { closed_reason: "inativo" } }),
  );
  db.monitorEvents.push({ id: 1, alert_id: 4, kind: "avaliacao", from_value: null, to_value: "melhorou", note: "Avaliação 3 dias: melhorou.", data: {}, created_at: ago(600), actor: null });
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

// Admin: Visão geral, Histórico, filtros no endereço, dashboard, ficha do cliente e visões Meta/Google.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();
  await page.getByTestId("resumo-meus").waitFor();
  check((await text(page.getByTestId("resumo-meus"))).includes("1"), "Visão geral: 1 alerta com você");
  check((await text(page.getByTestId("resumo-sem-responsavel"))).includes("2"), "Visão geral: 2 sem responsável");
  check((await text(page.getByTestId("resumo-novos"))).includes("2"), "Visão geral: 2 novos");
  const urgent = page.getByTestId("alerta-urgente");
  check(await urgent.count() === 3, "Mais urgentes: os 3 abertos");
  check((await text(urgent.first())).includes("Crítico"), "o mais urgente é crítico");
  const byClient = page.getByTestId("por-cliente");
  check((await text(byClient)).includes("Excalibur Fitness") && (await text(byClient)).includes("Bravo Imóveis"), "por cliente: os 2 clientes");
  await page.screenshot({ path: `${SHOTS}/37.6-visao-geral.png`, fullPage: true });

  // Clicar no cliente abre a aba Alertas filtrada (endereço)
  await byClient.getByRole("link", { name: "Bravo Imóveis" }).click();
  await page.getByTestId("alerta").first().waitFor();
  check(page.url().includes("aba=alertas") && page.url().includes(`cliente=${BRAVO}`), "cliente vai para Alertas filtrado no endereço");
  check(await page.getByTestId("alerta").count() === 1, "filtro de cliente: 1 alerta da Bravo");
  check(await page.getByLabel("Cliente").first().inputValue() === BRAVO, "o filtro de cliente aparece escolhido");
  await page.getByLabel("Cliente").first().selectOption("");
  await page.getByLabel("Plataforma").selectOption("meta");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=alerta]").length === 2, null, { timeout: 5000 }).catch(() => {});
  check(page.url().includes("plataforma=meta") && !page.url().includes("cliente="), "plataforma no endereço");
  check(await page.getByTestId("alerta").count() === 2, "filtro Meta: 2 alertas");

  // Aba Histórico
  await page.getByRole("tab", { name: "Histórico" }).click();
  await page.getByTestId("hist-criados").waitFor();
  check((await text(page.getByTestId("hist-criados"))).includes("5"), "histórico: 5 criados em 30 dias");
  check((await text(page.getByTestId("hist-encerrados"))).includes("2") && (await text(page.getByTestId("hist-encerrados"))).includes("1 item desativado"), "histórico: 2 encerrados (1 por alguém, 1 desativado)");
  check((await text(page.getByTestId("hist-abertos"))).includes("3"), "histórico: 3 ainda abertos");
  check((await text(page.getByTestId("hist-tempo"))).includes("36 h"), "histórico: mediana de 36 h");
  check((await text(page.getByTestId("hist-avaliacoes"))).includes("1 melhorou"), "histórico: 1 providência melhorou");
  check((await text(page.getByTestId("hist-metricas"))).startsWith("CPM"), "histórico: CPM é a métrica com mais alertas");
  check(await page.getByRole("img", { name: "Alertas criados e encerrados por dia" }).count() === 1, "gráfico por dia");
  await page.screenshot({ path: `${SHOTS}/37.6-historico.png`, fullPage: true });
  await page.getByRole("button", { name: "Ver tabela" }).click();
  check(await page.getByTestId("hist-tabela").locator("tbody tr").count() === 30, "tabela com os 30 dias");
  await page.getByLabel("Plataforma do histórico").selectOption("google");
  await page.waitForFunction(() => document.querySelector("[data-testid=hist-criados]")?.textContent.includes("1"), null, { timeout: 5000 }).catch(() => {});
  check((await text(page.getByTestId("hist-criados"))).match(/criados\s*1/i) !== null, "histórico filtrado por Google: 1 criado");

  // Dashboard: faixa do monitoramento
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await page.getByTestId("monitor-shortcut").waitFor();
  const strip = await text(page.getByTestId("monitor-shortcut"));
  check(strip.includes("2 críticos") && strip.includes("1 de atenção") && strip.includes("1 com você"), `dashboard: faixa com críticos, atenção e com você (${strip})`);
  await page.screenshot({ path: `${SHOTS}/37.6-dashboard.png` });

  // Ficha do cliente
  await page.getByRole("link", { name: "Clientes", exact: true }).first().click();
  await page.getByRole("link", { name: "Excalibur Fitness" }).first().click();
  await page.getByTestId("cliente-monitoramento").waitFor();
  await page.getByTestId("cliente-monitoramento-contagem").waitFor();
  const card = await text(page.getByTestId("cliente-monitoramento"));
  check(card.includes("1 crítico(s), 1 de atenção") && !card.includes("Pesquisa Marca"), "ficha do cliente: só os alertas do cliente");
  await page.getByTestId("cliente-monitoramento").getByTestId("alerta-urgente").first().click();
  await page.getByRole("dialog", { name: "Alerta de desempenho" }).getByTestId("detalhe-alerta").waitFor();
  check(page.url().includes(`cliente=${EXC}`) && page.url().includes("alerta=1"), "abrir pela ficha: alerta aberto e filtrado pelo cliente");

  // Visões Meta e Google
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Google Ads", exact: true }).first().click();
  await page.getByTestId("monitor-shortcut").waitFor();
  const g = await text(page.getByTestId("monitor-shortcut"));
  check(g.includes("Google Ads") && g.includes("1 crítico") && g.includes("0 de atenção"), `visão Google: só alertas do Google (${g})`);
  await page.getByTestId("monitor-shortcut").click();
  await page.getByTestId("alerta").first().waitFor();
  check(page.url().includes("plataforma=google") && await page.getByTestId("alerta").count() === 1, "faixa do Google abre os alertas do Google");
  check(errors.length === 0, `sem erros (admin) ${errors.join(" | ")}`);
  await browser.close();
}

// Gestor (só a Excalibur): números do que ele enxerga.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await login(page, "/monitoramento");
  await page.getByTestId("por-cliente").waitFor();
  check(!(await text(page.getByTestId("por-cliente"))).includes("Bravo"), "gestor não vê cliente não liberado");
  check(await page.getByTestId("alerta-urgente").count() === 2, "gestor: 2 mais urgentes");
  check(errors.length === 0, "sem erros (gestor)");
  await browser.close();
}

// Equipe (sem Monitoramento): dashboard sem a faixa; celular sem rolagem lateral para o visualizador.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "/monitoramento");
  await page.getByTestId("por-cliente").waitFor();
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `celular: Visão geral sem rolagem lateral (${overflow}px)`);
  await page.getByRole("tab", { name: "Histórico" }).click();
  await page.getByTestId("hist-criados").waitFor();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `celular: Histórico sem rolagem lateral (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/37.6-celular.png`, fullPage: true });
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  seed(db);
  await login(page, "/minha-conta");
  await page.getByRole("heading", { name: "Minha conta" }).first().waitFor();
  check(!db.rpcCalls.some((c) => c.fn === "monitor_summary"), "equipe não consulta o resumo do monitoramento");
  check(errors.length === 0, "sem erros (equipe)");
  await browser.close();
}
