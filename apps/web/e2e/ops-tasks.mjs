/**
 * Teste de navegador da Etapa 36.2 — Central de Operações: tarefas (Kanban,
 * lista, Minhas tarefas, detalhe, comentários, anexos, dependências, status
 * configuráveis, contagens na Equipe e permissões). Supabase SIMULADO.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;
const day = (n) => {
  const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Tarefa direto no banco simulado (para montar cenários). */
function seedTask(db, fields) {
  const now = new Date().toISOString();
  const t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, description: null, client_id: null, priority: "media", start_date: null, due_date: null,
    effort_hours: null, visibility: "setor", tags: [], status_id: "nao_iniciado", people: [], version: 1, created_by: USER_ID, created_at: now,
    updated_at: now, completed_at: null, archived_at: null, ...fields };
  db.opsTasks.push(t);
  return t;
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

// ---------------------------------------------------------------- Admin
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push({ id: "c1000000-0000-4000-8000-000000000001", name: "Loja Aurora", status: "ativo", is_demo: false });
  db.opsMembers[MARIA] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.kanban.view", "ops.tasks.create", "ops.tasks.edit", "ops.cards.move"] };
  await login(page, "/operacoes/minhas-tarefas");
  await page.waitForURL("**/operacoes/minhas-tarefas");
  await page.getByTestId("ops-my-empty").waitFor();
  check(true, "Minhas tarefas vazia explica o que aparece ali");

  await page.getByRole("link", { name: "Tarefas" }).last().click();
  await page.getByTestId("ops-kanban").waitFor();
  check(await page.getByTestId("ops-kanban-column").count() === 8, "Kanban com as 8 colunas de status");

  // Nova tarefa
  await page.getByRole("button", { name: "Nova tarefa" }).click();
  let dialog = page.getByRole("dialog", { name: "Nova tarefa" });
  await dialog.getByRole("button", { name: "Criar tarefa" }).click();
  await dialog.getByText("Escreva o título (mínimo 3 letras).").waitFor();
  check(true, "título obrigatório");
  await dialog.getByLabel("Título").fill("Criar criativos Black Friday");
  await dialog.getByLabel("Cliente").selectOption({ label: "Loja Aurora" });
  await dialog.getByLabel("Setor").selectOption({ label: "Design" });
  await dialog.getByLabel("Prioridade").selectOption("alta");
  await dialog.getByLabel("Prazo").fill(day(-1));
  await dialog.getByLabel("Etiquetas").fill("Campanha, campanha, Black Friday");
  await dialog.getByLabel("Responsável principal").selectOption({ label: "Maria Gestora" });
  await dialog.getByLabel("Adicionar em Observadores").selectOption({ label: "Ander Rodrigues" });
  await dialog.getByRole("button", { name: "Criar tarefa" }).click();
  await dialog.waitFor({ state: "detached" });
  const t1 = db.opsTasks[0];
  check(t1?.title === "Criar criativos Black Friday" && t1.priority === "alta" && t1.client_id && JSON.stringify(t1.tags) === '["Black Friday","Campanha"]',
    "tarefa criada com cliente, prioridade e etiquetas sem repetir");
  check(t1.people.some((p) => p.user_id === MARIA && p.role === "principal") && t1.people.some((p) => p.user_id === USER_ID && p.role === "observador"),
    "pessoas gravadas com o papel certo");
  await page.getByTestId("ops-task-detail").waitFor();
  check(page.url().includes(`tarefa=${t1.id}`), "detalhe abre sozinho e fica no endereço (link compartilhável)");
  await page.getByTestId("ops-task-history").getByText("Criou a tarefa").waitFor();
  const detailText = await page.getByTestId("ops-task-detail").innerText();
  check(detailText.includes("Loja Aurora") && detailText.includes("Atrasada") && detailText.includes("Criou a tarefa"), "detalhe mostra cliente, atraso e histórico");

  // Comentário com menção e anexo
  const detail = page.getByTestId("ops-task-detail");
  await detail.getByLabel("Mencionar pessoa").selectOption({ label: "Maria Gestora" });
  await detail.getByLabel("Novo comentário").press("End");
  await detail.getByLabel("Novo comentário").pressSequentially("pode revisar?");
  await detail.getByRole("button", { name: "Comentar" }).click();
  await detail.getByText("Mencionou: Maria Gestora").waitFor();
  check(db.opsComments[0]?.body === "@Maria Gestora pode revisar?" && db.opsComments[0].mentions[0] === MARIA, "comentário com menção gravado");
  await detail.getByTestId("ops-attach-input").setInputFiles({ name: "briefing.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") });
  await detail.getByRole("button", { name: "briefing.pdf", exact: true }).waitFor();
  check(db.opsAttachments[0]?.path.startsWith(`${t1.id}/`) && db.opsAttachments[0].name === "briefing.pdf", "anexo vai para a pasta da tarefa no armazenamento privado");
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  await detail.getByRole("button", { name: "briefing.pdf", exact: true }).click();
  await page.waitForFunction(() => window.__opened.length === 1);
  const opened = await page.evaluate(() => window.__opened[0]);
  check(opened.includes("/storage/v1/object/sign/ops-files/") && opened.includes("token="), "anexo abre por link temporário assinado");
  await page.screenshot({ path: `${SHOTS}/ops-tarefa-detalhe.png` });
  await detail.getByRole("button", { name: "Fechar tarefa" }).click();
  await detail.waitFor({ state: "detached" });

  // Segunda tarefa depende da primeira
  const t2 = seedTask(db, { title: "Subir campanha Black Friday", sector_id: sectorId(db, "Gestão de Tráfego"), people: [{ user_id: USER_ID, role: "principal" }],
    due_date: day(3) });
  await page.goto(`${BASE}/operacoes/tarefas?tarefa=${t2.id}`);
  await page.getByTestId("ops-task-detail").getByText("Subir campanha Black Friday").first().waitFor();
  await page.getByRole("button", { name: "Depende de…" }).click();
  await page.getByLabel("Tarefa da qual esta depende").selectOption({ label: `#${t1.number} Criar criativos Black Friday` });
  await page.getByText("depende de 1 tarefa(s) ainda aberta(s)").waitFor();
  check(db.opsDeps.length === 1, "dependência criada");
  await page.getByTestId("ops-task-status").selectOption("finalizado");
  await page.getByText("Conclua ou retire a dependência antes de finalizar").waitFor();
  check(db.opsTasks[1].status_id === "nao_iniciado", "tarefa bloqueada não finaliza");
  await page.getByRole("button", { name: "Fechar tarefa" }).click();

  // Kanban: arrastar
  await page.getByTestId("ops-kanban").waitFor();
  const card = page.locator(`[data-testid=ops-kanban-card][data-task="${t1.number}"]`);
  await dragTo(page, card, page.locator("[data-testid=ops-kanban-column][data-status=em_andamento]"));
  await page.locator("[data-testid=ops-kanban-column][data-status=em_andamento]").getByText("Criar criativos Black Friday").waitFor();
  await page.waitForFunction(() => true);
  for (let i = 0; i < 20 && db.opsTasks[0].status_id !== "em_andamento"; i++) await page.waitForTimeout(100);
  check(db.opsTasks[0].status_id === "em_andamento", "arrastar o cartão muda o status no banco");
  check(db.opsActivity.some((a) => a.action === "tarefa.status" && a.after.status === "em_andamento"), "mudança vai para o histórico");

  // Conflito de versão: alguém mudou antes
  db.opsTasks[0].version += 1;
  await dragTo(page, card, page.locator("[data-testid=ops-kanban-column][data-status=em_revisao]"));
  await page.getByText("Alguém alterou esta tarefa antes de você").waitFor();
  await page.locator("[data-testid=ops-kanban-column][data-status=em_andamento]").getByText("Criar criativos Black Friday").waitFor();
  check(db.opsTasks[0].status_id === "em_andamento", "versão velha: recusa, avisa e o cartão volta");
  await page.screenshot({ path: `${SHOTS}/ops-kanban.png`, fullPage: true });

  // Lista e filtros
  await page.getByRole("button", { name: "Lista" }).click();
  await page.getByTestId("ops-task-table").waitFor();
  check(await page.getByTestId("ops-task-row").count() === 2, "lista com as 2 tarefas");
  await page.getByLabel("Filtrar por prazo").selectOption("atrasadas");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-task-row]").length === 1);
  check((await page.getByTestId("ops-task-row").innerText()).includes("Criar criativos"), "filtro de atrasadas");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Buscar tarefa").fill(`#${t2.number}`);
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-task-row]").length === 1);
  check((await page.getByTestId("ops-task-row").innerText()).includes("Subir campanha"), "busca pelo número");
  await page.getByLabel("Buscar tarefa").fill("");

  // Minhas tarefas (sou principal na #2 e observador na #1)
  await page.getByRole("link", { name: "Minhas tarefas" }).click();
  await page.getByTestId("ops-my-tasks").waitFor();
  await page.locator("[data-testid=ops-my-section]").first().waitFor();
  const sections = await page.locator("[data-testid=ops-my-section]").evaluateAll((els) => els.map((e) => e.dataset.section));
  check(JSON.stringify(sections) === JSON.stringify(["atrasadas", "terceiros"]), `seções de Minhas tarefas (${sections.join(", ")})`);
  await page.screenshot({ path: `${SHOTS}/ops-minhas-tarefas.png`, fullPage: true });

  // Equipe: contagens
  await page.getByRole("link", { name: "Equipe" }).last().click();
  await page.getByTestId("ops-team").waitFor();
  const maria = page.getByTestId("ops-team-row").filter({ hasText: "Maria Gestora" });
  await maria.getByText("1 abertas").waitFor();
  check((await maria.innerText()).includes("1 atrasadas"), "Equipe mostra abertas, em andamento e atrasadas por pessoa");

  // Configurações → Status
  await page.getByRole("link", { name: "Configurações" }).last().click();
  await page.getByTestId("ops-statuses").waitFor();
  check(await page.getByTestId("ops-status-row").count() === 8, "8 status iniciais");
  db.opsTasks[0].status_id = "em_revisao";
  await page.getByRole("button", { name: "Desativar Em Revisão" }).click();
  dialog = page.getByRole("dialog", { name: 'Desativar "Em Revisão"' });
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await dialog.getByText("Escolha para qual status elas vão").waitFor();
  check(true, "status em uso não desativa sem destino");
  await dialog.getByLabel("Tarefas que estão neste status vão para").selectOption({ label: "Em Andamento" });
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await dialog.waitFor({ state: "detached" });
  check(db.opsTasks[0].status_id === "em_andamento" && db.opsActivity.at(-1).origin === "sistema", "tarefas movidas e registradas como feitas pelo sistema");
  await page.getByRole("button", { name: "Editar Finalizado" }).click();
  dialog = page.getByRole("dialog", { name: "Editar status" });
  await dialog.getByLabel("Nome").fill("Entregue");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByTestId("ops-statuses").getByText("Entregue").waitFor();
  check(true, "renomear status");

  // Arquivar
  await page.goto(`${BASE}/operacoes/tarefas?tarefa=${t2.id}`);
  await page.getByRole("button", { name: "Arquivar" }).click();
  await page.getByRole("button", { name: "Desarquivar" }).waitFor();
  await page.getByRole("button", { name: "Fechar tarefa" }).click();
  await page.getByTestId("ops-task-table").waitFor();
  check((await page.getByTestId("ops-task-row").count()) === 1, "arquivada some da lista (a escolha Lista ficou lembrada)");
  await page.getByLabel("Só arquivadas").check();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-task-row]").length === 1
    && document.querySelector("[data-testid=ops-task-row]").textContent.includes("Subir campanha"));
  check(true, "e aparece em 'Só arquivadas' (nada é apagado)");
  check(db.opsTasks.length === 2, "tarefa continua guardada");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// ---------------------------------------------------------------- Papel Equipe (sem "atribuir" nem "arquivar")
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.tasks.create", "ops.tasks.edit"] };
  db.opsMembers[MARIA] = { primary: sectorId(db, "Copy"), secondary: [], job_title: "Copy", active: true, joins_meetings: true, permissions: ["ops.access"] };
  const mine = seedTask(db, { title: "Arte do post", sector_id: sectorId(db, "Design"), people: [{ user_id: USER_ID, role: "principal" }], due_date: day(0) });
  seedTask(db, { title: "Texto secreto do Copy", sector_id: sectorId(db, "Copy"), people: [{ user_id: MARIA, role: "principal" }], created_by: MARIA });
  await login(page, "/");
  await page.waitForURL("**/operacoes/minhas-tarefas");
  await page.locator("[data-section=hoje]").getByText("Arte do post").waitFor();
  check(true, "Minhas tarefas: prazo de hoje em 'Para hoje'");
  check(await page.getByRole("button", { name: "Kanban" }).count() === 0, "sem 'ver o Kanban': só lista");

  await page.getByRole("link", { name: "Tarefas" }).last().click();
  await page.getByTestId("ops-task-table").waitFor();
  const rows = await page.getByTestId("ops-task-row").allInnerTexts();
  check(rows.length === 1 && rows[0].includes("Arte do post"), "não vê tarefa de outro setor");
  await page.goto(`${BASE}/operacoes/tarefas?tarefa=${db.opsTasks[1].id}`);
  await page.getByText("Tarefa não encontrada ou você não tem acesso a ela.").waitFor();
  check(true, "link direto para tarefa de outro setor não abre");

  await page.goto(`${BASE}/operacoes/tarefas`);
  await page.getByRole("button", { name: "Nova tarefa" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova tarefa" });
  const options = await dialog.getByLabel("Responsável principal").locator("option").allInnerTexts();
  check(!options.includes("Maria Gestora") && (await dialog.innerText()).includes("Você pode colocar só você mesmo"), "sem 'atribuir': só coloca a si mesmo");
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  await page.goto(`${BASE}/operacoes/tarefas?tarefa=${mine.id}`);
  await page.getByTestId("ops-task-detail").getByText("Arte do post").first().waitFor();
  check(await page.getByRole("button", { name: "Arquivar" }).count() === 0, "sem 'arquivar': botão não aparece");
  check(await page.getByTestId("ops-task-detail").getByLabel("Mencionar pessoa").locator("option", { hasText: "Maria Gestora" }).count() === 1, "lista de menções");
  await page.getByTestId("ops-task-detail").getByLabel("Mencionar pessoa").selectOption({ label: "Maria Gestora" });
  await page.getByTestId("ops-task-detail").getByRole("button", { name: "Comentar" }).click();
  await page.getByText("Uma das pessoas mencionadas não enxerga esta tarefa").waitFor();
  check(db.opsComments.length === 0, "não menciona quem não vê a tarefa");
  check(errors.length === 0, `sem erros (equipe) ${errors.join(" | ")}`);
  await browser.close();
}
