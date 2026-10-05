/**
 * Teste de navegador — pedido de 05/10: botão "Resolver" direto na lista de alertas (com confirmação);
 * o alerta sai dos abertos e vai para Resolvidos (histórico). Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000000901";
const C1 = "c0000000-0000-4000-8000-000000000901";
const C2 = "c0000000-0000-4000-8000-000000000902";

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const until = async (page, fn, ms = 10000) => { for (let i = 0; i < ms / 200; i++) { if (await fn()) return true; await page.waitForTimeout(200); } return false; };

const alert = (id, campaign, o) => ({
  id, kind: "limite", level: "campaign", metric: "cost_per_result", severity: "critico", status: "novo", version: 1, client_id: EXC, platform_id: "meta",
  ad_account_id: META, campaign_id: campaign, ad_id: null, currency: "BRL", current_value: 5, previous_value: 2, variation_pct: 150,
  period_from: day(-7), period_to: day(-1), prev_from: day(-14), prev_to: day(-8), attention_pct: 20, critical_pct: 40,
  explanation: "Custo por resultado: alta de 150,0% (de R$ 2,00 para R$ 5,00) nos últimos 7 dias em relação aos 7 dias anteriores. Limite crítico: 40%.",
  context: [], details: {}, detections: 1, first_detected_at: ago(120), last_detected_at: ago(10), recurrence_of: null, recurrence_count: 0,
  resolved_at: null, resolution: null, assigned_to: null, task_id: null, ...o,
});

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "" });
  db.adAccounts.push({ id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] });
  db.campaigns.push(
    { id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Setembro", objective: "OUTCOME_LEADS", status: "ativa" },
    { id: C2, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c2", name: "Vendas Loja", objective: "OUTCOME_SALES", status: "ativa" },
  );
  db.monitorAlerts.push(alert(1, C1, {}), alert(2, C2, { metric: "results", explanation: "Resultados: queda de 50,0%." }));
  db.monitorEvents.push({ id: 1, alert_id: 1, kind: "criado", from_value: null, to_value: "critico", note: null, data: {}, created_at: ago(120), actor: null });
}

const cards = (page) => page.getByTestId("alerta");
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

// Gestor/admin: resolve direto na lista.
for (const [w, h] of [[1366, 820], [360, 640]]) {
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await page.setViewportSize({ width: w, height: h });
  await login(page, "/monitoramento?aba=alertas");
  await until(page, async () => (await cards(page).count()) === 2);
  check(await cards(page).count() === 2, `${w}px: 2 alertas abertos`);
  check(await page.getByTestId("resolver-rapido").count() === 2, `${w}px: botão "Resolver" em cada alerta`);
  check((await text(page.getByTestId("resolver-rapido").first())) === "Resolver", `${w}px: o botão se chama "Resolver"`);
  {
    const card = await cards(page).first().boundingBox();
    const btn = await page.getByTestId("resolver-rapido").first().boundingBox();
    check(btn.x >= card.x && btn.x + btn.width <= card.x + card.width + 0.5 && btn.x + btn.width <= w + 0.5, `${w}px: botão inteiro dentro do cartão`);
  }

  // Não: cancela sem mudar nada.
  const leads = cards(page).filter({ hasText: "Leads Setembro" });
  await leads.getByTestId("resolver-rapido").click();
  await leads.getByTestId("confirmar-resolvido").waitFor();
  check((await text(leads.getByTestId("confirmar-resolvido"))).includes("Resolver este alerta?"), `${w}px: pede confirmação`);
  await leads.getByRole("button", { name: "Não" }).click();
  check(await leads.getByTestId("resolver-rapido").count() === 1 && db.monitorAlerts[0].status === "novo", `${w}px: "Não" cancela sem mudar nada`);
  if (w < 1000) {
    await leads.getByTestId("resolver-rapido").click();
    const b = await leads.getByTestId("confirmar-resolvido").boundingBox();
    check(b && b.x >= 0 && b.x + b.width <= w + 0.5, `${w}px: confirmação inteira na tela`);
    await page.screenshot({ path: `${SHOTS}/37.12-resolvido-celular.png` });
    await leads.getByRole("button", { name: "Não" }).click();
  } else {
    await leads.getByTestId("resolver-rapido").click();
    await page.screenshot({ path: `${SHOTS}/37.12-resolvido.png` });
    await leads.getByRole("button", { name: "Não" }).click();
  }

  // Sim: some da lista de abertos.
  await leads.getByTestId("resolver-rapido").click();
  await leads.getByRole("button", { name: "Sim" }).click();
  await until(page, async () => (await cards(page).count()) === 1);
  check(await cards(page).count() === 1 && !(await text(page.locator("main"))).includes("Leads Setembro"), `${w}px: o alerta resolvido sai da lista`);
  const a1 = db.monitorAlerts.find((a) => a.id === 1);
  check(a1.status === "resolvido" && a1.resolution === "manual" && a1.resolved_by === USER_ID, `${w}px: gravado como resolvido à mão, por quem clicou`);
  check(db.monitorEvents.some((e) => e.alert_id === 1 && e.to_value === "resolvido"), `${w}px: fica na linha do tempo do alerta`);

  // Vai para o histórico.
  await page.getByRole("button", { name: "Resolvidos (histórico)" }).click();
  await until(page, async () => (await cards(page).count()) === 1 && (await text(cards(page).first())).includes("Leads Setembro"));
  const hist = await text(cards(page).first());
  check(hist.includes("Leads Setembro") && hist.includes("Resolvido à mão"), `${w}px: aparece em Resolvidos (histórico)`);
  check(await page.getByTestId("resolver-rapido").count() === 0, `${w}px: no histórico não há botão`);
  check(errors.length === 0, `sem erros (${w}px) ${errors.join(" | ")}`);
  await browser.close();
}

// Visualizador: vê os alertas, mas não tem o botão.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await login(page, "/monitoramento?aba=alertas");
  await until(page, async () => (await cards(page).count()) === 2);
  check(await cards(page).count() === 2 && await page.getByTestId("resolver-rapido").count() === 0, "visualizador não vê o botão Resolver");
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}

console.log("Monitoramento — botão Resolver na lista: tudo certo.");
