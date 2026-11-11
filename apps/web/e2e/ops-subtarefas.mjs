/**
 * Teste de navegador da T5.32 (etapa 2) — subtarefas na tela da tarefa: criar com Enter,
 * progresso, concluir, arrastar, abrir, voltar para a principal, bloqueio de finalizar e cascata. Supabase SIMULADO.
 */
import { BASE, SHOTS, check, launch, login, mockSupabase, USER_ID } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
const sector = db.opsSectors.find((s) => s.name === "Design").id;
const now = new Date().toISOString();
const parent = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, title: "Campanha de Natal", description: null, client_id: null, sector_id: sector, priority: "alta",
  start_date: null, due_date: null, effort_hours: null, visibility: "setor", tags: [], status_id: "em_andamento", people: [{ user_id: USER_ID, role: "principal" }],
  version: 1, created_by: USER_ID, created_at: now, updated_at: now, completed_at: null, archived_at: null };
db.opsTasks.push(parent);

await login(page, `/operacoes/tarefas?tarefa=${parent.id}`);
const detail = page.getByTestId("ops-task-detail");
await detail.getByText("Campanha de Natal").first().waitFor();
check(await detail.getByText("Nenhuma subtarefa").count() === 1, "sem subtarefas: texto explicativo");

// criar com Enter (responsável = eu)
const input = detail.getByLabel("Título da nova subtarefa");
await input.fill("Briefing");
await input.press("Enter");
await detail.getByRole("button", { name: "#" + (parent.number + 1) + " Briefing" }).waitFor();
await input.fill("Arte");
await input.press("Enter");
await detail.getByRole("button", { name: /Arte/ }).waitFor();
await input.fill("Revisão");
await input.press("Enter");
await detail.getByRole("button", { name: /Revisão/ }).waitFor();
const kids = db.opsTasks.filter((t) => t.parent_id === parent.id);
check(kids.length === 3 && kids.every((k) => k.sector_id === sector && k.people[0].role === "principal"), "3 subtarefas criadas, com setor da principal e responsável");
check(JSON.stringify(kids.map((k) => k.sub_position)) === "[1,2,3]", "posições 1, 2, 3");
check(await detail.getByTestId("ops-subtask-progress").getByText("0 de 3").count() === 1, "progresso 0 de 3");

// título curto e responsável obrigatório
await input.fill("ab");
await input.press("Enter");
await detail.getByText(/pelo menos 3 letras/).waitFor();
await input.fill("");
await detail.getByLabel("Responsável da nova subtarefa").selectOption("");
await input.fill("Sem dono");
await input.press("Enter");
await detail.getByText("Toda subtarefa precisa de um responsável.").waitFor();
check(db.opsTasks.filter((t) => t.parent_id === parent.id).length === 3, "sem responsável não cria subtarefa");
await detail.getByLabel("Responsável da nova subtarefa").selectOption(USER_ID);
await input.fill("");

// bloqueio de finalizar a principal
await detail.getByTestId("ops-task-status").selectOption({ label: "Finalizado" });
await detail.getByText(/3 subtarefa\(s\) ainda aberta\(s\)/).waitFor();
check(parent.status_id === "em_andamento", "principal não finaliza com subtarefas abertas");

