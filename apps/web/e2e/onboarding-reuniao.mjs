/**
 * Teste de navegador da Etapa 47.1 — Onboarding por etapas: Agendado exige reunião agendada, Realizado exige realizada
 * (49.4: e ao menos 1 tarefa para o time de operação), cancelar = Onboarding Cancelado.
 * Selo no cartão, "Vincular reunião" / "Criar reunião", bloqueio de avanço e liberação. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const AURORA = "c1000000-0000-4000-8000-000000000001";
const BETA = "c1000000-0000-4000-8000-000000000002";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-20T12:00:00Z", updated_at: "", created_by: null });

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

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push(client(AURORA, "Loja Aurora"), client(BETA, "Studio Beta"));
const now = new Date().toISOString();
for (const id of [AURORA, BETA]) db.opsClientOps[id] = { stage_id: "onboarding_pendente", am_user_id: null, started_at: now, stage_since: now, version: 1 };
// uma reunião do Beta, já marcada para daqui a 2 dias (para vincular)
const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
db.opsMeetingSeq = (db.opsMeetingSeq ?? 0) + 1;
const beta = { id: crypto.randomUUID(), number: db.opsMeetingSeq, title: "Kickoff Beta", category_id: "cliente", starts_at: future, duration_min: 60, status: "agendada",
  sector_id: null, client_id: BETA, location: null, agenda: null, notes: null, cancel_reason: null, held_at: null, organizer_id: null, created_at: now, version: 1, people: [] };
db.opsMeetings.push(beta);

await page.setViewportSize({ width: 1900, height: 900 });
await login(page, "/onboarding");
const col = (id) => page.locator(`[data-testid=ops-kanban-column][data-status=${id}]`);
await col("onboarding_pendente").getByText("Loja Aurora").waitFor();

// 1) selo vermelho e os dois botões só na primeira coluna
const aurora = col("onboarding_pendente").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
check((await aurora.getByTestId("ops-client-meeting-seal").innerText()).includes("Sem reunião"), "cartão sem reunião mostra o selo vermelho");
check(await aurora.getByRole("button", { name: "Vincular reunião" }).count() === 1 && await aurora.getByRole("button", { name: "Criar reunião" }).count() === 1, "botões Vincular e Criar reunião no cartão");
await page.screenshot({ path: `${SHOTS}/47.1-onboarding-sem-reuniao.png`, fullPage: true });

// 2) sem reunião não vai para Agendado
await dragTo(page, aurora, col("coleta_acessos"));
await page.getByText(/Vincule uma reunião de onboarding agendada/).first().waitFor();
check(db.opsClientOps[AURORA].stage_id === "onboarding_pendente", "sem reunião o cliente não vai para Agendado (o cartão volta)");

// 2b) 49.3: Onboarding Cancelado é livre: vai direto, sem reunião, e pode voltar
await dragTo(page, aurora, col("configuracao_inicial"));
await waitFor(page, () => db.opsClientOps[AURORA].stage_id === "configuracao_inicial", "foi direto para Cancelado");
const auroraCanc = col("configuracao_inicial").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await auroraCanc.waitFor();
check(db.opsActivity.some((a) => a.client_id === AURORA && String(a.after?.regra ?? "").includes("Onboarding cancelado")), "49.3: cancelar direto sem reunião, registrado no histórico");
await dragTo(page, auroraCanc, col("onboarding_pendente"));
await waitFor(page, () => db.opsClientOps[AURORA].stage_id === "onboarding_pendente", "voltou para Pendente");

// 3) criar reunião: já abre com cliente, tipo e título; ao salvar, vincula sozinha
await aurora.getByRole("button", { name: "Criar reunião" }).click();
let dialog = page.getByRole("dialog", { name: "Nova reunião" });
check(await dialog.getByLabel("Título").inputValue() === "Onboarding — Loja Aurora", "título sugerido");
check(await dialog.getByLabel("Tipo", { exact: true }).inputValue() === "cliente", "tipo Reunião com cliente");
check(await dialog.getByLabel("Cliente").isDisabled(), "cliente travado na reunião de onboarding");
await dialog.getByRole("button", { name: "Agendar reunião" }).click();
await dialog.waitFor({ state: "detached" });
await waitFor(page, () => db.opsClientOps[AURORA].onboarding_meeting_id, "reunião criada ficou vinculada");
check(db.opsActivity.some((a) => a.action === "cliente.reuniao_vinculada" && a.client_id === AURORA), "vínculo no histórico do cliente");
await aurora.getByText(/pode ir para Agendado/).waitFor();
check(true, "selo amarelo: reunião marcada");

// 4) com a reunião agendada vai para Agendado, mas não pula para Realizado
await dragTo(page, aurora, col("briefing"));
await page.getByText(/Marque a reunião de onboarding como "Realizada"/).first().waitFor();
check(db.opsClientOps[AURORA].stage_id === "onboarding_pendente", "reunião só agendada não leva a Realizado");
await dragTo(page, aurora, col("coleta_acessos"));
await waitFor(page, () => db.opsClientOps[AURORA].stage_id === "coleta_acessos", "foi para Agendado");
const auroraAg = col("coleta_acessos").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await auroraAg.getByText(/Aguardando a reunião/).waitFor();
await dragTo(page, auroraAg, col("briefing"));
await page.getByText(/Marque a reunião de onboarding como "Realizada"/).first().waitFor();
check(db.opsClientOps[AURORA].stage_id === "coleta_acessos", "em Agendado só avança com reunião realizada");
await page.screenshot({ path: `${SHOTS}/47.2-onboarding-agendado.png`, fullPage: true });

// 5) vincular uma reunião existente (Beta); a lista não mostra reunião de outro cliente
const betaCard = col("onboarding_pendente").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Studio Beta" });
await betaCard.getByRole("button", { name: "Vincular reunião" }).click();
dialog = page.getByRole("dialog", { name: /Vincular reunião: Studio Beta/ });
const v = await dialog.getByLabel("Reunião").locator("option", { hasText: "Kickoff Beta" }).getAttribute("value");
await dialog.getByLabel("Reunião").selectOption(v);
await dialog.getByRole("button", { name: "Vincular" }).click();
await dialog.waitFor({ state: "detached" });
check(db.opsClientOps[BETA].onboarding_meeting_id === beta.id, "reunião existente vinculada ao cliente");
await betaCard.getByRole("button", { name: "Desvincular" }).click();
await betaCard.getByText("Sem reunião").waitFor();
check(db.opsClientOps[BETA].onboarding_meeting_id === null, "desvincular tira a reunião");
await betaCard.getByRole("button", { name: "Vincular reunião" }).click();
dialog = page.getByRole("dialog", { name: /Vincular reunião: Studio Beta/ });
await dialog.getByLabel("Reunião").selectOption(v);
await dialog.getByRole("button", { name: "Vincular" }).click();
await dialog.waitFor({ state: "detached" });

// 6) cancelar a reunião do Beta com "Cliente não fará mais onboarding": vai sozinho para Onboarding Cancelado
await page.goto(`${new URL(page.url()).origin}/reunioes`);
await page.getByTestId("ops-meeting-row").filter({ hasText: "Kickoff Beta" }).first().click();
await page.getByTestId("ops-meeting-drawer").getByRole("button", { name: "Cancelar", exact: true }).click();
dialog = page.getByRole("dialog", { name: "Cancelar reunião" });
await dialog.getByLabel("Cliente não fará mais onboarding").check();
await dialog.getByRole("button", { name: "Cancelar reunião" }).click();
await dialog.waitFor({ state: "detached" });
await waitFor(page, () => db.opsClientOps[BETA].stage_id === "configuracao_inicial", "Beta foi para Onboarding Cancelado");
check(db.opsActivity.some((a) => a.client_id === BETA && a.action === "cliente.etapa" && a.origin === "sistema" && a.after.etapa === "configuracao_inicial"), "mudança para Cancelado registrada como Sistema");
check(db.opsClientOps[AURORA].stage_id === "coleta_acessos", "o outro cliente não é afetado");

// 7) reunião realizada: os botões de reunião somem, mas sem tarefa para a operação ainda não vai para Realizado (49.4)
const mine = db.opsMeetings.find((m) => m.id === db.opsClientOps[AURORA].onboarding_meeting_id);
mine.status = "realizada";
await page.goto(`${new URL(page.url()).origin}/onboarding`);
const aurora3 = col("coleta_acessos").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await aurora3.getByText(/Reunião realizada/).waitFor();
check(await aurora3.getByRole("button", { name: "Vincular reunião" }).count() === 0, "com reunião realizada os botões de reunião somem");
check((await aurora3.getByTestId("ops-client-meeting-seal").innerText()).includes("falta 1 tarefa para a operação"), "49.4: selo amarelo pede a tarefa da operação");
await col("configuracao_inicial").getByText("Studio Beta").waitFor();
await page.screenshot({ path: `${SHOTS}/47.2-onboarding-realizado-cancelado.png`, fullPage: true });
await dragTo(page, aurora3, col("briefing"));
await page.getByText(/Crie pelo menos uma tarefa para o time de operação/).first().waitFor();
check(db.opsClientOps[AURORA].stage_id === "coleta_acessos", "49.4: reunião realizada sem tarefa da operação não vai para Realizado");

// 8) tarefa do Comercial não conta; as tarefas padrão (50.1) são marcadas no cartão e liberam
const SECTOR = (n) => db.opsSectors.find((x) => x.name === n).id;
const member = (id, name, sector) => {
  db.profiles.push({ id, email: `${id.slice(0, 4)}@agencia.com`, full_name: name, role: "equipe", active: true, created_at: now, updated_at: "" });
  db.opsMembers[id] = { primary: SECTOR(sector), secondary: [], job_title: sector, active: true, joins_meetings: true, permissions: ["ops.access", "ops.tasks.create"] };
};
const TIAGO = "55555555-5555-4555-8555-555555555555", RITA = "66666666-6666-4666-8666-666666666666", CAIO = "77777777-7777-4777-8777-777777777777";
member(TIAGO, "Tiago Tráfego", "Gestão de Tráfego"); member(RITA, "Rita Tráfego", "Gestão de Tráfego"); member(CAIO, "Caio Copy", "Copy");
[["Pegar acessos (Meta, Google)", "Gestão de Tráfego"], ["Solicitar material de marca para site/catálogo", "Desenvolvimento (Dev)"],
  ["Solicitar material de B-roll e agendar gravação", "Design"], ["Copy de vendas", "Copy"]].forEach(([title, sector], i) =>
  db.opsOnboardingTemplates.push({ id: crypto.randomUUID(), title, description: null, sector_id: SECTOR(sector), priority: "media", due_days: null, position: i + 1, active: true }));
db.opsTaskSeq = (db.opsTaskSeq ?? 0) + 1;
db.opsTasks.push({ id: crypto.randomUUID(), number: db.opsTaskSeq, title: "Contrato (comercial)", description: null, client_id: AURORA, sector_id: SECTOR("Comercial"),
  status_id: "nao_iniciado", priority: "media", start_date: null, due_date: null, effort_hours: null, visibility: "setor", created_by: null, created_at: now,
  updated_at: now, updated_by: null, completed_at: null, archived_at: null, version: 1, people: [], tags: [], client_stage_id: null, mandatory: false, demand_id: null, queue_column_id: null });
await page.reload();
const aurora4 = col("coleta_acessos").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await aurora4.getByText(/falta 1 tarefa para a operação/).waitFor();
check(true, "49.4: tarefa do setor Comercial não conta");
await aurora4.getByRole("button", { name: "Tarefas do onboarding" }).click();
dialog = page.getByRole("dialog", { name: /Tarefas do onboarding: Loja Aurora/ });
await dialog.getByTestId("ops-onb-template").first().waitFor();
check(await dialog.getByTestId("ops-onb-template").count() === 4, "50.1: as 4 tarefas padrão aparecem para marcar");
check(await dialog.locator("[data-testid=ops-onb-template] input[type=checkbox]:checked").count() === 0, "50.1: vêm desmarcadas");
const tpl = (title) => dialog.getByTestId("ops-onb-template").filter({ hasText: title });
check((await tpl("Pegar acessos").innerText()).includes("Gestão de Tráfego"), "50.1: cada tarefa já mostra o setor");
await tpl("Pegar acessos").getByRole("checkbox").check();
check((await tpl("Pegar acessos").innerText()).includes("Todo o setor (2 pessoas)"), "50.1: opção Todo o setor com a contagem de pessoas");
await tpl("Copy de vendas").getByRole("checkbox").check();
await tpl("Copy de vendas").getByLabel("Uma pessoa do setor").check();
await tpl("Copy de vendas").getByLabel(/^Pessoa:/).selectOption({ label: "Caio Copy" });
await tpl("Copy de vendas").getByRole("button", { name: "Adicionar descrição" }).click();
await tpl("Copy de vendas").getByLabel(/^Descrição:/).fill("Copy da página de vendas, foco em oferta e prova social.");
check(await tpl("Pegar acessos").getByRole("button", { name: "Adicionar descrição" }).count() === 1, "50.2: nas tarefas padrão a descrição é opcional (botão)");
await dialog.getByRole("button", { name: "Criar outra tarefa" }).click();
check(await dialog.getByTestId("ops-onb-extra").getByLabel(/^Descrição:/).count() === 1, "50.2: na tarefa nova, título e campo de descrição maior já aparecem");
await dialog.getByTestId("ops-onb-extra").getByLabel(/^Descrição:/).fill("Alinhar escopo e próximos passos.");
await dialog.getByLabel("Título da outra tarefa").fill("Reunião de alinhamento com o cliente");
await dialog.getByLabel("Setor da outra tarefa").selectOption({ label: "Design" });
await page.screenshot({ path: `${SHOTS}/50.1-tarefas-do-onboarding.png`, fullPage: true });
await dialog.getByTestId("ops-onb-tasks-submit").click();
await dialog.waitFor({ state: "detached" });
await waitFor(page, () => db.opsTasks.filter((t) => t.client_id === AURORA && t.sector_id !== SECTOR("Comercial")).length === 3, "3 tarefas criadas");
const gt = db.opsTasks.find((t) => t.title === "Pegar acessos (Meta, Google)");
check(gt.sector_id === SECTOR("Gestão de Tráfego") && gt.people.length === 2 && gt.people.some((x) => x.user_id === TIAGO) && gt.people.some((x) => x.user_id === RITA), "50.1: Todo o setor = todos do setor marcados na mesma tarefa");
const cp = db.opsTasks.find((t) => t.title === "Copy de vendas");
check(cp.people.length === 1 && cp.people[0].user_id === CAIO && cp.sector_id === SECTOR("Copy"), "50.1: uma pessoa específica do setor");
check(db.opsTasks.some((t) => t.title === "Reunião de alinhamento com o cliente" && t.sector_id === SECTOR("Design") && t.description === "Alinhar escopo e próximos passos."), "50.1: outra tarefa criada do zero, com descrição");
check(cp.description === "Copy da página de vendas, foco em oferta e prova social.", "50.2: descrição editada numa tarefa padrão vai para a tarefa");
await page.goto(`${new URL(page.url()).origin}/onboarding`);
const aurora5 = col("coleta_acessos").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await aurora5.getByText(/pode ir para Realizado/).waitFor();
check(true, "49.4: com a tarefa o selo fica verde");
await dragTo(page, aurora5, col("briefing"));
await waitFor(page, () => db.opsClientOps[AURORA].stage_id === "briefing", "cliente foi para Realizado");
check(db.opsClientOps[AURORA].stage_id === "briefing", "com reunião realizada e tarefa da operação o cliente vai para Realizado");

// 9) Configurações: tarefas padrão (cadastro e criar mais)
await page.goto(`${new URL(page.url()).origin}/operacoes/configuracoes`);
const tplBox = page.getByTestId("ops-onboarding-templates");
await tplBox.waitFor();
check(await tplBox.getByTestId("ops-template-row").count() === 4, "50.1: Configurações lista as 4 tarefas padrão");
await tplBox.getByRole("button", { name: "Nova tarefa padrão" }).click();
dialog = page.getByRole("dialog", { name: "Nova tarefa padrão" });
await dialog.getByLabel("Título").fill("Criar pasta compartilhada do cliente");
await dialog.getByLabel("Setor", { exact: true }).selectOption({ label: "Design" });
await dialog.getByLabel("Prazo em dias (opcional)").fill("5");
await dialog.getByRole("button", { name: "Salvar" }).click();
await dialog.waitFor({ state: "detached" });
await tplBox.getByText("Criar pasta compartilhada do cliente").waitFor();
check(db.opsOnboardingTemplates.some((t) => t.title === "Criar pasta compartilhada do cliente" && t.due_days === 5), "50.1: criar mais uma tarefa padrão");
await tplBox.getByRole("button", { name: "Desativar tarefa padrão Copy de vendas" }).click();
await waitFor(page, () => db.opsOnboardingTemplates.find((t) => t.title === "Copy de vendas").active === false, "desativada");
check(true, "50.1: desativar tarefa padrão");
await page.screenshot({ path: `${SHOTS}/50.1-configuracoes-tarefas-padrao.png`, fullPage: true });

check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
