/** T5.32 etapa 4 — criar tarefa já com subtarefas, transformar em subtarefa e promover. Supabase SIMULADO. */
import { BASE, check, launch, login, mockSupabase, USER_ID } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
await login(page, "/operacoes/tarefas");
await page.getByTestId("ops-kanban").waitFor();

await page.getByRole("button", { name: "Nova tarefa" }).click();
const dialog = page.getByRole("dialog", { name: "Nova tarefa" });
await dialog.getByLabel("Título", { exact: true }).fill("Lançamento do site");
await dialog.getByLabel("Setor").selectOption({ label: "Design" });
await dialog.getByRole("button", { name: "+ Adicionar subtarefas" }).click();
await dialog.getByLabel("Subtarefas").fill("Wireframe\nab");
await dialog.getByRole("button", { name: "Criar tarefa" }).click();
await dialog.getByText(/pelo menos 3 letras/).waitFor();
check(db.opsTasks.length === 0, "subtarefa curta: nada é criado");
await dialog.getByLabel("Subtarefas").fill("Wireframe\nLayout final\n\nPublicar");
await dialog.getByRole("button", { name: "Criar tarefa" }).click();
await dialog.waitFor({ state: "detached" });
const main = db.opsTasks.find((t) => t.title === "Lançamento do site");
const kids = db.opsTasks.filter((t) => t.parent_id === main.id);
check(kids.length === 3 && kids.map((k) => k.title).join() === "Wireframe,Layout final,Publicar", "3 subtarefas criadas na ordem digitada");
check(kids.every((k) => k.sector_id === main.sector_id && k.people.some((p) => p.role === "principal" && p.user_id === USER_ID)), "com setor e responsável da principal");
const detail = page.getByTestId("ops-task-detail");
await detail.getByTestId("ops-subtask-progress").getByText("0 de 3").waitFor();
check(true, "ao criar, a tarefa abre já com as 3 subtarefas");

// promover
await detail.getByRole("button", { name: /#\d+ Layout final/ }).click();
await detail.getByTestId("ops-task-parent").waitFor();
await detail.getByRole("button", { name: "Promover a tarefa" }).click();
await detail.getByTestId("ops-task-parent").waitFor({ state: "detached" });
const promoted = db.opsTasks.find((t) => t.title === "Layout final");
check(!promoted.parent_id, "promover tira o vínculo com a principal");
check(db.opsTasks.filter((t) => t.parent_id === main.id).length === 2, "a principal ficou com 2");

// transformar em subtarefa
await detail.getByRole("button", { name: "Transformar em subtarefa…" }).click();
await detail.getByLabel("Tarefa principal da qual esta vai ser subtarefa").selectOption({ label: `#${main.number} Lançamento do site` });
await detail.getByTestId("ops-task-parent").waitFor();
check(db.opsTasks.find((t) => t.id === promoted.id).parent_id === main.id, "transformar liga à principal escolhida");
check(db.opsTasks.filter((t) => t.parent_id === main.id).length === 3, "principal volta a ter 3");

// principal com subtarefas não vira subtarefa
await page.goto(`${BASE}/operacoes/tarefas?tarefa=${main.id}`);
await detail.getByLabel("Título da nova subtarefa").waitFor();
check(await detail.getByRole("button", { name: "Transformar em subtarefa…" }).count() === 0, "tarefa com subtarefas não oferece 'transformar'");

// repetição copia as subtarefas abertas
await detail.getByRole("button", { name: "Repetir…" }).click();
const rt = page.getByRole("dialog", { name: "Repetir esta tarefa" });
await rt.getByLabel("Frequência").selectOption("diaria");
await rt.getByRole("button", { name: "Repetir", exact: true }).click();
await rt.waitFor({ state: "detached" });
// o agendador roda de madrugada: aqui adiantamos o início para hoje e recarregamos a lista
db.opsRecurrences.find((r) => r.task_id === main.id).start_date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
await page.goto(`${BASE}/operacoes/tarefas?tarefa=${main.id}`);
for (let i = 0; i < 30 && !db.opsTasks.some((t) => t.recurrence_id); i++) await page.waitForTimeout(100);
const occ = db.opsTasks.find((t) => t.recurrence_id);
check(Boolean(occ), "a repetição gerou a tarefa de hoje");
check(db.opsTasks.filter((t) => t.parent_id === occ.id).map((k) => k.title).sort().join() === "Layout final,Publicar,Wireframe", "a tarefa repetida veio com as 3 subtarefas");
check(db.opsTasks.filter((t) => t.parent_id === occ.id).every((k) => k.status_id === "nao_iniciado"), "subtarefas copiadas começam no status inicial");
check(errors.length === 0, `sem erros ${errors.join(" | ")}`);
await browser.close();