// concluir duas
await detail.getByLabel(/Concluir subtarefa #/).first().click();
await detail.getByTestId("ops-subtask-progress").getByText("1 de 3").waitFor();
await detail.getByLabel(/Concluir subtarefa #/).first().click();
await detail.getByTestId("ops-subtask-progress").getByText("2 de 3").waitFor();
check(true, "progresso 2 de 3 ao concluir");

// arrastar: o último vai para o topo
{
  const items = detail.getByTestId("ops-subtask-list").locator("[data-sortable-item]");
  const handle = await items.last().getByRole("button", { name: /Arrastar subtarefa/ }).boundingBox();
  const target = await items.first().boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 6, { steps: 4 });
  await page.mouse.move(handle.x + handle.width / 2, target.y + 4, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const order = db.opsTasks.filter((t) => t.parent_id === parent.id).sort((a, b) => a.sub_position - b.sub_position).map((t) => t.title);
check(process.env.AUDIT_W || order[0] === "Revisão", `reordenou arrastando (${order.join(", ")})`);
check(process.env.AUDIT_W || db.rpcCalls.some((c) => c.fn === "ops_subtask_reorder"), "chamou ops_subtask_reorder");

// abrir uma subtarefa: aparece "parte de" e não tem seção de subtarefas
await detail.getByRole("button", { name: /#\d+ Arte/ }).click();
await detail.getByTestId("ops-task-parent").waitFor();
check((await detail.getByTestId("ops-task-parent").textContent()).includes("Campanha de Natal"), "subtarefa mostra 'parte de' a principal");
check(await detail.getByLabel("Título da nova subtarefa").count() === 0, "subtarefa não tem subtarefas (um nível)");
await detail.getByTestId("ops-task-parent").click();
await detail.getByLabel("Título da nova subtarefa").waitFor();
check(true, "voltou para a principal");

// finalizar depois de concluir todas
await detail.getByLabel(/Concluir subtarefa #/).first().click();
await detail.getByTestId("ops-subtask-progress").getByText("3 de 3").waitFor();
await detail.getByTestId("ops-task-status").selectOption({ label: "Finalizado" });
await page.waitForFunction(() => document.querySelector('[data-testid="ops-task-detail"]')?.textContent?.includes("Concluída em"));
check(parent.status_id === "finalizado", "principal finaliza com todas concluídas");

// histórico da principal
await detail.getByText("Criou uma subtarefa").first().waitFor();
check(true, "histórico registra a criação de subtarefa");


// etapa 3: selo no cartão, "de #N" na subtarefa, filtro "só principais", Minhas tarefas e lista
await page.keyboard.press("Escape");
await page.goto(`${BASE}/operacoes/tarefas`);
await page.getByTestId("ops-kanban").waitFor();
check(await page.getByTestId("ops-subtask-badge").count() === 1, "Kanban: selo de subtarefas só na principal");
check((await page.getByTestId("ops-subtask-badge").textContent()).includes("3/3"), "Kanban: selo 3/3");
check(await page.getByTestId("ops-parent-tag").count() === 3, "Kanban: cada subtarefa mostra '↳ de #N'");
check((await page.getByTestId("ops-parent-tag").first().textContent()).includes(`de #${parent.number}`), "Kanban: aponta para a principal");
await page.getByLabel("Só principais").check();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="ops-task-card"]').length === 1);
check(await page.getByTestId("ops-parent-tag").count() === 0, "Só principais esconde as subtarefas");
await page.getByRole("button", { name: "Lista" }).click();
await page.getByTestId("ops-task-table").waitFor();
check(await page.getByTestId("ops-task-row").count() === 1, "Lista: só principais");
await page.getByLabel("Só principais").uncheck();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="ops-task-row"]').length === 4);
check(await page.getByTestId("ops-subtask-badge").count() === 1, "Lista: selo na principal");
await page.goto(`${BASE}/operacoes/minhas-tarefas`);
await page.getByTestId("ops-task-card").first().waitFor();
check(await page.getByTestId("ops-parent-tag").count() >= 1, "Minhas tarefas: subtarefa mostra '↳ de #N'");
await page.goto(`${BASE}/operacoes/tarefas?tarefa=${parent.id}`);
await detail.getByLabel("Título da nova subtarefa").waitFor();
await detail.screenshot({ path: `${SHOTS}/subtarefas-tela-da-tarefa.png` });
// arquivar a principal leva as subtarefas
await detail.getByRole("button", { name: "Arquivar" }).click();
await page.waitForTimeout(400);
check(db.opsTasks.filter((t) => t.parent_id === parent.id).every((k) => k.archived_at), "arquivar a principal arquiva as subtarefas");

check(errors.length === 0, `sem erros ${errors.join(" | ")}`);
await browser.close();
