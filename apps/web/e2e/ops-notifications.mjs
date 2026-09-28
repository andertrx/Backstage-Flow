/**
 * Teste de navegador da Etapa 36.6 — Central de Operações: sino de
 * notificações (não lidas, abrir, marcar como lida, página com filtros e
 * preferências) e repetição de reuniões e tarefas. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;
const spToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const TOMORROW = addDays(spToday(), 1);
const isWeekday = (d) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return w >= 1 && w <= 5; };

function seedTask(db, fields) {
  const t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, description: null, client_id: null, priority: "media", start_date: null, due_date: null,
    effort_hours: null, visibility: "setor", tags: [], client_stage_id: null, mandatory: false, status_id: "nao_iniciado", people: [], version: 1,
    created_at: new Date().toISOString(), updated_at: "", completed_at: null, archived_at: null, demand_id: null, queue_column_id: null, ...fields };
  db.opsTasks.push(t);
  return t;
}
function seedNotification(db, fields) {
  db.opsNotifications.push({ id: db.opsNotifications.length + 1, actor_id: MARIA, created_at: new Date().toISOString(), read_at: null,
    dedupe_key: `x${db.opsNotifications.length}`, body: null, ...fields });
}

// ---------------------------------------------------------------- Sino (papel Equipe)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  const design = sectorId(db, "Design");
  db.opsMembers[USER_ID] = { primary: design, secondary: [], job_title: "Designer", active: true, joins_meetings: true, permissions: ["ops.access"] };
  db.opsMembers[MARIA] = { primary: design, secondary: [], job_title: "Líder", active: true, joins_meetings: true, permissions: ["ops.access"] };
  const t1 = seedTask(db, { title: "Banner da campanha", sector_id: design, created_by: MARIA, people: [{ user_id: USER_ID, role: "principal" }] });
  seedNotification(db, { user_id: USER_ID, kind: "tarefa.atribuida", title: `Você entrou na tarefa #${t1.number}: ${t1.title}`, body: "Como responsável principal",
    link: `/operacoes/tarefas?tarefa=${t1.id}` });
  seedNotification(db, { user_id: USER_ID, kind: "tarefa.mencao", title: `Maria Gestora mencionou você na tarefa #${t1.number}`, body: "Pode revisar?",
    link: `/operacoes/tarefas?tarefa=${t1.id}` });
  seedNotification(db, { user_id: USER_ID, kind: "tarefa.prazo", title: "Prazo amanhã: tarefa antiga", link: `/operacoes/tarefas?tarefa=${t1.id}`,
    read_at: new Date().toISOString() });
  seedNotification(db, { user_id: MARIA, kind: "tarefa.concluida", title: "Notificação da Maria", link: "/operacoes/tarefas" });

  await login(page, "/operacoes/minhas-tarefas");
  await page.getByTestId("ops-bell-count").waitFor();
  check((await page.getByTestId("ops-bell-count").innerText()) === "2", "sino mostra 2 não lidas");
  await page.getByTestId("ops-bell").click();
  const panel = page.getByTestId("ops-bell-panel");
  await panel.getByTestId("ops-notification").first().waitFor();
  const panelText = await panel.innerText();
  check(await panel.getByTestId("ops-notification").count() === 3 && !panelText.includes("Notificação da Maria"), "painel mostra só as próprias notificações");
  await panel.getByRole("button", { name: /mencionou você/ }).click();
  await page.getByTestId("ops-task-detail").waitFor();
  check(page.url().includes(`tarefa=${t1.id}`), "clicar abre a tarefa");
  await page.waitForFunction(() => document.querySelector("[data-testid=ops-bell-count]")?.textContent === "1");
  check(db.opsNotifications.find((n) => n.kind === "tarefa.mencao").read_at !== null, "clicar marca como lida");
  await page.getByRole("button", { name: "Fechar tarefa" }).click();

  // Página com filtros, marcar todas e preferências
  await page.getByTestId("ops-bell").click();
  await page.getByRole("link", { name: "Ver todas e preferências" }).click();
  await page.getByTestId("ops-notifications").waitFor();
  await page.getByTestId("ops-notification").first().waitFor();
  check(await page.getByTestId("ops-notification").count() === 3, "página lista todas");
  await page.getByLabel("Só não lidas").check();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-notification]").length === 1);
  check(true, "filtro só não lidas");
  await page.getByLabel("Só não lidas").uncheck();
  await page.getByLabel("Filtrar por tipo").selectOption("tarefa.prazo");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-notification]").length === 1);
  check((await page.getByTestId("ops-notification-list").innerText()).includes("Prazo amanhã"), "filtro por tipo");
  await page.getByLabel("Filtrar por tipo").selectOption("");
  await page.getByRole("button", { name: "Marcar todas como lidas" }).click();
  await page.getByTestId("ops-bell-count").waitFor({ state: "detached" });
  check(db.opsNotifications.filter((n) => n.user_id === USER_ID && !n.read_at).length === 0
    && db.opsNotifications.find((n) => n.user_id === MARIA).read_at === null, "marcar todas (só as minhas)");
  const prefs = page.getByTestId("ops-notification-prefs");
  await prefs.getByLabel("Comentário numa tarefa minha").uncheck();
  await prefs.getByRole("button", { name: "Salvar preferências" }).click();
  await prefs.getByText("Preferências salvas.").waitFor();
  check(JSON.stringify(db.opsNotificationPrefs[USER_ID]) === JSON.stringify(["tarefa.comentario"]), "preferência salva");
  await page.screenshot({ path: `${SHOTS}/ops-notificacoes.png`, fullPage: true });
  check(errors.length === 0, `sem erros (sino) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Admin: convite gera aviso; repetição de reunião e tarefa
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  const design = sectorId(db, "Design");
  db.opsMembers[MARIA] = { primary: design, secondary: [], job_title: "Designer", active: true, joins_meetings: true, permissions: ["ops.access"] };
  await login(page, "/operacoes/reunioes");
  await page.getByTestId("ops-meetings-empty").waitFor();
  check(await page.getByTestId("ops-bell").count() === 1, "admin vê o sino");

  await page.getByRole("button", { name: "Nova reunião" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova reunião" });
  await dialog.getByLabel("Título", { exact: true }).fill("Daily do Design");
  await dialog.getByLabel("Data e hora (Brasília)").fill(`${TOMORROW}T09:00`);
  await dialog.getByLabel("Setor", { exact: true }).selectOption({ label: "Design" });
  await dialog.getByTestId("ops-meeting-people").getByLabel("Maria Gestora").check();
  await dialog.getByRole("button", { name: "Agendar reunião" }).click();
  await dialog.waitFor({ state: "detached" });
  const drawer = page.getByTestId("ops-meeting-drawer");
  await drawer.getByTestId("ops-recurrence").waitFor();
  check(db.opsNotifications.length === 1 && db.opsNotifications[0].user_id === MARIA && db.opsNotifications[0].kind === "reuniao.convite",
    "convite avisa a participante (e não quem agendou)");

  // Repetir a reunião em dias úteis
  await drawer.getByRole("button", { name: "Repetir…" }).click();
  const rec = page.getByRole("dialog", { name: "Repetir esta reunião" });
  await rec.getByLabel("Começa em").fill(addDays(TOMORROW, 1));
  const preview = await rec.getByTestId("ops-recurrence-preview").innerText();
  check(preview.startsWith("Próximas:") && preview.split(",").length === 5, `prévia das próximas datas (${preview})`);
  await rec.getByRole("button", { name: "Repetir", exact: true }).click();
  await rec.waitFor({ state: "detached" });
  await drawer.getByText("Parar de repetir").waitFor();
  const expected = Array.from({ length: 7 }, (_, i) => addDays(spToday(), i)).filter((d) => d >= addDays(TOMORROW, 1) && isWeekday(d)).length;
  const occ = db.opsMeetings.filter((m) => m.recurrence_id);
  check(occ.length === expected && occ.every((m) => m.people.length === 1 && new Date(m.starts_at).getUTCHours() === 12),
    `reuniões repetidas nos dias úteis dos próximos 7 dias (${occ.length}/${expected}), mesmo horário e participante`);
  check((await drawer.getByTestId("ops-recurrence").innerText()).includes("Dias úteis"), "painel mostra a regra");
  await drawer.getByRole("button", { name: "Parar de repetir" }).click();
  await drawer.getByText("Parada por Ander Rodrigues.", { exact: false }).waitFor();
  check(db.opsRecurrences[0].active === false, "parar a repetição");
  const hist = await drawer.getByTestId("ops-meeting-history").innerText();
  check(hist.includes("Passou a repetir a reunião") && hist.includes("Parou a repetição"), "repetição no histórico da reunião");
  await page.getByRole("button", { name: "Fechar reunião" }).click();

  // Repetir uma tarefa toda semana
  const t = seedTask(db, { title: "Relatório semanal", sector_id: design, created_by: USER_ID, due_date: TOMORROW, people: [{ user_id: MARIA, role: "principal" }] });
  await page.goto(page.url().split("/operacoes")[0] + `/operacoes/tarefas?tarefa=${t.id}`);
  const detail = page.getByTestId("ops-task-detail");
  await detail.getByRole("button", { name: "Repetir…" }).click();
  const rt = page.getByRole("dialog", { name: "Repetir esta tarefa" });
  await rt.getByLabel("Frequência").selectOption("semanal");
  await rt.getByText("Qua", { exact: true }).click();
  await rt.getByRole("button", { name: "Repetir", exact: true }).click();
  await rt.waitFor({ state: "detached" });
  await detail.getByText("Toda semana: Seg, Qua", { exact: false }).waitFor();
  const r2 = db.opsRecurrences.find((r) => r.task_id === t.id);
  check(r2?.frequency === "semanal" && JSON.stringify(r2.weekdays) === "[1,3]" && db.opsTasks.filter((x) => x.recurrence_id === r2.id).length === 0,
    "tarefa passa a repetir (nasce no próprio dia, de madrugada)");
  await page.screenshot({ path: `${SHOTS}/ops-repeticao.png` });

  // Uma ocorrência mostra de onde veio e não pode repetir de novo
  const occTask = seedTask(db, { title: "Relatório semanal", sector_id: design, created_by: USER_ID, recurrence_id: r2.id, occurrence_date: spToday() });
  await page.goto(page.url().split("/operacoes")[0] + `/operacoes/tarefas?tarefa=${occTask.id}`);
  await page.getByTestId("ops-task-detail").getByText(`Repetição da tarefa #${t.number}`, { exact: false }).waitFor();
  check(await page.getByTestId("ops-task-detail").getByRole("button", { name: "Repetir…" }).count() === 0, "ocorrência mostra a tarefa original e não repete de novo");
  check(errors.length === 0, `sem erros (admin) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Fora da Central: sem sino
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "gestor" });
  await login(page, "/");
  await page.getByTestId("header-section").waitFor();
  await page.waitForTimeout(500);
  check(await page.getByTestId("ops-bell").count() === 0, "quem não está na Central não vê o sino");
  check(errors.length === 0, `sem erros (fora da Central) ${errors.join(" | ")}`);
  await browser.close();
}
