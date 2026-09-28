/**
 * Teste de navegador da Etapa 36.7 — Central de Operações: painel operacional
 * (indicadores, filtros, gargalos e atalhos), visões salvas, busca da Central
 * e atalho no dashboard geral. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const AURORA = "c1000000-0000-4000-8000-000000000001";
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;
const spToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const TODAY = spToday();

function seedTask(db, fields) {
  const t = { id: crypto.randomUUID(), number: ++db.opsTaskSeq, description: null, client_id: null, priority: "media", start_date: null, due_date: null,
    effort_hours: null, visibility: "setor", tags: [], client_stage_id: null, mandatory: false, status_id: "nao_iniciado", people: [], version: 1,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null, archived_at: null, demand_id: null, queue_column_id: null,
    created_by: USER_ID, ...fields };
  db.opsTasks.push(t);
  return t;
}

function seed(db) {
  const design = sectorId(db, "Design");
  const copy = sectorId(db, "Copy");
  db.clients.push({ id: AURORA, name: "Loja Aurora", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
    timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T12:00:00Z", updated_at: "", created_by: null });
  db.opsClientOps[AURORA] = { stage_id: "briefing", am_user_id: MARIA, started_at: ago(30), stage_since: ago(20), version: 1 };
  db.opsMembers[MARIA] = { primary: copy, secondary: [], job_title: "Copy", active: true, joins_meetings: true, permissions: ["ops.access"] };
  const late = seedTask(db, { title: "Banner atrasado", sector_id: design, due_date: addDays(TODAY, -1), people: [{ user_id: USER_ID, role: "principal" }] });
  seedTask(db, { title: "Post sem dono", sector_id: design, due_date: TODAY });
  const stalled = seedTask(db, { title: "Roteiro parado", sector_id: copy, updated_at: ago(10), created_by: MARIA, people: [{ user_id: MARIA, role: "principal" }] });
  seedTask(db, { title: "Arte entregue", sector_id: design, status_id: "finalizado", created_at: ago(5), completed_at: ago(2),
    people: [{ user_id: USER_ID, role: "principal" }] });
  const waiting = seedTask(db, { title: "Vídeo esperando o roteiro", sector_id: design, people: [{ user_id: USER_ID, role: "adicional" }] });
  db.opsDeps.push({ task_id: waiting.id, depends_on_id: stalled.id });
  db.opsLeads.push({ id: crypto.randomUUID(), number: ++db.opsLeadSeq, company_name: "Padaria Sol", stage_id: "prospeccao", next_action_date: addDays(TODAY, -2),
    archived_at: null, owner_id: USER_ID, version: 1 });
  return { late, stalled, waiting };
}

// ---------------------------------------------------------------- Admin: painel, atalhos, visões salvas e busca
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  const { late, stalled } = seed(db);

  // Atalho no dashboard geral (mesma consulta do sino)
  await login(page, "/");
  const shortcut = page.getByTestId("ops-shortcut");
  await shortcut.waitFor();
  const sText = await shortcut.innerText();
  check(sText.includes("2 tarefas minhas em aberto") && sText.includes("1 atrasada") && sText.includes("0 reuniões hoje"), `atalho no dashboard geral (${sText.replace(/\n/g, " ")})`);
  check(db.rpcCalls.filter((c) => c.fn === "ops_my_summary").length === 1 && !db.rpcCalls.some((c) => c.fn === "ops_notifications_unread"),
    "sino e atalho usam uma consulta só");
  await shortcut.click();
  await page.waitForURL("**/operacoes/painel");
  await page.getByTestId("ops-dash-cards").waitFor();
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(tabs[0] === "Painel", `aba Painel primeiro (${tabs.join(", ")})`);

  const card = async (id) => (await page.getByTestId(id).locator("p").nth(1).innerText()).trim();
  check(await card("ops-dash-abertas") === "4" && await card("ops-dash-atrasadas") === "1" && await card("ops-dash-hoje") === "1"
    && await card("ops-dash-sem-dono") === "2" && await card("ops-dash-paradas") === "1" && await card("ops-dash-concluidas") === "1"
    && await card("ops-dash-bloqueadas") === "1" && await card("ops-dash-media") === "3 d",
    "cartões com os números reais (abertas, atrasadas, hoje, sem dono, paradas, concluídas, bloqueadas, tempo médio)");
  check(await page.getByTestId("ops-dash-sector-row").count() === 2, "visão por setor (Copy e Design)");
  check((await page.getByTestId("ops-dash-stalled").innerText()).includes("Roteiro parado")
    && (await page.getByTestId("ops-dash-blocked").innerText()).includes("espera 1 tarefa"), "gargalos: parada e bloqueada por dependência");
  check((await page.getByTestId("ops-dash-clients").innerText()).includes("Loja Aurora"), "cliente parado na etapa há mais de 14 dias");
  check((await page.getByTestId("ops-dash-leads").innerText()).includes("1 lead com a próxima ação atrasada"), "leads atrasados (quem tem Comercial)");
  await page.screenshot({ path: `${SHOTS}/ops-painel.png`, fullPage: true });

  // Gargalo abre a tarefa ali mesmo
  await page.getByTestId("ops-dash-stalled").getByRole("button", { name: /Roteiro parado/ }).click();
  await page.getByTestId("ops-task-detail").waitFor();
  check(page.url().includes(`tarefa=${stalled.id}`), "clicar no gargalo abre a tarefa");
  await page.getByRole("button", { name: "Fechar tarefa" }).click();

  // Filtro por setor muda os números
  await page.getByTestId("ops-dash-filters").getByLabel("Filtrar por setor").selectOption({ label: "Copy" });
  await page.waitForFunction(() => document.querySelector("[data-testid=ops-dash-abertas] p:nth-of-type(2)")?.textContent === "1");
  check(await card("ops-dash-atrasadas") === "0" && await page.getByTestId("ops-dash-sector-row").count() === 1, "filtro por setor");

  // Visão salva no painel
  await page.getByRole("button", { name: "Salvar filtros como visão" }).click();
  await page.getByLabel("Nome da visão").fill("Só o Copy");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByLabel("Visões salvas").locator("option", { hasText: "Só o Copy" }).waitFor({ state: "attached" });
  check(db.opsSavedViews.length === 1 && db.opsSavedViews[0].page === "painel" && db.opsSavedViews[0].filters.sector_id === sectorId(db, "Copy"),
    "visão salva com os filtros do painel");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=ops-dash-abertas] p:nth-of-type(2)")?.textContent === "4");
  await page.getByLabel("Visões salvas").selectOption({ label: "Só o Copy" });
  await page.waitForFunction(() => document.querySelector("[data-testid=ops-dash-abertas] p:nth-of-type(2)")?.textContent === "1");
  check(await page.getByTestId("ops-dash-filters").getByLabel("Filtrar por setor").inputValue() === sectorId(db, "Copy"), "escolher a visão aplica os filtros");
  await page.getByRole("button", { name: "Apagar a visão Só o Copy" }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll("[aria-label='Visões salvas'] option")].some((o) => o.textContent === "Só o Copy"));
  check(db.opsSavedViews.length === 0, "apagar a visão");
  await page.getByRole("button", { name: "Limpar filtros" }).click();

  // Atalho: cartão Atrasadas abre a Central de Tarefas já filtrada
  await page.getByTestId("ops-dash-atrasadas").click();
  await page.waitForURL("**/operacoes/tarefas?**");
  await page.getByTestId("ops-tasks").waitFor();
  check(await page.getByLabel("Filtrar por prazo").inputValue() === "atrasadas" && page.url().includes("due=atrasadas"),
    "cartão abre as tarefas com o filtro certo");
  await page.getByRole("button", { name: "Lista" }).click();
  await page.getByTestId("ops-task-row").first().waitFor();
  const rows = await page.getByTestId("ops-task-row").allInnerTexts();
  check(rows.length === 1 && rows[0].includes("Banner atrasado"), "lista mostra só a atrasada");

  // Visão salva na Central de Tarefas
  await page.getByRole("button", { name: "Salvar filtros como visão" }).click();
  await page.getByLabel("Nome da visão").fill("Atrasadas");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByLabel("Visões salvas").locator("option", { hasText: "Atrasadas" }).waitFor({ state: "attached" });
  check(db.opsSavedViews[0]?.page === "tarefas" && db.opsSavedViews[0].filters.due === "atrasadas", "visão salva nas tarefas");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Visões salvas").selectOption({ label: "Atrasadas" });
  check(await page.getByLabel("Filtrar por prazo").inputValue() === "atrasadas", "visão das tarefas volta os filtros");

  // Busca da Central
  const search = page.getByRole("combobox", { name: "Buscar na Central" });
  await search.fill("banner");
  await page.getByTestId("ops-search-result").first().waitFor();
  check((await page.getByTestId("ops-search-result").first().innerText()).includes(`#${late.number} Banner atrasado`), "busca acha a tarefa");
  await search.press("Enter");
  await page.waitForURL(`**/operacoes/tarefas?**tarefa=${late.id}**`);
  await page.getByTestId("ops-task-detail").waitFor();
  check(true, "Enter abre a tarefa da busca");
  await page.getByRole("button", { name: "Fechar tarefa" }).click();
  await search.fill("padaria");
  await page.locator("[data-testid=ops-search-result][data-kind=lead]").waitFor();
  await search.fill("aurora");
  await page.locator("[data-testid=ops-search-result][data-kind=cliente]").waitFor();
  check(true, "busca acha lead e cliente no fluxo");
  await search.fill("zzzz");
  await page.getByTestId("ops-search-empty").waitFor();
  check(true, "busca sem resultado explica");
  check(errors.length === 0, `sem erros (admin) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Equipe sem "Ver o painel": sem aba, sem leads, só o que vê
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  seed(db);
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.tasks.create"] };
  await login(page, "/operacoes/painel");
  await page.waitForURL("**/operacoes/minhas-tarefas");
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(!tabs.includes("Painel"), `sem a aba Painel (${tabs.join(", ")})`);
  const search = page.getByRole("combobox", { name: "Buscar na Central" });
  await search.fill("parado");
  await page.getByTestId("ops-search-empty").waitFor();
  check(true, "busca não mostra tarefa de outro setor");
  await search.fill("padaria");
  await page.getByTestId("ops-search-empty").waitFor();
  check(true, "busca não mostra lead sem Comercial");
  await search.fill("banner");
  await page.getByTestId("ops-search-result").first().waitFor();
  check(await page.getByTestId("ops-search-result").count() === 1, "busca mostra a tarefa do próprio setor");
  check(errors.length === 0, `sem erros (equipe) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Gestor na Central sem "Ver o painel": atalho leva a Minhas tarefas
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Gestor", active: true, joins_meetings: true, permissions: ["ops.access"] };
  await login(page, "/");
  await page.getByTestId("ops-shortcut").waitFor();
  await page.getByTestId("ops-shortcut").click();
  await page.waitForURL("**/operacoes/minhas-tarefas");
  check(true, "atalho leva para Minhas tarefas (sem o painel)");
  check(errors.length === 0, `sem erros (gestor) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Fora da Central: sem atalho
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "gestor" });
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  await page.waitForTimeout(500);
  check(await page.getByTestId("ops-shortcut").count() === 0 && await page.getByTestId("ops-search").count() === 0, "quem não está na Central não vê o atalho");
  check(errors.length === 0, `sem erros (fora da Central) ${errors.join(" | ")}`);
  await browser.close();
}
