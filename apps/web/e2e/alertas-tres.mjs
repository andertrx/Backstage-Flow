/**
 * Teste de navegador da 43.5 — três sininhos (Contas, Campanhas, Tarefas), o total no menu Alertas com os 3 contadores
 * e a tela Alertas em 3 abas. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e1111111-1111-4111-8111-111111111111";
const META = "a1111111-1111-4111-8111-111111111111";
const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString();

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "" });
  db.adAccounts.push({ id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null });
  const alert = (id, type, severity, description) => ({ id, alert_key: `${type}:${META}`, type, severity, status: "aberto", client_id: EXC, platform_id: "meta", ad_account_id: META, campaign_id: null,
    description, recommended_action: null, details: {}, first_seen_at: ago(2), last_seen_at: ago(0.1), seen_at: null, resolved_at: null, resolution: null });
  db.alerts.push(alert(1, "sem_saldo", "critica", "Conta sem saldo: os anúncios param de rodar."), alert(2, "erro_api", "critica", "A última sincronização falhou."));
  const mn = (id, title) => ({ id, user_id: USER_ID, kind: "alerta.novo", alert_id: null, link: "/monitoramento?aba=alertas", read_at: null, created_at: ago(5 + id), title, body: "Excalibur Fitness · queda de resultado" });
  db.monitorNotifications.push(mn(1, "Alerta crítico: Leads Setembro"), mn(2, "Alerta de atenção: Vendas"), mn(3, "Alerta de atenção: Tráfego"));
  const on = (id, kind, title) => ({ id, user_id: USER_ID, actor_id: null, kind, title, body: null, link: "/operacoes/tarefas", read_at: null, dedupe_key: `t${id}`, created_at: ago(id) });
  db.opsNotifications.push(on(1, "tarefa.mencao", "Maria mencionou você numa tarefa"), on(2, "tarefa.atrasada", "Tarefa atrasada: Banner da campanha"));
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  // três sininhos, cada um com o seu número
  await page.getByTestId("accounts-bell-count").waitFor();
  await page.getByTestId("monitor-bell-count").waitFor();
  await page.getByTestId("ops-bell-count").waitFor();
  const n = async (id) => (await page.getByTestId(id).innerText()).trim();
  check(await n("accounts-bell-count") === "2" && await n("monitor-bell-count") === "3" && await n("ops-bell-count") === "2", "sininhos Contas 2, Campanhas 3, Tarefas 2");
  check(/Contas/.test(await page.getByTestId("accounts-bell").getAttribute("aria-label")) && /Campanhas/.test(await page.getByTestId("monitor-bell").getAttribute("aria-label")) && /Tarefas/.test(await page.getByTestId("ops-bell").getAttribute("aria-label")),
    "cada sininho tem o nome no rótulo");
  // menu: total = soma, com os 3 contadores
  await page.getByTestId("nav-alerts-count").first().waitFor();
  check((await page.getByTestId("nav-alerts-count").first().innerText()).trim().startsWith("7"), "menu Alertas mostra o total (2 + 3 + 2 = 7)");
  const sub = page.getByTestId("nav-alerts-sub");
  check((await sub.innerText()).replace(/\s+/g, " ").trim() === "Contas 2 Campanhas 3 Tarefas 2", "menu mostra os 3 contadores separados");
  await page.screenshot({ path: `${SHOTS}/alertas-tres-topo.png` });

  // painel do sininho Contas
  await page.getByTestId("accounts-bell").click();
  const painel = page.getByTestId("accounts-bell-panel");
  await painel.waitFor();
  check(await painel.getByTestId("accounts-bell-item").count() === 2, "sininho Contas lista os alertas abertos");
  await page.keyboard.press("Escape");

  // tela Alertas em 3 abas
  await page.getByTestId("nav-alerts-sub-campanhas").click();  // botão (não é outro item do menu)
  await page.waitForURL("**/alertas?aba=campanhas");
  await page.getByTestId("avisos-campanhas").waitFor();
  check(await page.getByTestId("monitor-notification-row").count() === 3, "aba Campanhas lista os 3 avisos do Monitoramento");
  check((await page.getByTestId("alert-tab-count-campanhas").innerText()).trim() === "3", "aba Campanhas mostra o seu número");
  await page.getByTestId("alert-tab-tarefas").click();
  const tar = page.getByTestId("avisos-tarefas");
  await tar.waitFor();
  check((await tar.getByTestId("tarefas-atrasadas").innerText()).includes("Banner da campanha"), "aba Tarefas destaca as atrasadas no topo");
  check(await tar.getByTestId("ops-notification").count() === 2, "aba Tarefas lista tudo da Central (2)");
  await page.screenshot({ path: `${SHOTS}/alertas-tres-abas.png` });
  await page.getByTestId("alert-tab-contas").click();
  await page.getByTestId("alert-card").first().waitFor();
  check(await page.getByTestId("alert-card").count() >= 2 && !page.url().includes("aba="), "aba Contas é a tela de alertas de sempre");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

// Sem Central: só Contas e Campanhas (visualizador)
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/alertas");
  await page.getByTestId("alert-tabs").waitFor();
  check(await page.getByTestId("alert-tab-tarefas").count() === 0 && await page.getByTestId("alert-tab-campanhas").count() === 1, "visualizador: só as abas Contas e Campanhas");
  await browser.close();
}
console.log("OK: alertas-tres");
