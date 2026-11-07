/**
 * Teste de navegador da Etapa 47.1 — Onboarding por etapas: Agendado exige reunião agendada, Realizado exige realizada, cancelar = Onboarding Cancelado.
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

// 7) reunião realizada libera Realizado
const mine = db.opsMeetings.find((m) => m.id === db.opsClientOps[AURORA].onboarding_meeting_id);
mine.status = "realizada";
await page.goto(`${new URL(page.url()).origin}/onboarding`);
const aurora3 = col("coleta_acessos").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await aurora3.getByText(/Reunião realizada/).waitFor();
check(await aurora3.getByRole("button", { name: "Vincular reunião" }).count() === 0, "com reunião realizada os botões somem");
await col("configuracao_inicial").getByText("Studio Beta").waitFor();
await page.screenshot({ path: `${SHOTS}/47.2-onboarding-realizado-cancelado.png`, fullPage: true });
await dragTo(page, aurora3, col("briefing"));
await waitFor(page, () => db.opsClientOps[AURORA].stage_id === "briefing", "cliente foi para Realizado");
check(db.opsClientOps[AURORA].stage_id === "briefing", "com reunião realizada o cliente vai para Realizado");

check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
