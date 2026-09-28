/**
 * Teste de navegador da Etapa 36.5 — Central de Operações: Dailies e reuniões
 * (agenda, pauta, participantes, ata e presença, pendência → tarefa com um
 * clique, cancelamento com motivo, histórico com filtros, aba no cliente e
 * quem vê/quem mexe). Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const LOJA = "c1000000-0000-4000-8000-000000000005";
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-20T12:00:00Z", updated_at: "", created_by: null });
const spToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const TOMORROW = addDays(spToday(), 1);

async function newMeeting(page, fields, people = []) {
  await page.getByRole("button", { name: "Nova reunião" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova reunião" });
  for (const [label, value] of Object.entries(fields)) {
    const el = dialog.getByLabel(label, { exact: true });
    if ((await el.evaluate((e) => e.tagName)) === "SELECT") await el.selectOption({ label: value }); else await el.fill(value);
  }
  for (const p of people) await dialog.getByTestId("ops-meeting-people").getByLabel(p).check();
  await dialog.getByRole("button", { name: "Agendar reunião" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByTestId("ops-meeting-drawer").waitFor();
}

async function addItem(drawer, kind, text, { owner, sector, due } = {}) {
  const form = drawer.getByTestId("ops-meeting-item-form");
  await form.getByLabel("Tipo do item").selectOption({ label: kind });
  await form.getByLabel("Responsável do item").selectOption(owner ? { label: owner } : { value: "" });
  if (sector) await form.getByLabel("Setor do item").selectOption({ label: sector });
  if (due) await form.getByLabel("Prazo do item").fill(due);
  await form.getByLabel("Texto do item").fill(text);
  await form.getByRole("button", { name: "Registrar" }).click();
  await drawer.getByText(text, { exact: true }).waitFor();
}

// ---------------------------------------------------------------- Admin (organiza)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push(client(LOJA, "Loja Azul"));
  db.opsMembers[MARIA] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true, permissions: ["ops.access"] };
  await login(page, "/operacoes/reunioes");
  await page.getByTestId("ops-meetings-empty").waitFor();
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(["Painel", "Minhas tarefas", "Tarefas", "Comercial", "Clientes", "Filas", "Reuniões", "Equipe", "Configurações"]),
    `aba Reuniões na Central (${tabs.join(", ")})`);

  // Agendar a Daily do Design, com cliente e participante
  await newMeeting(page, { Título: "Daily do Design", Tipo: "Daily", "Data e hora (Brasília)": `${TOMORROW}T09:00`, Duração: "15 min", Setor: "Design",
    Cliente: "Loja Azul", "Local ou link da chamada": "https://meet.google.com/abc-defg-hij", Pauta: "Entregas da semana" }, ["Maria Gestora"]);
  const [m1] = db.opsMeetings;
  check(m1.starts_at === new Date(`${TOMORROW}T09:00:00-03:00`).toISOString() && m1.duration_min === 15 && m1.client_id === LOJA
    && m1.people.length === 1 && m1.people[0].user_id === MARIA && m1.organizer_id === USER_ID, "reunião gravada (horário de Brasília, cliente e participante)");
  const drawer = page.getByTestId("ops-meeting-drawer");
  await drawer.getByText("Entregas da semana").waitFor();
  const info = await drawer.innerText();
  check(info.includes("09:00 – 09:15") && info.includes("Daily") && info.includes("Loja Azul") && info.includes("Entregas da semana"), "painel mostra horário, tipo, cliente e pauta");
  check(await drawer.getByRole("link", { name: "Abrir link da chamada" }).getAttribute("href") === "https://meet.google.com/abc-defg-hij", "link da chamada");

  // Itens: pendência (vira tarefa) e decisão (não vira)
  await addItem(drawer, "Pendência", "Refazer banner da campanha", { owner: "Maria Gestora", due: addDays(TOMORROW, 2) });
  await addItem(drawer, "Decisão", "Paleta azul aprovada");
  check(await drawer.getByRole("button", { name: "Criar tarefa: Paleta azul aprovada" }).count() === 0, "decisão não vira tarefa");
  await drawer.getByRole("button", { name: "Criar tarefa: Refazer banner da campanha" }).click();
  await drawer.getByText("Tarefa criada.", { exact: false }).waitFor();
  const [t1] = db.opsTasks;
  check(db.opsTasks.length === 1 && t1.title === "Refazer banner da campanha" && t1.sector_id === sectorId(db, "Design") && t1.client_id === LOJA
    && t1.due_date === addDays(TOMORROW, 2) && t1.people[0]?.user_id === MARIA && t1.description.startsWith("Criada a partir da reunião #1"),
  "pendência virou tarefa (setor, cliente, prazo e responsável)");
  await drawer.getByTestId("ops-meeting-item-task").waitFor();
  check((await drawer.getByTestId("ops-meeting-item-task").innerText()).includes(`Tarefa #${t1.number}`), "item mostra a tarefa gerada");
  check(await drawer.getByRole("button", { name: "Criar tarefa: Refazer banner da campanha" }).count() === 0
    && await drawer.getByRole("button", { name: "Retirar item: Refazer banner da campanha" }).count() === 0, "sem segundo clique nem retirar depois de virar tarefa");

  // Registrar: ata e presença
  await drawer.getByRole("button", { name: "Registrar reunião" }).click();
  let dialog = page.getByRole("dialog", { name: "Registrar reunião" });
  await dialog.getByLabel("Ata / resumo").fill("Banner refeito até quarta. Paleta azul aprovada.");
  await dialog.getByRole("button", { name: "Marcar como realizada" }).click();
  await dialog.waitFor({ state: "detached" });
  await drawer.getByTestId("ops-meeting-notes").waitFor();
  check(m1.status === "realizada" && m1.people[0].attended === true, "reunião realizada com presença");
  check((await drawer.getByTestId("ops-meeting-attendance").innerText()).includes("Maria Gestora · presente"), "presença na tela");
  const hist = await drawer.getByTestId("ops-meeting-history").innerText();
  check(hist.includes("Agendou a reunião") && hist.includes("Transformou em tarefa") && hist.includes(`Tarefa #${t1.number}`)
    && hist.includes("Registrou a reunião (ata e presença)") && hist.includes("presentes: Maria Gestora"), "histórico da reunião");
  await page.screenshot({ path: `${SHOTS}/ops-reuniao.png` });
  await page.getByRole("button", { name: "Fechar reunião" }).click();

  // Segunda reunião, sem setor: pendência não vira tarefa sem setor; cancelar pede motivo
  await newMeeting(page, { Título: "Alinhamento geral", Tipo: "Alinhamento interno", "Data e hora (Brasília)": `${TOMORROW}T14:00`, Setor: "Sem setor (várias áreas)" });
  await addItem(drawer, "Bloqueio", "Sem acesso ao Drive");
  check(await drawer.getByRole("button", { name: "Criar tarefa: Sem acesso ao Drive" }).isDisabled()
    && (await drawer.innerText()).includes("Informe o setor (no item ou na reunião)"), "sem setor: botão de tarefa desligado, com explicação");
  await drawer.getByRole("button", { name: "Cancelar" }).click();
  dialog = page.getByRole("dialog", { name: "Cancelar reunião" });
  await dialog.getByRole("button", { name: "Cancelar reunião" }).click();
  await dialog.getByText("Informe o motivo do cancelamento.").waitFor();
  await dialog.getByLabel("Motivo").fill("Cliente remarcou");
  await dialog.getByRole("button", { name: "Cancelar reunião" }).click();
  await dialog.waitFor({ state: "detached" });
  await drawer.getByText("Cancelada: Cliente remarcou").waitFor();
  check(await drawer.getByTestId("ops-meeting-item-form").count() === 0 && await drawer.getByRole("button", { name: "Editar" }).count() === 0,
    "cancelada: sem novos itens e sem editar");
  await page.getByRole("button", { name: "Fechar reunião" }).click();

  // Agenda por dia
  const agenda = await page.getByTestId("ops-meeting-agenda").innerText();
  check(agenda.includes("Amanhã") && agenda.includes("Daily do Design") && agenda.includes("1 tarefa(s)") && agenda.includes("Alinhamento geral"),
    "agenda agrupada por dia, com tarefas geradas");
  check(agenda.indexOf("Daily do Design") < agenda.indexOf("Alinhamento geral"), "agenda em ordem de horário");
  await page.screenshot({ path: `${SHOTS}/ops-reunioes.png`, fullPage: true });

  // Histórico com filtros
  await page.getByRole("button", { name: "Histórico" }).click();
  await page.getByTestId("ops-meeting-filters").waitFor();
  await page.getByLabel("Filtrar por situação").selectOption("cancelada");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-meeting-row]").length === 1);
  check((await page.getByTestId("ops-meeting-history-list").innerText()).includes("Alinhamento geral"), "filtro por situação");
  await page.getByLabel("Filtrar por situação").selectOption("");
  await page.getByLabel("Filtrar por cliente").selectOption({ label: "Loja Azul" });
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-meeting-row]").length === 1);
  check((await page.getByTestId("ops-meeting-history-list").innerText()).includes("Daily do Design"), "filtro por cliente");

  // A tarefa lembra de onde veio
  await page.goto(page.url().split("/operacoes")[0] + `/operacoes/tarefas?tarefa=${t1.id}`);
  await page.getByText("Veio de uma reunião").waitFor();
  check(true, "histórico da tarefa mostra a reunião de origem");

  // Aba Reuniões no cliente
  await page.goto(page.url().split("/operacoes")[0] + `/clientes/${LOJA}?aba=reunioes`);
  await page.getByTestId("client-meetings").waitFor();
  check(await page.getByTestId("client-meeting-link").count() === 1 && (await page.getByTestId("client-meetings").innerText()).includes("Daily do Design"),
    "aba Reuniões na ficha do cliente");

  // Configurações: tipos de reunião
  await page.goto(page.url().split("/clientes")[0] + "/operacoes/configuracoes");
  await page.getByTestId("ops-meeting-category-row").first().waitFor();
  const catCount = await page.getByTestId("ops-meeting-category-row").count();
  check(catCount === 6, `6 tipos de reunião iniciais (${catCount})`);
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// ---------------------------------------------------------------- Designer participante (sem "Criar reuniões")
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  const design = sectorId(db, "Design");
  db.opsMembers[USER_ID] = { primary: design, secondary: [], job_title: "Designer", active: true, joins_meetings: true, permissions: ["ops.access", "ops.tasks.create"] };
  db.opsMembers[MARIA] = { primary: design, secondary: [], job_title: "Líder", active: true, joins_meetings: true, permissions: ["ops.access", "ops.meetings.manage"] };
  db.opsMeetingSeq = 1;
  db.opsMeetings.push({ id: "3ee70000-0000-4000-8000-000000000001", number: 1, title: "Daily Design", category_id: "daily", status: "agendada",
    starts_at: new Date(`${TOMORROW}T09:00:00-03:00`).toISOString(), duration_min: 15, sector_id: design, client_id: null, location: null, agenda: null,
    notes: null, cancel_reason: null, held_at: null, organizer_id: MARIA, created_at: new Date().toISOString(), version: 1,
    people: [{ user_id: USER_ID, attended: null }] });
  await login(page, "/operacoes/reunioes");
  await page.getByTestId("ops-meeting-agenda").waitFor();
  check(await page.getByRole("button", { name: "Nova reunião" }).count() === 0, "sem permissão: não agenda reunião");
  await page.getByTestId("ops-meeting-row").click();
  const drawer = page.getByTestId("ops-meeting-drawer");
  await drawer.getByTestId("ops-meeting-item-form").waitFor();
  check(await drawer.getByRole("button", { name: "Editar" }).count() === 0 && await drawer.getByRole("button", { name: "Registrar reunião" }).count() === 0,
    "participante não altera nem registra a reunião");
  await addItem(drawer, "Pendência", "Ajustar logo", { owner: "Ander Rodrigues" });
  await addItem(drawer, "Pendência", "Revisar textos", { owner: "Maria Gestora" });
  check(await drawer.getByRole("button", { name: "Criar tarefa: Revisar textos" }).isDisabled()
    && (await drawer.innerText()).includes('exige "Atribuir responsáveis"'), "sem atribuir: não cria tarefa para outra pessoa");
  await drawer.getByRole("button", { name: "Criar tarefa: Ajustar logo" }).click();
  await drawer.getByTestId("ops-meeting-item-task").waitFor();
  check(db.opsTasks.length === 1 && db.opsTasks[0].people[0].user_id === USER_ID && db.opsTasks[0].sector_id === design, "participante cria a própria tarefa");
  check(errors.length === 0, `sem erros (participante) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Outro setor, fora da reunião
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Comercial"), secondary: [], job_title: "Vendas", active: true, joins_meetings: true, permissions: ["ops.access"] };
  db.opsMeetings.push({ id: "3ee70000-0000-4000-8000-000000000002", number: 1, title: "Daily Design", category_id: "daily", status: "agendada",
    starts_at: new Date(`${TOMORROW}T09:00:00-03:00`).toISOString(), duration_min: 15, sector_id: sectorId(db, "Design"), client_id: null, location: null,
    agenda: null, notes: null, cancel_reason: null, held_at: null, organizer_id: MARIA, created_at: new Date().toISOString(), version: 1, people: [] });
  await login(page, "/operacoes/reunioes");
  await page.getByTestId("ops-meetings-empty").waitFor();
  check(await page.getByTestId("ops-meeting-row").count() === 0, "outro setor não vê a Daily do Design");
  check(errors.length === 0, `sem erros (outro setor) ${errors.join(" | ")}`);
  await browser.close();
}
