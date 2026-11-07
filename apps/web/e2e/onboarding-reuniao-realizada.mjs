/**
 * Teste de navegador da Etapa 51.4 — botão "Reunião realizada" no cartão do Onboarding: abre a mesma janela do menu
 * Reuniões (ata, presença, "Marcar como realizada"), registra sem sair do Onboarding e o quadro atualiza.
 * Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const AURORA = "c1000000-0000-4000-8000-000000000001";
const now = new Date().toISOString();
const waitFor = async (page, fn, what) => {
  for (let i = 0; i < 50; i++) { if (fn()) return; await page.waitForTimeout(100); }
  throw new Error(`FALHOU: ${what}`);
};

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.opsClientStages.find((s) => s.id === "contrato_pago").active = false;
db.clients.push({ id: AURORA, name: "Loja Aurora", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: now, updated_at: "", created_by: null });
db.opsMeetingSeq = (db.opsMeetingSeq ?? 0) + 1;
const meeting = { id: crypto.randomUUID(), number: db.opsMeetingSeq, title: "Onboarding — Loja Aurora", category_id: "cliente",
  starts_at: new Date(Date.now() - 3_600_000).toISOString(), duration_min: 60, status: "agendada", sector_id: null, client_id: AURORA, location: null,
  agenda: null, notes: null, cancel_reason: null, held_at: null, organizer_id: USER_ID, created_at: now, version: 1, people: [] };
db.opsMeetings.push(meeting);
db.opsClientOps[AURORA] = { stage_id: "coleta_acessos", am_user_id: USER_ID, started_at: now, stage_since: now, version: 1, onboarding_meeting_id: meeting.id };

await page.setViewportSize({ width: 1600, height: 900 });
await login(page, "/onboarding");
const card = page.locator("[data-testid=ops-kanban-column][data-status=coleta_acessos] [data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await card.waitFor();

// 1) cartão com reunião agendada tem o botão; abre a janela de registro do menu Reuniões
await card.getByRole("button", { name: "Reunião realizada", exact: true }).click();
const dialog = page.getByRole("dialog", { name: "Registrar reunião" });
await dialog.getByLabel("Ata / resumo").fill("Cliente aprovou o cronograma. Próximos passos: acessos até sexta.");
await page.screenshot({ path: `${SHOTS}/51.4-reuniao-realizada-no-cartao.png`, fullPage: true });
check(await dialog.getByRole("button", { name: "Marcar como realizada" }).count() === 1, "janela é a mesma do menu Reuniões (Marcar como realizada)");

// 2) registra sem sair do Onboarding; a janela fecha e o cartão atualiza
await dialog.getByRole("button", { name: "Marcar como realizada" }).click();
await dialog.waitFor({ state: "detached" });
await waitFor(page, () => meeting.status === "realizada", "reunião marcada como realizada");
check(meeting.notes?.startsWith("Cliente aprovou"), "ata salva");
check(new URL(page.url()).pathname === "/onboarding", "continua na tela do Onboarding");
await card.getByText(/Reunião realizada #\d+/).waitFor();
check(await card.getByRole("button", { name: "Reunião realizada", exact: true }).count() === 0, "com a reunião realizada o botão some e o selo muda");
check(db.opsClientOps[AURORA].stage_id === "coleta_acessos", "o cartão não muda de coluna sozinho (as regras continuam)");

check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
