/**
 * Teste de navegador da Etapa 51.5 — "Trocar reunião" no cartão do Onboarding: escolher uma reunião existente ou criar
 * uma nova; o pop-up avisa a substituição e a reunião anterior é cancelada com o motivo "Substituída pela reunião #N".
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
const meeting = (title, days) => {
  db.opsMeetingSeq = (db.opsMeetingSeq ?? 0) + 1;
  const m = { id: crypto.randomUUID(), number: db.opsMeetingSeq, title, category_id: "cliente", starts_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    duration_min: 60, status: "agendada", sector_id: null, client_id: AURORA, location: null, agenda: null, notes: null, cancel_reason: null, held_at: null,
    organizer_id: USER_ID, created_at: now, version: 1, people: [] };
  db.opsMeetings.push(m);
  return m;
};
const m1 = meeting("Onboarding — primeira data", 1);
const m2 = meeting("Onboarding — remarcada", 3);
db.opsClientOps[AURORA] = { stage_id: "coleta_acessos", am_user_id: USER_ID, started_at: now, stage_since: now, version: 1, onboarding_meeting_id: m1.id };

await page.setViewportSize({ width: 1600, height: 900 });
await login(page, "/onboarding");
const card = page.locator("[data-testid=ops-kanban-column][data-status=coleta_acessos] [data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
await card.waitFor();

// 1) com reunião vinculada: "Criar reunião" fica dentro de "Trocar reunião"
check(await card.getByRole("button", { name: "Criar reunião", exact: true }).count() === 0, "sem o botão Criar reunião solto");
check(await card.getByRole("button", { name: "Trocar reunião", exact: true }).count() === 1, "botão Trocar reunião");

// 2) usar uma reunião já criada: pop-up avisa; a anterior (agendada) é cancelada com o motivo
await card.getByRole("button", { name: "Trocar reunião", exact: true }).click();
let dialog = page.getByTestId("ops-onboarding-replace");
await dialog.getByLabel("Usar uma reunião já criada").selectOption(m2.id);
await dialog.getByRole("button", { name: "Usar esta reunião" }).click();
const confirm = page.getByTestId("ops-onboarding-replace-confirm");
await confirm.getByText(/será cancelada com o motivo/).waitFor();
await page.screenshot({ path: `${SHOTS}/51.5-substituir-reuniao.png`, fullPage: true });
await confirm.getByRole("button", { name: "Substituir" }).click();
await waitFor(page, () => db.opsClientOps[AURORA].onboarding_meeting_id === m2.id, "nova reunião vinculada");
check(m1.status === "cancelada" && m1.cancel_reason?.startsWith(`Substituída pela reunião #${m2.number}`), "anterior cancelada com o motivo");
check(db.opsClientOps[AURORA].stage_id === "coleta_acessos", "o cliente continua em Onboarding Agendado");

// 3) criar uma reunião nova pelo Trocar reunião: confirma, cria, vincula e a anterior é cancelada
await card.getByRole("button", { name: "Trocar reunião", exact: true }).click();
dialog = page.getByTestId("ops-onboarding-replace");
await dialog.getByRole("button", { name: "Criar reunião nova" }).click();
await page.getByTestId("ops-onboarding-replace-confirm").getByRole("button", { name: "Continuar e criar a reunião" }).click();
const form = page.getByRole("dialog", { name: "Nova reunião" });
check(await form.getByLabel("Título").inputValue() === "Onboarding — Loja Aurora", "reunião nova já vem com o cliente e o título");
await form.getByRole("button", { name: "Agendar reunião" }).click();
await form.waitFor({ state: "detached" });
await waitFor(page, () => ![m1.id, m2.id].includes(db.opsClientOps[AURORA].onboarding_meeting_id), "reunião criada vinculada");
const m3 = db.opsMeetings.find((m) => m.id === db.opsClientOps[AURORA].onboarding_meeting_id);
check(m2.status === "cancelada" && m2.cancel_reason?.startsWith(`Substituída pela reunião #${m3.number}`), "a reunião anterior também é cancelada ao criar uma nova");
check(db.opsActivity.filter((a) => a.client_id === AURORA && a.action === "cliente.reuniao_substituida").length === 2, "duas substituições no histórico do cliente");

check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
