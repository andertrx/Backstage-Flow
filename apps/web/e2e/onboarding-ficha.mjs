/**
 * Teste de navegador da Etapa 51.1 — Ficha do cliente no Onboarding: aba "Onboarding" com dados do cliente, o que veio
 * do Comercial, contatos do onboarding (registro rápido, último contato no cartão) e observações; cadastro de cliente novo
 * direto no onboarding. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const AURORA = "c1000000-0000-4000-8000-000000000001";
const now = new Date().toISOString();
const client = (id, name, extra = {}) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-20T12:00:00Z", updated_at: "", created_by: null, ...extra });
const waitFor = async (page, fn, what) => {
  for (let i = 0; i < 50; i++) { if (fn()) return; await page.waitForTimeout(100); }
  throw new Error(`FALHOU: ${what}`);
};

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
// como no banco real (38.2): a Operação começa em Onboarding Pendente ("Contrato Pago" desativada)
db.opsClientStages.find((s) => s.id === "contrato_pago").active = false;
// Loja Aurora veio do Comercial (lead #7 convertido, com observações e contatos registrados)
db.clients.push(client(AURORA, "Loja Aurora", { company: "Aurora Comércio Ltda", owner_name: "Paula", phone: "5511988887777", email: "paula@aurora.com.br" }));
db.opsClientOps[AURORA] = { stage_id: "onboarding_pendente", am_user_id: null, started_at: now, stage_since: now, version: 1 };
const lead = { id: crypto.randomUUID(), number: 7, company_name: "Loja Aurora", contact_name: "Paula", phone: "5511988887777", email: "paula@aurora.com.br",
  cnpj: null, segment: "Moda", city: "São Paulo", state: "SP", origin: "Indicação", service_interest: "Tráfego pago Meta", owner_id: null,
  notes: "Fechou o plano de 3 meses. Quer começar pelas campanhas de Black Friday.", potential_value: 3500, currency: "BRL", priority: "media",
  entered_at: "2026-10-20", next_action: null, next_action_date: null, stage_id: "contrato_pago", stage_since: now, last_interaction_at: now, loss_reason_id: null,
  loss_note: null, lost_at: null, client_id: AURORA, converted_at: now, converted_by: null, archived_at: null, version: 3, created_by: null, created_at: now };
db.opsLeads.push(lead);
db.opsLeadEvents.push({ id: db.opsLeadEvents.length + 1, lead_id: lead.id, action: "lead.interacao", kind: "reuniao", body: "Reunião de proposta: aprovou o orçamento",
  happened_at: "2026-11-02T14:00:00Z", actor_id: null, origin: "manual", before: null, after: null, created_at: "2026-11-02T14:05:00Z" });

await page.setViewportSize({ width: 1700, height: 950 });
await login(page, "/onboarding");
const col = (id) => page.locator(`[data-testid=ops-kanban-column][data-status=${id}]`);
await col("onboarding_pendente").getByText("Loja Aurora").waitFor();

// 1) cartão sem contato mostra "Nenhum contato registrado"
const auroraCard = col("onboarding_pendente").locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" });
check(await auroraCard.getByText("Nenhum contato registrado").count() === 1, "cartão sem contato avisa");

// 2) a ficha abre na aba Onboarding, com dados do cliente e o que veio do Comercial (sem telefone/e-mail do lead no resumo)
await auroraCard.getByTestId("ops-client-card").click();
const drawer = page.getByTestId("ops-client-drawer");
await drawer.getByTestId("ops-client-onboarding").waitFor();
check(await drawer.getByRole("button", { name: "Onboarding" }).getAttribute("aria-pressed") === "true", "ficha abre na aba Onboarding");
const data = drawer.getByTestId("ops-onb-data");
await data.getByText("Aurora Comércio Ltda").waitFor();
check((await data.innerText()).includes("(11) 98888-7777"), "telefone do cliente formatado nos dados");
const leadCard = drawer.getByTestId("ops-onb-lead");
check((await leadCard.innerText()).includes("Lead #7"), "resumo mostra o número do lead");
check((await leadCard.innerText()).includes("Black Friday"), "resumo mostra as observações do Comercial");
check((await leadCard.innerText()).includes("Tráfego pago Meta"), "resumo mostra o serviço de interesse");
check((await leadCard.getByTestId("ops-onb-lead-contacts").innerText()).includes("aprovou o orçamento"), "resumo mostra os contatos do Comercial");
check(!(await leadCard.innerText()).includes("paula@aurora"), "resumo do Comercial não repete o e-mail do lead");

// 3) registrar contatos do onboarding: mais recente primeiro e aparece no cartão
const contacts = drawer.getByTestId("ops-onb-contacts");
await contacts.getByLabel("Tipo do contato").selectOption("nao_atendeu");
await contacts.getByLabel("O que aconteceu").fill("Liguei às 10h, não atendeu");
await contacts.getByRole("button", { name: "Registrar" }).click();
await contacts.getByTestId("ops-onb-contact").filter({ hasText: "Liguei às 10h" }).waitFor();
await contacts.getByLabel("Tipo do contato").selectOption("reagendado");
await contacts.getByLabel("O que aconteceu").fill("Conversei com ela hoje, não deu certo. Marquei para amanhã.");
await contacts.getByRole("button", { name: "Registrar" }).click();
await waitFor(page, () => db.opsOnbContacts.filter((k) => k.client_id === AURORA).length === 2, "segundo contato gravado");
await contacts.getByTestId("ops-onb-contact").nth(1).waitFor();
const first = await contacts.getByTestId("ops-onb-contact").first().innerText();
check(first.includes("Reagendado") && first.includes("Marquei para amanhã"), "contato mais recente aparece primeiro");
check(db.opsOnbContacts.filter((k) => k.client_id === AURORA && !k.removed_at).length === 2, "2 contatos gravados");
check(await contacts.getByLabel("O que aconteceu").inputValue() === "", "campo limpa depois de registrar");

// 4) observações: salvar e guardar no histórico
const notes = drawer.getByTestId("ops-onb-notes");
await notes.getByLabel("Observações do onboarding").fill("Cliente prefere contato à tarde. Sócia decide sobre orçamento.");
await notes.getByRole("button", { name: "Salvar observações" }).click();
await notes.getByText("Observações salvas.").waitFor();
check(db.opsClientOps[AURORA].onboarding_notes === "Cliente prefere contato à tarde. Sócia decide sobre orçamento.", "observações salvas");
check(db.opsActivity.some((a) => a.client_id === AURORA && a.action === "cliente.observacoes"), "observações no histórico do cliente");

// 5) editar os dados do cliente: o histórico guarda só os nomes dos campos
await data.getByRole("button", { name: "Editar" }).click();
const form = data.getByTestId("ops-onb-data-form");
await form.getByLabel("Responsável").fill("Paula Lima");
await form.getByLabel("CNPJ").fill("123");
await form.getByRole("button", { name: "Salvar dados" }).click();
await form.getByText(/CNPJ inválido/).waitFor();
check(true, "CNPJ inválido é recusado");
await form.getByLabel("CNPJ").fill("12.abc.345/01de-35");
await form.getByRole("button", { name: "Salvar dados" }).click();
await data.getByText("Paula Lima").waitFor();
const aur = db.clients.find((c) => c.id === AURORA);
check(aur.owner_name === "Paula Lima" && aur.cnpj === "12ABC34501DE35", "dados salvos (CNPJ com letras aceito)");
const log = db.opsActivity.find((a) => a.client_id === AURORA && a.action === "cliente.dados");
check(log && JSON.stringify(log.after) === JSON.stringify({ campos: ["CNPJ", "responsável"] }), "histórico dos dados só com os nomes dos campos");
await page.screenshot({ path: `${SHOTS}/51.1-ficha-onboarding.png`, fullPage: true });
await drawer.getByRole("button", { name: "Fechar ficha" }).click();

// 6) o cartão mostra o último contato
await auroraCard.getByTestId("ops-client-last-contact").waitFor();
check((await auroraCard.getByTestId("ops-client-last-contact").innerText()).includes("Reagendado"), "cartão mostra o último contato");

// 7) cliente novo direto no onboarding: nome repetido é recusado; depois entra em Pendente e abre a ficha
await page.getByRole("button", { name: "Cliente novo" }).click();
let dialog = page.getByRole("dialog", { name: "Cadastrar cliente novo no onboarding" });
await dialog.getByLabel("Nome do cliente").fill("loja aurora");
await dialog.getByRole("button", { name: /Cadastrar e iniciar/ }).click();
await dialog.getByText(/Já existe o cliente "Loja Aurora"/).waitFor();
check(true, "cliente novo com nome repetido é recusado");
await dialog.getByLabel("Nome do cliente").fill("Padaria Sol");
await dialog.getByLabel("Responsável").fill("Carlos");
await dialog.getByLabel("Telefone").fill("(21) 3456-7890");
await page.screenshot({ path: `${SHOTS}/51.1-cliente-novo.png`, fullPage: true });
await dialog.getByRole("button", { name: /Cadastrar e iniciar/ }).click();
await dialog.waitFor({ state: "detached" });
const sol = db.clients.find((c) => c.name === "Padaria Sol");
check(sol && sol.phone === "552134567890" && db.opsClientOps[sol.id]?.stage_id === "onboarding_pendente", "cliente novo cadastrado e em Onboarding Pendente");
await drawer.getByTestId("ops-client-onboarding").waitFor();
check((await drawer.getByTestId("ops-onb-lead").innerText()).includes("Entrou direto no onboarding"), "cliente direto: sem resumo do Comercial");
check((await drawer.getByTestId("ops-onb-data").innerText()).includes("Carlos"), "dados do cliente novo na ficha");
await drawer.getByRole("button", { name: "Fechar ficha" }).click();
await col("onboarding_pendente").getByText("Padaria Sol").waitFor();
check(true, "cliente novo aparece no quadro");

check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
