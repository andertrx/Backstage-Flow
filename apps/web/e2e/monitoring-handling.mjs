/**
 * Teste de navegador da Etapa 37.4 — Monitoramento: tratar alertas.
 * Abrir (vira "Visualizado"), estado, responsável, comentário, providência, virar tarefa, resolver,
 * conflito de versão, linha do tempo com a avaliação posterior e quem pode o quê. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000000901";
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
  explanation: "Custo por resultado: alta de 150,0% (de R$ 2,00 para R$ 5,00) nos últimos 7 dias em relação aos 7 dias anteriores. Limite crítico: 40%.",
  context: [], details: {}, detections: 1, first_detected_at: ago(120), last_detected_at: ago(10), recurrence_of: null, recurrence_count: 0,
  resolved_at: null, resolution: null, assigned_to: null, task_id: null, ...o,
});

function seed(db) {
  const client = (id, name) => ({ id, name, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "" });
  db.clients.push(client(EXC, "Excalibur Fitness"));
  db.adAccounts.push({ id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null });
  db.campaigns.push(
    { id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Setembro", status: "ativa" },
    { id: C2, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c2", name: "Tráfego Site", status: "ativa" },
  );
  db.syncState[META] = { status: "sucesso", last_success_at: ago(20) };
  db.access.push({ user_id: MARIA, client_id: EXC });
  db.monitorAlerts.push(
    alert(1, {}),
    alert(2, { campaign_id: C2, metric: "cpc", severity: "atencao", current_value: 0.6, previous_value: 0.45, variation_pct: 33.3,
      explanation: "CPC: alta de 33,3% (de R$ 0,45 para R$ 0,60) nos últimos 7 dias em relação aos 7 dias anteriores. Limite de atenção: 20%." }),
  );
  db.monitorEvents.push(
    { id: 1, alert_id: 2, kind: "criado", from_value: null, to_value: "atencao", note: null, data: {}, created_at: ago(9000), actor: null },
    { id: 2, alert_id: 2, kind: "providencia", from_value: null, to_value: null, note: "Ajustei os lances.", data: {}, created_at: ago(8000), actor: MARIA },
    { id: 3, alert_id: 2, kind: "avaliacao", from_value: null, to_value: "melhorou", data: { days: 3, from: day(-5), to: day(-3) }, created_at: ago(60), actor: null,
      note: "Avaliação 3 dias após a providência: cpc R$ 0,40 (antes R$ 0,60, -33,3%) — melhorou." },
  );
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

async function openAlerts(page) {
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.getByTestId("alerta").first().waitFor();
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await openAlerts(page);
  const cards = page.getByTestId("alerta");
  check((await cards.first().innerText()).includes("Novo"), "alerta aberto mostra o estado Novo");

  // Abrir: vira "Visualizado" e o endereço guarda o alerta
  await cards.first().getByTestId("abrir-alerta").click();
  const dlg = page.getByRole("dialog", { name: "Alerta de desempenho" });
  await dlg.getByTestId("detalhe-alerta").waitFor();
  await page.waitForFunction(() => document.querySelector("[data-testid=linha-do-tempo]")?.textContent.includes("Visualizado"), null, { timeout: 5000 }).catch(() => {});
  check(page.url().includes("alerta=1"), "endereço guarda o alerta aberto");
  check(db.monitorAlerts[0].status === "visualizado", "abrir marca como Visualizado");
  check(clean(await dlg.getByTestId("linha-do-tempo").innerText()).includes("Mudou o estado de “Novo” para “Visualizado”"), "linha do tempo registra o visto");

  // Estado
  await dlg.getByLabel("Estado").selectOption("em_analise");
  await page.waitForFunction(() => document.querySelector("[data-testid=linha-do-tempo]")?.textContent.includes("Em análise"), null, { timeout: 5000 }).catch(() => {});
  check(db.monitorAlerts[0].status === "em_analise" && db.monitorAlerts[0].version === 3, "estado Em análise gravado (versão 3)");

  // Responsável: só quem pode tratar alertas deste cliente
  const opts = await dlg.getByLabel("Responsável").locator("option").allInnerTexts();
  check(opts.includes("Maria Gestora") && opts.includes("Ninguém"), `lista de responsáveis (${opts.join(", ")})`);
  await dlg.getByLabel("Responsável").selectOption(MARIA);
  await page.waitForFunction(() => document.querySelector("[data-testid=linha-do-tempo]")?.textContent.includes("Definiu como responsável: Maria Gestora"), null, { timeout: 5000 }).catch(() => {});
  check(db.monitorAlerts[0].assigned_to === MARIA, "responsável gravado");
  check(clean(await dlg.innerText()).includes("Responsável: Maria Gestora"), "responsável aparece no alerta");

  // Comentário e providência
  const box = dlg.getByLabel("Comentário ou providência");
  await box.fill("O cliente mudou a oferta na terça.");
  await dlg.getByRole("button", { name: "Comentar" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=linha-do-tempo]")?.textContent.includes("mudou a oferta"), null, { timeout: 5000 }).catch(() => {});
  check(clean(await dlg.getByTestId("linha-do-tempo").innerText()).includes("Comentou: O cliente mudou a oferta na terça."), "comentário na linha do tempo");
  check(await box.inputValue() === "", "caixa limpa depois de enviar");
  await box.fill("Troquei o criativo principal.");
  await dlg.getByRole("button", { name: "Registrar providência" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=linha-do-tempo]")?.textContent.includes("Troquei o criativo"), null, { timeout: 5000 }).catch(() => {});
  check(clean(await dlg.getByTestId("linha-do-tempo").innerText()).includes("Registrou a providência: Troquei o criativo principal."), "providência na linha do tempo");

  // Virar tarefa (só quando clicado)
  check(db.opsTasks.length === 0 || !db.opsTasks.some((t) => t.title.startsWith("Alerta:")), "nenhuma tarefa antes do clique");
  await dlg.getByTestId("virar-tarefa").click();
  await dlg.getByLabel("Setor da tarefa").selectOption({ label: "Gestão de Tráfego" });
  await dlg.getByLabel("Prazo (opcional)").fill(day(3));
  await dlg.getByRole("button", { name: "Criar tarefa" }).click();
  await dlg.getByTestId("link-tarefa").waitFor({ timeout: 5000 }).catch(() => {});
  const task = db.opsTasks.find((t) => t.title.startsWith("Alerta:"));
  check(task?.title === "Alerta: Custo por resultado — Leads Setembro" && task.priority === "alta" && task.due_date === day(3) && task.client_id === EXC,
    `tarefa criada com título, prioridade alta, prazo e cliente (${task?.title})`);
  check(task?.sector_id === db.opsSectors.find((s) => s.name === "Gestão de Tráfego").id, "tarefa no setor escolhido");
  check(clean(await dlg.getByTestId("link-tarefa").innerText()).startsWith(`Ver a tarefa nº ${task?.number}`), "link para a tarefa na Central");
  check((await dlg.getByTestId("link-tarefa").getAttribute("href")) === `/operacoes/tarefas?tarefa=${task?.id}`, "link abre a tarefa certa");
  check(await dlg.getByTestId("virar-tarefa").count() === 0, "não oferece criar outra tarefa");
  await page.screenshot({ path: `${SHOTS}/37.4-detalhe.png`, fullPage: true });

  // Alguém alterou antes: a tela avisa
  db.monitorAlerts[0].version += 1;
  await dlg.getByLabel("Estado").selectOption("aguardando_acao");
  await dlg.getByText("Alguém alterou este alerta antes de você.", { exact: false }).waitFor({ timeout: 5000 }).catch(() => {});
  check(await dlg.getByText("Alguém alterou este alerta antes de você.", { exact: false }).count() === 1, "conflito de versão explicado");
  check(db.monitorAlerts[0].status === "em_analise", "conflito não grava");

  // Fechar e reabrir (pega a versão atual) e resolver
  await dlg.getByRole("button", { name: "Fechar janela" }).click();
  check(!page.url().includes("alerta="), "fechar tira o alerta do endereço");
  const card1 = page.locator("[data-testid=alerta]", { hasText: "Leads Setembro" });
  const c1 = clean(await card1.innerText());
  check(c1.includes("Em análise") && c1.includes("Maria Gestora") && c1.includes(`Tarefa nº ${task?.number}`), `cartão mostra estado, responsável e tarefa (${c1})`);

  // Filtros novos
  await page.getByLabel("Só os meus").check();
  check(await page.getByTestId("sem-alertas").count() === 1, "só os meus: nenhum é do admin");
  await page.getByLabel("Só os meus").uncheck();
  await page.getByLabel("Estado").selectOption("novo");
  check(await cards.count() === 1 && (await cards.first().innerText()).includes("Tráfego Site"), "filtro por estado");
  await page.getByLabel("Estado").selectOption("");
  await page.screenshot({ path: `${SHOTS}/37.4-lista.png`, fullPage: true });

  await card1.getByTestId("abrir-alerta").click();
  await dlg.getByTestId("detalhe-alerta").waitFor();
  await dlg.getByRole("button", { name: "Resolver" }).click();
  await dlg.getByLabel("Como foi resolvido? (opcional)").fill("Resolvido com a troca do criativo.");
  await dlg.getByRole("button", { name: "Confirmar resolução" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=linha-do-tempo]")?.textContent.includes("Resolveu o alerta"), null, { timeout: 5000 }).catch(() => {});
  check(db.monitorAlerts[0].status === "resolvido" && db.monitorAlerts[0].resolution === "manual", "resolvido à mão");
  check(await dlg.getByLabel("Estado").count() === 0 && await dlg.getByRole("button", { name: "Comentar" }).count() === 1,
    "encerrado: sem mudar estado, mas ainda aceita comentário");
  const tl = clean(await dlg.getByTestId("linha-do-tempo").innerText());
  check(tl.includes("Resolveu o alerta.") && tl.includes("Resolvido com a troca do criativo."), "resolução com a observação na linha do tempo");
  await dlg.getByRole("button", { name: "Fechar janela" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=alerta]").length === 1, null, { timeout: 5000 }).catch(() => {});
  check(await cards.count() === 1, "resolvido sai dos abertos");

  // Avaliação posterior aparece na linha do tempo
  await cards.first().getByTestId("abrir-alerta").click();
  await dlg.getByTestId("detalhe-alerta").waitFor();
  const tl2 = clean(await dlg.getByTestId("linha-do-tempo").innerText());
  check(tl2.includes("Sistema · Avaliação 3 dias após a providência: cpc R$ 0,40 (antes R$ 0,60, -33,3%) — melhorou.") && tl2.includes("Dias comparados:"),
    `avaliação posterior na linha do tempo (${tl2.slice(0, 160)})`);
  check(tl2.includes("Maria Gestora · Registrou a providência: Ajustei os lances."), "providência de outra pessoa com o nome");
  await dlg.getByRole("button", { name: "Fechar janela" }).click();

  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

// Gestor sem permissão na Central: trata o alerta, mas não vê "Virar tarefa".
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await openAlerts(page);
  await page.getByTestId("abrir-alerta").first().click();
  const dlg = page.getByRole("dialog", { name: "Alerta de desempenho" });
  await dlg.getByTestId("tratar-alerta").waitFor();
  await page.waitForFunction(() => document.querySelector("[data-testid=linha-do-tempo]")?.textContent.includes("Visualizado"), null, { timeout: 5000 }).catch(() => {});
  check(db.monitorAlerts[0].status === "visualizado", "gestor abre: vira Visualizado");
  check(await dlg.getByTestId("virar-tarefa").count() === 0, "sem permissão na Central: sem Virar tarefa");
  check(await dlg.getByRole("button", { name: "Resolver" }).count() === 1, "gestor pode resolver");
  check(errors.length === 0, "sem erros (gestor)");
  await browser.close();
}

// Visualizador: só lê. Celular sem rolagem lateral.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await page.setViewportSize({ width: 390, height: 844 });
  await openAlerts(page);
  await page.getByTestId("abrir-alerta").first().click();
  const dlg = page.getByRole("dialog", { name: "Alerta de desempenho" });
  await dlg.getByTestId("so-leitura").waitFor();
  check(await dlg.getByTestId("tratar-alerta").count() === 0, "visualizador não vê os controles");
  check(!db.rpcCalls.some((c) => c.fn === "monitor_alert_seen"), "visualizador não marca como visto");
  check(db.monitorAlerts[0].status === "novo", "estado continua Novo");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `celular sem rolagem lateral (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/37.4-celular.png`, fullPage: true });
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}
