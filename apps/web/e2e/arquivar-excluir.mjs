/**
 * Teste de navegador da Etapa 51.3 — Arquivar e excluir cartões (tarefas e leads) e a aba "Arquivados e excluídos".
 * Regras: arquivar = quem criou ou está com o cartão; excluir = só quem criou (admin também); restaurar = só admin.
 * Supabase SIMULADO.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const now = new Date().toISOString();
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;
const task = (db, title, createdBy, people = []) => ({ id: crypto.randomUUID(), number: ++db.opsTaskSeq, title, description: null, client_id: null,
  sector_id: sectorId(db, "Design"), status_id: "nao_iniciado", priority: "media", start_date: null, due_date: null, effort_hours: null, visibility: "equipe",
  tags: [], people, version: 1, created_by: createdBy, created_at: now, updated_at: now, completed_at: null, archived_at: null, demand_id: null,
  client_stage_id: null, mandatory: false, queue_column_id: null });
const lead = (db, company, createdBy, extra = {}) => ({ id: crypto.randomUUID(), number: ++db.opsLeadSeq, company_name: company, contact_name: null, phone: null,
  email: null, cnpj: null, segment: null, city: null, state: null, origin: null, service_interest: null, owner_id: null, notes: null, potential_value: null,
  currency: "BRL", priority: "media", entered_at: "2026-11-01", next_action: null, next_action_date: null, stage_id: "prospeccao", stage_since: now,
  last_interaction_at: null, loss_reason_id: null, loss_note: null, lost_at: null, client_id: null, converted_at: null, converted_by: null, archived_at: null,
  version: 1, created_by: createdBy, created_at: now, ...extra });
const waitFor = async (page, fn, what) => {
  for (let i = 0; i < 50; i++) { if (fn()) return; await page.waitForTimeout(100); }
  throw new Error(`FALHOU: ${what}`);
};

// ---------------------------------------------------------------- Pessoa da equipe (sem "Arquivar tarefas")
let shared;
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.tasks.create", "ops.tasks.edit", "ops.cards.move", "ops.commercial"] };
  const mine = task(db, "Minha tarefa", USER_ID);
  const passed = task(db, "Tarefa repassada", MARIA, [{ user_id: USER_ID, role: "principal" }]);
  const other = task(db, "Tarefa de outra pessoa", MARIA);
  db.opsTasks.push(mine, passed, other);
  const myLead = lead(db, "Lead meu", USER_ID);
  const otherLead = lead(db, "Lead de outra pessoa", MARIA);
  db.opsLeads.push(myLead, otherLead);
  shared = { mine, passed, myLead };

  // 1) tarefa que eu criei: arquivar e excluir (com confirmação)
  await login(page, `/operacoes/tarefas?tarefa=${mine.id}`);
  let detail = page.getByTestId("ops-task-detail");
  await detail.getByRole("button", { name: "Arquivar" }).waitFor();
  check(await detail.getByRole("button", { name: "Excluir" }).count() === 1, "tarefa minha: botões Arquivar e Excluir");
  await detail.getByRole("button", { name: "Excluir" }).click();
  const confirm = page.getByTestId("ops-delete-confirm");
  await confirm.getByText(/só o administrador pode restaurar/i).waitFor();
  await confirm.getByRole("button", { name: "Excluir" }).click();
  await waitFor(page, () => Boolean(mine.deleted_at), "tarefa excluída");
  await detail.waitFor({ state: "detached" });
  check(mine.deleted_by === USER_ID && Boolean(mine.archived_at), "excluir marca quem excluiu (não apaga do banco)");
  await page.getByTestId("ops-tasks").waitFor().catch(() => {});
  check(await page.getByText("Minha tarefa").count() === 0, "tarefa excluída some da lista");

  // 2) tarefa repassada para mim: só arquivar
  await page.goto(`${BASE}/operacoes/tarefas?tarefa=${passed.id}`);
  detail = page.getByTestId("ops-task-detail");
  await detail.getByRole("button", { name: "Arquivar" }).waitFor();
  check(await detail.getByRole("button", { name: "Excluir" }).count() === 0, "tarefa repassada: sem Excluir");
  await detail.getByRole("button", { name: "Arquivar" }).click();
  await waitFor(page, () => Boolean(passed.archived_at), "repassada arquivada");

  // 3) tarefa de outra pessoa (que não está comigo): nem arquivar, nem excluir
  await page.goto(`${BASE}/operacoes/tarefas?tarefa=${other.id}`);
  detail = page.getByTestId("ops-task-detail");
  await detail.getByText("Tarefa de outra pessoa").first().waitFor();
  check(await detail.getByRole("button", { name: "Arquivar" }).count() === 0 && await detail.getByRole("button", { name: "Excluir" }).count() === 0,
    "tarefa de outra pessoa: sem Arquivar e sem Excluir");

  // 4) aba "Arquivados e excluídos"
  await page.goto(`${BASE}/operacoes/tarefas`);
  await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link", { name: "Arquivados e excluídos" }).click();
  const archive = page.getByTestId("ops-archive");
  await archive.getByTestId("ops-archive-row").filter({ hasText: "Tarefa repassada" }).waitFor();
  const passedRow = archive.getByTestId("ops-archive-row").filter({ hasText: "Tarefa repassada" });
  check(await passedRow.getByRole("button", { name: "Desarquivar" }).count() === 1 && await passedRow.getByRole("button", { name: "Excluir" }).count() === 0,
    "arquivados: repassada com Desarquivar e sem Excluir");
  check(await archive.getByText("Minha tarefa").count() === 0, "tarefa excluída não fica em Arquivados");
  await archive.getByRole("button", { name: "Excluídos" }).click();
  const delRow = archive.getByTestId("ops-archive-row").filter({ hasText: "Minha tarefa" });
  await delRow.waitFor();
  check((await delRow.innerText()).includes("Excluído em") && await delRow.getByRole("button", { name: "Restaurar" }).count() === 0,
    "excluídos: mostra quando e por quem; sem Restaurar para quem não é admin");
  await page.screenshot({ path: `${SHOTS}/51.3-excluidos.png`, fullPage: true });
  await archive.getByRole("button", { name: "Arquivados" }).click();
  await passedRow.getByRole("button", { name: "Desarquivar" }).click();
  await waitFor(page, () => !passed.archived_at, "repassada desarquivada");
  check(true, "desarquivar pela aba");

  // 5) leads: o meu pode ser excluído; o de outra pessoa nem arquiva
  await page.goto(`${BASE}/comercial?lead=${otherLead.id}`);
  let drawer = page.getByTestId("ops-lead-drawer");
  await drawer.getByText("Lead de outra pessoa").first().waitFor();
  check(await drawer.getByRole("button", { name: "Arquivar" }).count() === 0 && await drawer.getByRole("button", { name: "Excluir" }).count() === 0,
    "lead de outra pessoa: sem Arquivar e sem Excluir");
  await page.goto(`${BASE}/comercial?lead=${myLead.id}`);
  drawer = page.getByTestId("ops-lead-drawer");
  await drawer.getByRole("button", { name: "Excluir" }).click();
  await page.getByTestId("ops-delete-confirm").getByRole("button", { name: "Excluir" }).click();
  await waitFor(page, () => Boolean(myLead.deleted_at), "lead excluído");
  await page.goto(`${BASE}/operacoes/arquivados?tipo=leads&ver=excluidos`);
  await page.getByTestId("ops-archive-row").filter({ hasText: "Lead meu" }).waitFor();
  check(true, "lead excluído aparece em Excluídos (leads)");
  check(errors.length === 0, `sem erros (equipe) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Administrador: restaura (volta arquivado)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  const t = { ...shared.mine };
  db.opsTasks.push(t);
  await login(page, "/operacoes/arquivados?ver=excluidos");
  const row = page.getByTestId("ops-archive-row").filter({ hasText: "Minha tarefa" });
  await row.getByRole("button", { name: "Restaurar" }).click();
  await waitFor(page, () => !t.deleted_at, "tarefa restaurada");
  check(Boolean(t.archived_at), "restaurada volta como arquivada");
  await page.getByRole("button", { name: "Arquivados" }).click();
  await page.getByTestId("ops-archive-row").filter({ hasText: "Minha tarefa" }).waitFor();
  check(true, "restaurada aparece em Arquivados");
  check(errors.length === 0, `sem erros (admin) ${errors.join(" | ")}`);
  await browser.close();
}
