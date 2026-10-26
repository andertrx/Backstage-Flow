/**
 * Teste de navegador da Central 36.17 — lembrete de tarefa vencida (26/10/2026).
 * Às 8h, 12h e 17h (Brasília) o responsável vê um pop-up com as tarefas vencidas, em qualquer tela, até clicar "Vi".
 * Dá para abrir ou concluir a tarefa ali mesmo. Fora do horário, ou para quem não é responsável, nada aparece.
 * Aviso no aparelho (Web Push): autorização do navegador simulada (o navegador de teste não fala com o Google). Supabase SIMULADO.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;

function seedTask(db, fields) {
  const t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, description: null, client_id: null, priority: "media", start_date: null, due_date: "2026-10-24",
    effort_hours: null, visibility: "setor", tags: [], client_stage_id: null, mandatory: false, status_id: "nao_iniciado", people: [], version: 1,
    created_at: new Date().toISOString(), updated_at: "", completed_at: null, archived_at: null, demand_id: null, queue_column_id: null, created_by: USER_ID, ...fields };
  db.opsTasks.push(t);
  return t;
}
const due = (t, principal, extra = {}) => ({ id: t.id, number: t.number, title: t.title, client: null, due_date: t.due_date, days_late: 2, version: t.version,
  status_id: t.status_id, principal, ...extra });

// Autorização de notificação e "assinatura" do navegador simuladas (guardadas no localStorage para valer entre as telas).
const pushStub = () => {
  const fake = () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/e2e-3617",
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/e2e-3617", keys: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" } }),
    unsubscribe: async () => { localStorage.removeItem("e2e-sub"); return true; } });
  Object.defineProperty(Notification, "permission", { configurable: true, get: () => localStorage.getItem("e2e-perm") ?? "default" });
  Notification.requestPermission = async () => { localStorage.setItem("e2e-perm", "granted"); return "granted"; };
  PushManager.prototype.getSubscription = async function () { return localStorage.getItem("e2e-sub") ? fake() : null; };
  PushManager.prototype.subscribe = async function () { localStorage.setItem("e2e-sub", "1"); return fake(); };
};

// ---------------------------------------------------------------- Admin responsável: pop-up, concluir, Vi, aparelho
{
  const { browser, page, errors } = await launch();
  await page.context().addInitScript(pushStub);
  const db = await mockSupabase(page, { role: "admin" });
  const design = sectorId(db, "Design");
  const t1 = seedTask(db, { title: "Banner da Black Friday", sector_id: design, people: [{ user_id: USER_ID, role: "principal" }] });
  const t2 = seedTask(db, { title: "Relatório de outubro", sector_id: design, due_date: "2026-10-26", people: [{ user_id: USER_ID, role: "principal" }] });
  const t3 = seedTask(db, { title: "Tarefa da Maria", sector_id: design, people: [{ user_id: MARIA, role: "principal" }, { user_id: USER_ID, role: "adicional" }] });
  db.dueSlot = 12;
  db.dueTasks = [due(t1, USER_ID), due(t2, USER_ID, { days_late: 0 }), due(t3, MARIA)];
  await login(page, "/");
  const pop = page.getByTestId("due-reminder");
  await pop.waitFor();
  check(await page.getByRole("heading", { name: "Tarefas vencidas — lembrete das 12h" }).count() === 1, "pop-up do lembrete das 12h aparece na tela inicial");
  const rows = pop.getByTestId("due-task");
  check(await rows.count() === 2, "só as tarefas em que é o responsável (a da Maria, onde é adicional, não aparece)");
  const txt = await pop.innerText();
  check(txt.includes(`#${t1.number} Banner da Black Friday`) && txt.includes("venceu há 2 dias") && txt.includes("vence hoje"), "mostra número, título e há quantos dias venceu");
  check(await pop.getByTestId("due-push").count() === 1, "oferece ativar o aviso no computador e no celular");
  await page.screenshot({ path: `${SHOTS}/ops-lembrete-vencidas.png`, fullPage: false });

  // Concluir ali mesmo
  await rows.nth(0).getByRole("button", { name: "Concluir" }).click();
  await rows.nth(0).getByText("Concluída").waitFor();
  check(db.opsTasks.find((t) => t.id === t1.id).status_id === "finalizado", "Concluir muda a tarefa para Finalizado");

  // Ativar neste aparelho
  await pop.getByRole("button", { name: "Ativar neste aparelho" }).click();
  await pop.getByText("Pronto: este aparelho vai receber o aviso").waitFor();
  const sub = db.pushSubs.find((x) => x.user_id === USER_ID);
  check(sub?.endpoint.startsWith("https://fcm.googleapis.com/") && /no Linux$/.test(sub.device ?? ""), "aparelho cadastrado (com o nome do navegador e sistema)");
  check(db.functionCalls.some((c) => c.fn === "ops-push" && c.action === "public_key"), "pede a chave pública do servidor antes de cadastrar");

  // Vi: some e fica registrado
  await pop.getByRole("button", { name: "Vi" }).click();
  await pop.waitFor({ state: "detached" });
  check(db.dueSeen.includes(`${USER_ID}:2026-10-26:12`), "\"Vi\" fica registrado para o dia e o horário");
  await page.goto(`${BASE}/operacoes/tarefas`);
  await page.waitForTimeout(800);
  check(await page.getByTestId("due-reminder").count() === 0, "depois do Vi, não volta no mesmo horário (nem em outra tela)");

  // Próximo horário (17h): volta, e "Abrir" leva para a tarefa
  db.dueSlot = 17;
  db.dueTasks = [due(t2, USER_ID, { days_late: 0 })];
  await page.goto(`${BASE}/`);
  await pop.waitFor();
  check(await page.getByRole("heading", { name: "Tarefas vencidas — lembrete das 17h" }).count() === 1 && await pop.getByTestId("due-push").count() === 0,
    "às 17h aparece de novo (e não oferece ativar: o aparelho já está ativo)");
  await pop.getByRole("button", { name: "Abrir" }).click();
  await page.waitForURL(`**/operacoes/tarefas?tarefa=${t2.id}`);
  check(db.dueSeen.includes(`${USER_ID}:2026-10-26:17`), "Abrir também conta como visto e leva para a tarefa");

  // Notificações: card do aparelho, teste e desativar
  await page.goto(`${BASE}/operacoes/notificacoes`);
  const card = page.getByTestId("ops-push-card");
  await card.getByText("Ativado neste aparelho").waitFor();
  check((await card.getByTestId("ops-push-devices").innerText()).includes("no Linux"), "lista os aparelhos ativados");
  await card.getByRole("button", { name: "Enviar teste" }).click();
  await card.getByText("Teste enviado").waitFor();
  check(Boolean(db.pushSubs[0].last_sent_at), "Enviar teste chega ao servidor");
  await page.screenshot({ path: `${SHOTS}/ops-aviso-aparelho.png`, fullPage: true });
  await card.getByRole("button", { name: "Desativar neste aparelho" }).click();
  await card.getByText("Desativado neste aparelho").first().waitFor();
  check(Boolean(db.pushSubs[0].disabled_at) && db.pushSubs.length === 1, "Desativar desliga o aparelho (não apaga o histórico)");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Fora do horário e quem não é da Central
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  const t1 = seedTask(db, { title: "Vencida", sector_id: sectorId(db, "Design"), people: [{ user_id: USER_ID, role: "principal" }] });
  db.dueSlot = null;
  db.dueTasks = [due(t1, USER_ID)];
  await login(page, "/");
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.waitForTimeout(800);
  check(await page.getByTestId("due-reminder").count() === 0, "fora dos horários (antes das 8h): sem pop-up");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  db.dueSlot = 8;
  db.dueTasks = [{ id: "x", number: 1, title: "Qualquer", client: null, due_date: "2026-10-20", days_late: 6, version: 1, status_id: "nao_iniciado", principal: USER_ID }];
  await login(page, "/");
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.waitForTimeout(800);
  check(await page.getByTestId("due-reminder").count() === 0, "quem não tem acesso à Central não vê o lembrete");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}
console.log("ops-due-reminder: OK");
