/**
 * Teste de navegador — correção de 04/10: alertas só críticos (configurável pelo admin), abas de comparação
 * só com itens ativos (opção para mostrar pausados) e a janela do alerta no celular. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000000901";
const ATIVA = "c0000000-0000-4000-8000-000000000901";
const PAUSADA = "c0000000-0000-4000-8000-000000000902";

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const alert = (id, o) => ({
  id, kind: "limite", level: "campaign", metric: "cost_per_result", severity: "critico", status: "novo", version: 1, client_id: EXC, platform_id: "meta",
  ad_account_id: META, campaign_id: ATIVA, ad_id: null, currency: "BRL", current_value: 5, previous_value: 2, variation_pct: 150,
  period_from: day(-7), period_to: day(-1), prev_from: day(-14), prev_to: day(-8), attention_pct: 20, critical_pct: 40,
  explanation: "Custo por resultado: alta de 150,0% (de R$ 2,00 para R$ 5,00) nos últimos 7 dias em relação aos 7 dias anteriores. Limite crítico: 40%. Este texto é longo de propósito para ocupar espaço na janela do celular e testar a rolagem.",
  context: [], details: {}, detections: 1, first_detected_at: ago(120), last_detected_at: ago(10), recurrence_of: null, recurrence_count: 0,
  resolved_at: null, resolution: null, assigned_to: null, task_id: null, ...o,
});

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "" });
  db.adAccounts.push({ id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] });
  db.syncState[META] = { status: "sucesso", last_success_at: ago(20), history_from: day(-60), history_to: day(-1) };
  db.campaigns.push(
    { id: ATIVA, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Ativa", objective: "OUTCOME_LEADS", status: "ativa" },
    { id: PAUSADA, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c2", name: "Promo Pausada", objective: "OUTCOME_SALES", status: "pausada" },
  );
  for (const [id, mult] of [[ATIVA, 1], [PAUSADA, 2]]) {
    for (let d = 1; d <= 14; d++) {
      db.metrics.push({ date: day(-d), level: "campaign", client_id: EXC, platform_id: "meta", currency: "BRL", superseded: false,
        ad_account_id: META, campaign_id: id, ad_group_id: null, ad_id: null,
        spend_micros: mult * 10_000_000, impressions: 1000, clicks: 50, link_clicks: 40, leads: 2, messages: null, conversions: null, conversion_value_micros: null });
    }
  }
  db.monitorAlerts.push(
    alert(1, {}),
    alert(2, { metric: "cpc", severity: "atencao", status: "resolvido", resolved_at: ago(30), resolution: "automatica", details: { closed_reason: "abaixo_do_minimo" },
      explanation: "CPC: alta de 30,0%." }),
  );
  db.monitorEvents.push({ id: 1, alert_id: 1, kind: "criado", from_value: null, to_value: "critico", note: null, data: {}, created_at: ago(120), actor: null });
}

const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
const until = async (page, fn, ms = 10000) => { for (let i = 0; i < ms / 200; i++) { if (await fn()) return true; await page.waitForTimeout(200); } return false; };

// Admin: gravidade mínima, motivo de encerramento, só ativos nas abas.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();
  await page.getByRole("tab", { name: "Configurações" }).click();
  const box = page.getByTestId("gravidade-minima");
  await box.waitFor();
  check(await box.getByLabel("Gerar alertas a partir de").inputValue() === "critico", "padrão: só críticos");
  await box.getByLabel("Gerar alertas a partir de").selectOption("atencao");
  await box.getByRole("button", { name: "Salvar" }).click();
  await box.getByText("Salvo.").waitFor();
  check(db.monitorSettings.min_severity === "atencao", "admin muda para críticos e de atenção");
  await box.getByLabel("Gerar alertas a partir de").selectOption("critico");
  await box.getByRole("button", { name: "Salvar" }).click();
  await box.getByText("Salvo.").waitFor();
  check(db.monitorSettings.min_severity === "critico", "volta para só críticos");

  // Histórico mostra o motivo
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.getByRole("button", { name: "Resolvidos (histórico)" }).click();
  await until(page, async () => (await page.getByTestId("alerta").count()) === 1);
  check((await text(page.getByTestId("alerta").first())).includes("Encerrado: deixou de ser crítico"), "histórico: encerrado porque deixou de ser crítico");

  // Campanhas: só ativas por padrão
  await page.getByRole("tab", { name: "Campanhas" }).click();
  await until(page, async () => (await page.locator("[role=tab][aria-selected=true]").innerText()) === "Campanhas" && (await page.getByTestId("mostrar-pausados").count()) === 1, 40000);
  await until(page, async () => { const t = await page.locator("main").textContent(); return t.includes("Leads Ativa") && !t.includes("Carregando"); });
  let camp = await text(page.locator("main"));
  check(camp.includes("Leads Ativa") && !camp.includes("Promo Pausada"), "Campanhas: só a ativa por padrão");
  await page.getByTestId("mostrar-pausados").click();
  await until(page, async () => (await page.locator("main").textContent()).includes("Promo Pausada"));
  camp = await text(page.locator("main"));
  check(camp.includes("Promo Pausada") && page.url().includes("pausados=1"), "marcando a opção, aparece a pausada");
  check(errors.length === 0, `sem erros (admin) ${errors.join(" | ")}`);
  await browser.close();
}

// Visualizador: só lê a configuração.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await login(page, "/monitoramento");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page.getByTestId("gravidade-minima-leitura").waitFor();
  check((await text(page.getByTestId("gravidade-minima-leitura"))).includes("Só críticos"), "visualizador vê a regra, sem mudar");
  check(await page.getByTestId("gravidade-minima").count() === 0, "visualizador não tem o seletor");
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}

// Celular: a janela do alerta aparece inteira, com o X sempre visível e o fundo parado.
for (const [w, h] of [[390, 664], [360, 560]]) {
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await page.setViewportSize({ width: w, height: h });
  await login(page, "/monitoramento");
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.getByTestId("abrir-alerta").first().click();
  const dlg = page.getByRole("dialog", { name: "Alerta de desempenho" });
  await dlg.getByTestId("detalhe-alerta").waitFor();
  await page.waitForTimeout(300);
  const b = await dlg.boundingBox();
  check(b.y >= 0 && b.y + b.height <= h + 1 && b.x >= 0 && b.x + b.width <= w + 1, `${w}x${h}: janela inteira dentro da tela (${Math.round(b.y)}–${Math.round(b.y + b.height)})`);
  check(await page.evaluate(() => document.body.style.overflow) === "hidden", `${w}x${h}: o fundo não rola com a janela aberta`);
  await dlg.evaluate((d) => { d.scrollTop = d.scrollHeight; });
  await page.waitForTimeout(200);
  const close = await dlg.getByRole("button", { name: "Fechar janela" }).boundingBox();
  check(close && close.y >= b.y - 1 && close.y + close.height <= h, `${w}x${h}: o X continua visível depois de rolar até o fim`);
  const overflow = await dlg.evaluate((d) => d.scrollWidth - d.clientWidth);
  check(overflow <= 0, `${w}x${h}: nada cortado na lateral da janela (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/alerta-celular-${w}.png` });
  await dlg.getByRole("button", { name: "Fechar janela" }).click();
  await until(page, async () => (await page.getByRole("dialog").count()) === 0);
  check(await page.evaluate(() => document.body.style.overflow) === "", `${w}x${h}: ao fechar, a página volta a rolar`);
  check(errors.length === 0, `sem erros (${w}x${h})`);
  await browser.close();
}
