/**
 * Teste de navegador da Etapa 47.1 — Onboarding Pendente exige uma reunião REALIZADA.
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

// 2) sem reunião não avança
await dragTo(page, aurora, col("coleta_acessos"));
await page.getByText(/Vincule uma reunião de onboarding/).first().waitFor();
check(db.opsClientOps[AURORA].stage_id === "onboarding_pendente", "sem reunião o cliente não avança (o cartão volta)");

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
await aurora.getByText(/Reunião marcada para/).waitFor();
check(true, "selo amarelo: reunião marcada");

// 4) marcada ainda não libera
await dragTo(page, aurora, col("coleta_acessos"));
await page.getByText(/marque-a como "Realizada"/).first().waitFor();
check(db.opsClientOps[AURORA].stage_id === "onboarding_pendente", "reunião só marcada não libera");

// 5) vincular uma reunião existente (Beta)
const betaCard = col("onboarding_pendente").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Studio Beta" });
await betaCard.getByRole("button", { name: "Vincular reunião" }).click();
dialog = page.getByRole("dialog", { name: /Vincular reunião: Studio Beta/ });
await dialog.getByLabel("Reunião").selectOption({ label: /Kickoff Beta/ }).catch(async () => {
  const v = await dialog.getByLabel("Reunião").locator("option", { hasText: "Kickoff Beta" }).getAttribute("value");
  await dialog.getByLabel("Reunião").selectOption(v);
});
await dialog.getByRole("button", { name: "Vincular" }).click();
await dialog.waitFor({ state: "detached" });
check(db.opsClientOps[BETA].onboarding_meeting_id === beta.id, "reunião existente vinculada ao cliente");
// a mesma reunião não vai para outro cliente
await aurora.getByRole("button", { name: "Trocar reunião" }).click();
dialog = page.getByRole("dialog", { name: /Vincular reunião: Loja Aurora/ });
check(await dialog.getByLabel("Reunião").locator("option", { hasText: "Kickoff Beta" }).count() === 0, "reunião de outro cliente não aparece na lista");
await dialog.getByRole("button", { name: "Cancelar" }).click();

// 6) desvincular volta ao selo vermelho
await betaCard.getByRole("button", { name: "Desvincular" }).click();
await betaCard.getByText("Sem reunião").waitFor();
check(db.opsClientOps[BETA].onboarding_meeting_id === null, "desvincular tira a reunião");

// 7) reunião realizada libera: selo verde, botões somem e o cliente avança
const mine = db.opsMeetings.find((m) => m.id === db.opsClientOps[AURORA].onboarding_meeting_id);
mine.status = "realizada";
await page.reload();
await col("onboarding_pendente").getByText("Loja Aurora").waitFor();
const aurora2 = col("onboarding_pendente").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await aurora2.getByText(/Reunião realizada/).waitFor();
check(await aurora2.getByRole("button", { name: "Vincular reunião" }).count() === 0, "com reunião realizada os botões somem");
await page.screenshot({ path: `${SHOTS}/47.1-onboarding-reuniao-realizada.png`, fullPage: true });
await dragTo(page, aurora2, col("coleta_acessos"));
await waitFor(page, () => db.opsClientOps[AURORA].stage_id !== "onboarding_pendente", "cliente avançou");
check(db.opsClientOps[AURORA].stage_id !== "onboarding_pendente", "com reunião realizada o cliente avança");
check(db.opsClientOps[BETA].stage_id === "onboarding_pendente", "o outro cliente continua parado");

check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
