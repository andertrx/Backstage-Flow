/**
 * Teste de navegador da Etapa 37.5 — Monitoramento: notificações.
 * Ícone de avisos no topo (não lidos, abrir leva ao alerta, marcar como lido), preferências
 * (as minhas; o admin escolhe outra pessoa), validação, histórico de envios e quem vê o quê. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000000901";
const C1 = "c0000000-0000-4000-8000-000000000901";
const MARIA = "22222222-2222-2222-2222-222222222222";

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function seed(db, me = USER_ID) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "" });
  db.adAccounts.push({ id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null });
  db.campaigns.push({ id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Setembro", status: "ativa" });
  db.syncState[META] = { status: "sucesso", last_success_at: ago(20) };
  db.access.push({ user_id: MARIA, client_id: EXC });
  db.monitorAlerts.push({
    id: 1, kind: "limite", level: "campaign", metric: "cost_per_result", severity: "critico", status: "novo", version: 1, client_id: EXC, platform_id: "meta",
    ad_account_id: META, campaign_id: C1, ad_id: null, currency: "BRL", current_value: 5, previous_value: 2, variation_pct: 150,
    period_from: day(-7), period_to: day(-1), prev_from: day(-14), prev_to: day(-8), attention_pct: 20, critical_pct: 40,
    explanation: "Custo por resultado: alta de 150,0% (de R$ 2,00 para R$ 5,00) nos últimos 7 dias em relação aos 7 dias anteriores. Limite crítico: 40%.",
    context: [], details: {}, detections: 1, first_detected_at: ago(120), last_detected_at: ago(10), recurrence_of: null, recurrence_count: 0,
    resolved_at: null, resolution: null, assigned_to: null, task_id: null,
  });
  db.monitorEvents.push({ id: 1, alert_id: 1, kind: "criado", from_value: null, to_value: "critico", note: null, data: {}, created_at: ago(120), actor: null });
  const n = (id, user_id, o) => ({ id, user_id, kind: "alerta.novo", alert_id: 1, link: "/monitoramento?aba=alertas&alerta=1", read_at: null, created_at: ago(100 - id), body: "Excalibur Fitness · Custo por resultado: alta de 150,0%.", ...o });
  db.monitorNotifications.push(
    n(1, me, { title: "Alerta crítico: Leads Setembro" }),
    n(2, me, { kind: "alerta.atribuido", title: "Você é o responsável por um alerta: Leads Setembro" }),
    n(3, me, { kind: "resumo.diario", alert_id: null, link: "/monitoramento?aba=alertas", title: "Resumo do monitoramento: 1 alerta(s) aberto(s)", read_at: ago(5), created_at: ago(300) }),
    n(4, MARIA, { title: "Aviso da Maria (não pode aparecer para outra pessoa)" }),
  );
  const d = (id, user_id, o) => ({ id, user_id, channel: "interno", kind: "alerta.novo", status: "enviado", reason: null, title: "Alerta crítico: Leads Setembro", alert_id: 1, attempts: 0, created_at: ago(100 - id), sent_at: ago(100 - id), ...o });
  db.monitorDeliveries.push(
    d(1, me, {}),
    d(2, me, { channel: "email", status: "falhou", attempts: 3, sent_at: null, reason: "O Resend recusou a chave. Confira se ela está certa e tem permissão de envio." }),
    d(3, me, { channel: "whatsapp", status: "preparado", sent_at: null, reason: "O envio por WhatsApp ainda não está ligado (preparado)." }),
    d(4, MARIA, { channel: "email", status: "pulado", sent_at: null, reason: "Horário de silêncio da pessoa." }),
  );
}

async function openSettings(page) {
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page.getByTestId("prefs-form").waitFor();
}

const bellCount = async (page) => ((await page.getByTestId("monitor-bell-count").count()) ? (await page.getByTestId("monitor-bell-count").innerText()).trim() : "0");

// Admin: ícone, abrir aviso, marcar todos, preferências (minhas e da Maria) e histórico de todos.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();
  await page.getByTestId("monitor-bell").waitFor();
  await page.waitForFunction(() => document.querySelector("[data-testid=monitor-bell-count]")?.textContent.trim() === "2", null, { timeout: 5000 }).catch(() => {});
  check(await bellCount(page) === "2", "ícone de avisos mostra 2 não lidos");
  check((await page.getByTestId("monitor-bell").getAttribute("aria-label")).includes("2 não lidos"), "ícone diz a quantidade para leitor de tela");

  await page.getByTestId("monitor-bell").click();
  const panel = page.getByTestId("monitor-bell-panel");
  await panel.getByTestId("monitor-notification").first().waitFor();
  const items = panel.getByTestId("monitor-notification");
  check(await items.count() === 3, "lista mostra só os 3 avisos da própria pessoa");
  check(!(await panel.innerText()).includes("Aviso da Maria"), "aviso de outra pessoa não aparece");
  check(await panel.locator("[data-read=nao]").count() === 2, "2 avisos marcados como não lidos");
  await page.screenshot({ path: `${SHOTS}/37.5-avisos.png` });

  // Abrir o aviso: marca como lido e abre o alerta
  await items.filter({ hasText: "Alerta crítico: Leads Setembro" }).click();
  await page.getByRole("dialog", { name: "Alerta de desempenho" }).getByTestId("detalhe-alerta").waitFor();
  check(page.url().includes("aba=alertas") && page.url().includes("alerta=1"), "aviso leva ao alerta (aba Alertas, alerta aberto)");
  check(db.monitorNotifications.find((x) => x.id === 1).read_at !== null, "aviso aberto fica lido");
  await page.waitForFunction(() => document.querySelector("[data-testid=monitor-bell-count]")?.textContent.trim() === "1", null, { timeout: 5000 }).catch(() => {});
  check(await bellCount(page) === "1", "contador baixa para 1");
  await page.keyboard.press("Escape");

  // Marcar todos como lidos
  await page.getByTestId("monitor-bell").click();
  await page.getByTestId("monitor-bell-read-all").click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=monitor-bell-count]"), null, { timeout: 5000 }).catch(() => {});
  check(await bellCount(page) === "0", "marcar todos: contador some");
  check(db.monitorNotifications.filter((x) => x.user_id === USER_ID).every((x) => x.read_at), "todos os meus avisos lidos");
  check(db.monitorNotifications.find((x) => x.id === 4).read_at === null, "o aviso da Maria continua não lido");

  // Atalho "Preferências de aviso" leva às Configurações
  await page.getByRole("link", { name: "Preferências de aviso" }).click();
  const form = page.getByTestId("prefs-form");
  await form.waitFor();
  check(page.url().includes("aba=configuracoes"), "atalho abre a aba Configurações");
  check(await page.getByRole("heading", { name: "Minhas notificações" }).count() === 1, "seção Minhas notificações");
  check(await page.getByTestId("prefs-padrao").count() === 1, "mostra que está no padrão");
  check(await page.getByTestId("prefs-ligado").isChecked(), "admin começa ligado (padrão)");
  check(await page.getByTestId("prefs-interno").isChecked() && !(await page.getByTestId("prefs-email").isChecked()), "padrão: só no sistema");

  // Silêncio inválido (mesma hora) → mensagem do banco
  await page.getByTestId("prefs-email").check();
  await page.getByTestId("prefs-silencio").check();
  await page.getByLabel("Início do silêncio").selectOption("7");
  await page.getByLabel("Fim do silêncio").selectOption("7");
  await page.getByTestId("prefs-salvar").click();
  await page.getByText("Horário de silêncio inválido").waitFor();
  check(true, "silêncio com início = fim é recusado com explicação");

  await page.getByLabel("Início do silêncio").selectOption("22");
  await page.getByTestId("prefs-gravidade").selectOption("atencao");
  await page.getByTestId("prefs-modo").selectOption("ambos");
  await page.getByTestId("prefs-hora").selectOption("9");
  await page.getByTestId("prefs-clientes").getByLabel("Excalibur Fitness").check();
  await page.getByTestId("prefs-salvar").click();
  await page.getByText("Preferências salvas.").waitFor();
  const mine = db.monitorPrefs[USER_ID];
  check(mine.email && mine.internal && !mine.whatsapp, "canais salvos (sistema + e-mail)");
  check(mine.min_severity === "atencao" && mine.mode === "ambos" && mine.digest_hour === 9, "gravidade, modo e hora salvos");
  check(mine.quiet_start === 22 && mine.quiet_end === 7, "silêncio das 22h às 7h salvo");
  check(JSON.stringify(mine.client_ids) === JSON.stringify([EXC]), "cliente escolhido salvo");

  // Admin escolhe a Maria
  await page.getByTestId("prefs-pessoa").selectOption(MARIA);
  await page.getByRole("heading", { name: "Notificações de outra pessoa" }).waitFor();
  await page.getByTestId("prefs-padrao").waitFor();
  check((await page.getByTestId("prefs-padrao").innerText()).includes("Esta pessoa"), "preferências da Maria (no padrão)");
  await page.getByTestId("prefs-modo").selectOption("resumo");
  await page.getByTestId("prefs-salvar").click();
  await page.getByText("Preferências salvas.").waitFor();
  check(db.monitorPrefs[MARIA]?.mode === "resumo", "admin salvou o resumo diário da Maria");
  check(db.rpcCalls.some((c) => c.fn === "monitor_prefs_save" && c.p_user === MARIA), "salvou para a Maria (não para o admin)");

  // Histórico de envios (admin vê todos)
  const hist = page.getByTestId("historico-envios");
  await hist.waitFor();
  check(await hist.getByTestId("envio").count() === 4, "histórico do admin mostra os 4 envios");
  check((await hist.innerText()).includes("Maria Gestora"), "admin vê a coluna Pessoa com a Maria");
  const failed = hist.locator("[data-status=falhou]");
  check((await failed.innerText()).includes("Falhou") && (await failed.innerText()).includes("Resend recusou"), "falha mostra o motivo");
  check((await hist.locator("[data-channel=whatsapp]").innerText()).includes("Preparado"), "WhatsApp aparece como preparado");
  await page.screenshot({ path: `${SHOTS}/37.5-configuracoes.png`, fullPage: true });
  check(errors.length === 0, "sem erros (admin)");
  await browser.close();
}

// Gestor: só as próprias preferências e o próprio histórico.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await openSettings(page);
  check(await page.getByTestId("prefs-pessoa").count() === 0, "gestor não escolhe outra pessoa");
  check(!db.rpcCalls.some((c) => c.fn === "monitor_notify_people"), "gestor nem pede a lista de pessoas");
  await page.getByTestId("historico-envios").waitFor();
  check(await page.getByTestId("envio").count() === 3, "gestor vê só os próprios 3 envios");
  check(!(await page.getByTestId("historico-envios").innerText()).includes("Maria Gestora"), "sem envios de outra pessoa");
  check(await page.getByTestId("monitor-bell").count() === 1, "gestor tem o ícone de avisos");
  check(errors.length === 0, "sem erros (gestor)");
  await browser.close();
}

// Visualizador: começa desligado; celular sem rolagem lateral.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);
  check(!(await page.getByTestId("prefs-ligado").isChecked()), "visualizador começa com os avisos desligados");
  await page.getByTestId("prefs-ligado").check();
  await page.getByTestId("prefs-salvar").click();
  await page.getByText("Preferências salvas.").waitFor();
  check(db.monitorPrefs[USER_ID]?.enabled === true, "visualizador pode ligar os próprios avisos");
  await page.getByTestId("monitor-bell").click();
  await page.getByTestId("monitor-bell-panel").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `celular sem rolagem lateral (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/37.5-celular.png` });
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}

// Equipe (sem Monitoramento): não tem o ícone.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  seed(db);
  await login(page, "/minha-conta");
  await page.getByRole("heading", { name: "Minha conta" }).first().waitFor();
  check(await page.getByTestId("monitor-bell").count() === 0, "equipe não vê o ícone de avisos do monitoramento");
  check(!db.rpcCalls.some((c) => c.fn === "monitor_notifications_list"), "equipe não consulta avisos do monitoramento");
  check(errors.length === 0, "sem erros (equipe)");
  await browser.close();
}
