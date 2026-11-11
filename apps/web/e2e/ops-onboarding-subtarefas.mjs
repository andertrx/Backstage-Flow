/** T5.32 etapa 5 — subtarefas padrão nos modelos do onboarding e progresso no cartão do cliente. Supabase SIMULADO. */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const AURORA = "c1000000-0000-4000-8000-000000000001";
const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
const now = new Date().toISOString();
db.clients.push({ id: AURORA, name: "Loja Aurora", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-20T12:00:00Z", updated_at: "", created_by: null });
db.opsClientOps[AURORA] = { stage_id: "coleta_acessos", am_user_id: null, started_at: now, stage_since: now, version: 1 };
const SECTOR = (n) => db.opsSectors.find((x) => x.name === n).id;
const TIAGO = "55555555-5555-4555-8555-555555555555";
db.profiles.push({ id: TIAGO, email: "tiago@agencia.com", full_name: "Tiago Tráfego", role: "equipe", active: true, created_at: now, updated_at: "" });
db.opsMembers[TIAGO] = { primary: SECTOR("Gestão de Tráfego"), secondary: [], job_title: "Tráfego", active: true, joins_meetings: true, permissions: ["ops.access", "ops.tasks.create"] };

// 1) cadastrar o modelo com subtarefas (Configurações)
await login(page, "/operacoes/configuracoes?ver=estrutura");
const box = page.getByTestId("ops-onboarding-templates");
await box.getByRole("button", { name: "Nova tarefa padrão" }).click();
const form = page.getByTestId("ops-template-form");
await form.getByLabel("Título").fill("Pegar acessos");
await form.getByLabel("Setor").selectOption({ label: "Gestão de Tráfego" });
await form.getByLabel(/Subtarefas padrão/).fill("Pedir acesso ao Meta\nab");
await form.getByRole("button", { name: "Salvar" }).click();
await form.getByText(/pelo menos 3 letras/).waitFor();
check(db.opsOnboardingTemplates.length === 0, "subtarefa padrão curta: nada é salvo");
await form.getByLabel(/Subtarefas padrão/).fill("Pedir acesso ao Meta\nPedir acesso ao Google\n\nConferir pixel");
await form.getByRole("button", { name: "Salvar" }).click();
await form.waitFor({ state: "detached" });
check(JSON.stringify(db.opsOnboardingTemplates[0].subtasks) === '["Pedir acesso ao Meta","Pedir acesso ao Google","Conferir pixel"]', "modelo guarda 3 subtarefas padrão");
await box.getByText(/3 subtarefa\(s\)/).waitFor();
check(true, "lista do modelo mostra '3 subtarefa(s)'");

// 2) no cartão do cliente: marcar a tarefa e desmarcar uma subtarefa
await page.setViewportSize({ width: 1900, height: 900 });
await page.goto(`${new URL(page.url()).origin}/onboarding`);
const card = page.locator("[data-testid=ops-kanban-column][data-status=coleta_acessos] [data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await card.getByRole("button", { name: "Tarefas do onboarding" }).click();
const dialog = page.getByRole("dialog", { name: /Tarefas do onboarding: Loja Aurora/ });
const tpl = dialog.getByTestId("ops-onb-template").first();
check(await tpl.getByTestId("ops-onb-subtasks").count() === 0, "subtarefas só aparecem depois de marcar a tarefa");
await tpl.getByRole("checkbox").first().check();
check(await tpl.getByTestId("ops-onb-subtasks").getByRole("checkbox", { checked: true }).count() === 3, "as 3 subtarefas vêm marcadas");
await tpl.getByTestId("ops-onb-subtasks").getByLabel("Conferir pixel").uncheck();
await page.screenshot({ path: `${SHOTS}/t532-5-onboarding-subtarefas.png`, fullPage: true });
await dialog.getByTestId("ops-onb-tasks-submit").click();
await dialog.waitFor({ state: "detached" });
const main = db.opsTasks.find((t) => t.title === "Pegar acessos");
const kids = db.opsTasks.filter((t) => t.parent_id === main.id);
check(kids.length === 2 && kids.map((k) => k.title).join() === "Pedir acesso ao Meta,Pedir acesso ao Google", "criou a tarefa e só as 2 subtarefas marcadas");
check(kids.every((k) => k.client_id === AURORA && k.sector_id === main.sector_id && k.people.some((p) => p.role === "principal" && p.user_id === TIAGO)), "subtarefas com cliente, setor e responsável");

// 3) progresso no cartão do cliente
await page.reload();
const card2 = page.locator("[data-testid=ops-kanban-column][data-status=coleta_acessos] [data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await card2.getByTestId("ops-client-subtasks").waitFor();
check((await card2.getByTestId("ops-client-subtasks").innerText()).includes("0/2"), "cartão do cliente mostra ▸ 0/2 subtarefas");
kids[0].status_id = "finalizado";
kids[0].completed_at = now;
await page.reload();
await page.locator("[data-testid=ops-client-subtasks]").filter({ hasText: "1/2" }).waitFor();
check(true, "progresso do cliente acompanha as concluídas (1/2)");
check(errors.length === 0, `sem erros ${errors.join(" | ")}`);
await browser.close();
