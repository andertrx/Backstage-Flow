/**
 * Teste de navegador da Etapa 36.3 — Central de Operações: clientes no fluxo
 * (onboarding e Account Manager), regras de avanço, liberar demanda para vários
 * setores, filas por setor, registro manual e abas na ficha do cliente.
 * Supabase SIMULADO.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const BIA = "44444444-4444-4444-4444-444444444444";
const AURORA = "c1000000-0000-4000-8000-000000000001";
const BETA = "c1000000-0000-4000-8000-000000000002";
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-20T12:00:00Z", updated_at: "", created_by: null });

function seed(db) {
  db.clients.push(client(AURORA, "Loja Aurora"), client(BETA, "Studio Beta"));
  db.profiles.push({ id: BIA, email: "bia@agencia.com", full_name: "Bia Designer", role: "equipe", active: true, created_at: "2026-09-25T10:00:00Z", updated_at: "" });
  db.opsMembers[MARIA] = { primary: sectorId(db, "Account Manager"), secondary: [], job_title: "AM", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.tasks.create", "ops.tasks.edit", "ops.tasks.assign", "ops.cards.move"] };
  db.opsMembers[BIA] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.cards.move"] };
}

async function dragTo(page, card, column) {
  const a = await card.boundingBox();
  const b = await column.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + 30, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
  await page.mouse.up();
}

const waitFor = async (page, fn, what) => {
  for (let i = 0; i < 40; i++) { if (fn()) return; await page.waitForTimeout(100); }
  throw new Error(`FALHOU: ${what}`);
};

// ---------------------------------------------------------------- Admin
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/operacoes/clientes");
  await page.getByTestId("ops-clients-empty").waitFor();
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(["Minhas tarefas", "Tarefas", "Comercial", "Clientes", "Filas", "Equipe", "Configurações"]), `abas da Central (${tabs.join(", ")})`);

  // Colocar no fluxo
  await page.getByRole("button", { name: "Colocar cliente no fluxo" }).click();
  let dialog = page.getByRole("dialog", { name: "Colocar cliente no fluxo operacional" });
  await dialog.getByLabel("Cliente", { exact: true }).selectOption({ label: "Loja Aurora" });
  await dialog.getByLabel("Account Manager").selectOption({ label: "Maria Gestora" });
  await dialog.getByRole("button", { name: "Colocar no fluxo" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.locator("[data-testid=ops-kanban-column][data-status=contrato_pago]").getByText("Loja Aurora").waitFor();
  check(db.opsClientOps[AURORA]?.am_user_id === MARIA && db.opsClientOps[AURORA].stage_id === "contrato_pago", "cliente entra no fluxo com o Account Manager");
  check(await page.getByTestId("ops-kanban-column").count() === 9, "9 etapas do onboarding no Kanban");

  // Liberar demanda: Design + Copy (Copy depende do Design), obrigatórias da etapa, com anexo
  await page.getByRole("button", { name: "Liberar demanda" }).click();
  dialog = page.getByRole("dialog", { name: "Liberar demanda" });
  await dialog.getByLabel("Cliente", { exact: true }).selectOption({ label: "Loja Aurora" });
  await dialog.getByLabel("Título da demanda").fill("Lançamento");
  await dialog.getByLabel("Briefing").fill("Campanha de lançamento da coleção");
  await dialog.getByLabel("Etapa do onboarding").selectOption({ label: "Contrato Pago" });
  await dialog.getByLabel("Obrigatórias para o cliente avançar desta etapa").check();
  await dialog.getByLabel("Setor da linha 1").selectOption({ label: "Design" });
  await dialog.getByLabel("Responsável da linha 1").selectOption({ label: "Bia Designer" });
  await dialog.getByLabel("Prioridade da linha 1").selectOption("alta");
  await dialog.getByRole("button", { name: "Outro setor" }).click();
  await dialog.getByLabel("Setor da linha 2").selectOption({ label: "Copy" });
  await dialog.getByLabel("Dependência da linha 2").selectOption({ label: "Depende da linha 1 (Design)" });
  await dialog.getByLabel("Anexos").setInputFiles({ name: "briefing.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 briefing") });
  await dialog.getByRole("button", { name: "Liberar para 2 setor(es)" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByText("Demanda #1 liberada.").waitFor();
  const [td, tc] = db.opsTasks;
  check(db.opsDemands.length === 1 && td?.demand_id === db.opsDemands[0].id && tc?.demand_id === db.opsDemands[0].id, "uma tarefa por setor, ligadas à demanda");
  check(td.title === "Lançamento — Design" && td.mandatory && td.client_stage_id === "contrato_pago" && td.people[0]?.user_id === BIA, "tarefa do Design com responsável e etapa");
  check(db.opsDeps.some((d) => d.task_id === tc.id && d.depends_on_id === td.id), "Copy depende do Design");
  check(db.opsAttachments.length === 2 && db.opsAttachments.every((a) => a.name === "briefing.pdf"), "anexo vai para cada tarefa criada");

  // Regra: com obrigatórias abertas, o cliente não avança
  const card = page.locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
  await card.getByText("2 obrigatória(s) aberta(s) nesta etapa").waitFor();
  await dragTo(page, card, page.locator("[data-testid=ops-kanban-column][data-status=onboarding_pendente]"));
  await page.getByText("Há 2 tarefa(s) obrigatória(s) aberta(s) nesta etapa").waitFor();
  await page.locator("[data-testid=ops-kanban-column][data-status=contrato_pago]").getByText("Loja Aurora").waitFor();
  check(db.opsClientOps[AURORA].stage_id === "contrato_pago", "avanço recusado e o cartão volta");
  await page.screenshot({ path: `${SHOTS}/ops-clientes.png`, fullPage: true });

  // Ficha operacional: resumo, registro manual e histórico
  await card.click();
  const drawer = page.getByTestId("ops-client-drawer");
  await drawer.getByTestId("ops-client-summary").waitFor();
  const summaryText = await drawer.getByTestId("ops-client-summary").innerText();
  check(summaryText.includes("0% · 0/2 obrigatórias") && summaryText.includes("Design") && summaryText.includes("Copy"), "resumo com progresso e setores envolvidos");
  await drawer.getByRole("button", { name: "Registrar atividade" }).click();
  dialog = page.getByRole("dialog", { name: "Registrar atividade" });
  await dialog.getByLabel("Tipo de atividade").selectOption({ label: "Reunião com cliente" });
  await dialog.getByLabel("Título").fill("Reunião de start");
  await dialog.getByLabel("Próximo passo").fill("Enviar cronograma");
  await dialog.getByLabel("Anexo").setInputFiles({ name: "ata.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 ata") });
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await dialog.waitFor({ state: "detached" });
  check(db.opsClientNotes[0]?.title === "Reunião de start" && db.opsClientNotes[0].attachment_path?.startsWith(`cliente-${AURORA}/`),
    "atividade registrada com anexo na pasta privada do cliente");
  await drawer.getByRole("button", { name: "Histórico Operacional" }).click();
  await drawer.getByTestId("ops-client-note").getByText("Reunião de start").waitFor();
  const hist = await drawer.getByTestId("ops-client-history").innerText();
  check(hist.includes("Liberou uma demanda") && hist.includes("Colocou o cliente no fluxo operacional") && hist.includes("Próximo passo: Enviar cronograma"),
    "histórico operacional junta demanda, entrada no fluxo e atividade registrada");
  await drawer.getByRole("button", { name: "Tarefas", exact: true }).click();
  await drawer.getByTestId("ops-client-demands").getByText("#1 Lançamento").waitFor();
  check(await drawer.getByTestId("ops-task-row").count() === 2, "ficha mostra as tarefas de todos os setores");
  await page.screenshot({ path: `${SHOTS}/ops-ficha-cliente.png` });
  await drawer.getByRole("button", { name: "Fechar ficha" }).click();

  // Regra de avanço automático ligada na etapa
  await page.getByRole("link", { name: "Configurações" }).last().click();
  await page.getByTestId("ops-client-stages").waitFor();
  await page.getByRole("button", { name: "Editar etapa Contrato Pago" }).click();
  dialog = page.getByRole("dialog", { name: "Editar etapa" });
  await dialog.getByLabel(/Avançar sozinho/).check();
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await dialog.waitFor({ state: "detached" });
  check(db.opsClientStages[0].auto_advance === true, "regra de avanço automático ligada");
  await page.getByLabel("Setor da fila").selectOption({ label: "Design" });
  await page.getByTestId("ops-queue-row").first().waitFor();
  check(await page.getByTestId("ops-queue-row").count() === 5 && await page.getByTestId("ops-activity-type-row").count() === 7, "filas e tipos de atividade nas configurações");

  // Filas: Design e Copy entregam; o cliente avança sozinho
  await page.getByRole("link", { name: "Filas" }).click();
  await page.getByTestId("ops-queues").waitFor();
  await page.getByLabel("Setor").selectOption({ label: "Design" });
  const dcol = (name) => page.getByTestId("ops-kanban-column").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await dcol("Criativos pendentes").getByText("Lançamento — Design").waitFor();
  check(await page.getByTestId("ops-kanban-column").count() === 5, "fila do Design com as 5 colunas");
  await dragTo(page, page.locator(`[data-testid=ops-kanban-card][data-task="${td.number}"]`), dcol("Entregas concluídas"));
  await waitFor(page, () => td.status_id === "finalizado", "Design finalizado pela fila");
  check(td.queue_column_id && db.opsActivity.some((a) => a.action === "tarefa.fila"), "mover na fila muda o status e fica no histórico");
  check(db.opsClientOps[AURORA].stage_id === "contrato_pago", "com uma obrigatória ainda aberta, não avança");
  await page.getByLabel("Setor").selectOption({ label: "Copy" });
  await dcol("Textos solicitados").getByText("Lançamento — Copy").waitFor();
  await dragTo(page, page.locator(`[data-testid=ops-kanban-card][data-task="${tc.number}"]`), dcol("Entregas concluídas"));
  await waitFor(page, () => tc.status_id === "finalizado", "Copy finalizado pela fila");
  check(db.opsClientOps[AURORA].stage_id === "onboarding_pendente", "todas as obrigatórias concluídas: avançou sozinho");
  check(db.opsActivity.some((a) => a.action === "cliente.etapa" && a.origin === "sistema" && String(a.after.regra).includes("Avanço automático")),
    "avanço automático registrado com a regra, como Sistema");
  await page.screenshot({ path: `${SHOTS}/ops-filas.png`, fullPage: true });

  // Abas na ficha do cliente (cadastro atual): Dados gerais continua igual
  await page.goto(`${BASE}/clientes/${AURORA}`);
  await page.getByRole("heading", { name: "Dados cadastrais" }).waitFor();
  const clientTabs = await page.getByRole("navigation", { name: "Abas do cliente" }).getByRole("button").allInnerTexts();
  check(JSON.stringify(clientTabs) === JSON.stringify(["Dados gerais", "Tarefas", "Histórico Operacional"]), `abas na ficha do cliente (${clientTabs.join(", ")})`);
  await page.getByRole("button", { name: "Histórico Operacional" }).click();
  await page.getByTestId("client-ops-tab").getByText(/Avanço automático/).first().waitFor();
  check(page.url().includes("aba=historico"), "aba fica no endereço");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// ---------------------------------------------------------------- Account Manager (sem "ver a ficha operacional")
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Account Manager"), secondary: [], job_title: "AM", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.tasks.create", "ops.cards.move"] };
  const now = new Date().toISOString();
  db.opsClientOps[AURORA] = { stage_id: "briefing", am_user_id: USER_ID, started_at: now, stage_since: now, version: 1 };
  db.opsClientOps[BETA] = { stage_id: "briefing", am_user_id: MARIA, started_at: now, stage_since: now, version: 1 };
  db.opsTasks.push({ id: crypto.randomUUID(), number: ++db.opsTaskSeq, title: "Arte do feed", description: null, client_id: AURORA, sector_id: sectorId(db, "Design"),
    priority: "urgente", start_date: null, due_date: null, effort_hours: null, visibility: "setor", tags: [], status_id: "em_andamento",
    people: [{ user_id: BIA, role: "principal" }], version: 1, created_by: BIA, created_at: now, updated_at: now, completed_at: null, archived_at: null,
    demand_id: null, client_stage_id: null, mandatory: false, queue_column_id: null });
  await login(page, "/operacoes/clientes");
  await page.getByTestId("ops-clients").waitFor();
  await page.getByTestId("ops-client-card").first().waitFor();
  const names = await page.getByTestId("ops-client-card").locator("p.text-sm.font-semibold").allInnerTexts();
  check(JSON.stringify(names) === JSON.stringify(["Loja Aurora"]), `AM vê só os clientes dele (${names.join(", ")})`);
  check(await page.getByRole("button", { name: "Colocar cliente no fluxo" }).count() === 0, "sem permissão, não coloca clientes no fluxo");
  await page.getByTestId("ops-client-card").first().click();
  const drawer = page.getByTestId("ops-client-drawer");
  await drawer.getByRole("button", { name: "Tarefas", exact: true }).click();
  await drawer.getByText("Arte do feed").waitFor();
  check(true, "AM vê a demanda do Design no cliente dele (sem ser do setor)");
  check(await drawer.getByRole("button", { name: "Registrar atividade" }).count() === 0, "sem 'registrar atividades': botão não aparece");
  check(errors.length === 0, `sem erros (AM) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Papel Equipe: sem aba Clientes
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  seed(db);
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.kanban.view"] };
  await login(page, "/operacoes/clientes");
  await page.waitForURL("**/operacoes/minhas-tarefas");
  await page.getByTestId("ops-my-tasks").waitFor();
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(!tabs.includes("Clientes") && tabs.includes("Filas"), `designer sem a aba Clientes (${tabs.join(", ")})`);
  await page.getByRole("link", { name: "Filas" }).click();
  await page.getByTestId("ops-queues").waitFor();
  check((await page.getByLabel("Setor").inputValue()) === sectorId(db, "Design"), "fila abre no setor da pessoa");
  check(errors.length === 0, `sem erros (equipe) ${errors.join(" | ")}`);
  await browser.close();
}
