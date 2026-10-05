/**
 * Teste de navegador da Etapa 36.4 — Central de Operações: Kanban comercial
 * (leads, aviso de duplicado, motivo de perda, regras de transição, histórico
 * sem dados de contato e conversão em cliente sem duplicar). Supabase SIMULADO.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const MARIA = "22222222-2222-2222-2222-222222222222";
const EXISTENTE = "c1000000-0000-4000-8000-000000000009";
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;
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
const col = (page, id) => page.locator(`[data-testid=ops-kanban-column][data-status=${id}]`);
const card = (page, n) => page.locator(`[data-testid=ops-kanban-card][data-task="${n}"]`);
const waitFor = async (page, fn, what) => {
  for (let i = 0; i < 40; i++) { if (fn()) return; await page.waitForTimeout(100); }
  throw new Error(`FALHOU: ${what}`);
};

async function newLead(page, fields) {
  await page.getByRole("button", { name: "Novo lead" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo lead" });
  for (const [label, value] of Object.entries(fields)) {
    const el = dialog.getByLabel(label, { exact: true });
    if ((await el.evaluate((e) => e.tagName)) === "SELECT") await el.selectOption(value); else await el.fill(value);
  }
  await dialog.getByRole("button", { name: "Cadastrar lead" }).click();
  await dialog.waitFor({ state: "detached" });
}

// ---------------------------------------------------------------- Admin
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push(client(EXISTENTE, "Loja Existente"));
  db.opsMembers[MARIA] = { primary: sectorId(db, "Account Manager"), secondary: [], job_title: "AM", active: true, joins_meetings: true, permissions: ["ops.access"] };
  await login(page, "/operacoes/comercial");
  await page.getByTestId("ops-commercial-empty").waitFor();
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(["Painel", "Minhas tarefas", "Tarefas", "Comercial", "Operação", "Filas", "Reuniões", "Equipe", "Configurações"]), `abas (${tabs.join(", ")})`);

  // Cadastro com valores em moedas diferentes
  await newLead(page, { "Nome da empresa": "Padaria Sol", "Nome do contato": "Ana", Telefone: "(45) 99999-8888", "E-mail": "ana@sol.com",
    Origem: "Instagram", "Valor potencial": "1.500,50", Segmento: "Alimentação" });
  await page.getByTestId("ops-lead-drawer").waitFor();
  await page.getByRole("button", { name: "Fechar lead" }).click();
  await newLead(page, { "Nome da empresa": "Tech USA", "Valor potencial": "300", Moeda: "USD" });
  await page.getByRole("button", { name: "Fechar lead" }).click();
  const [l1, l2] = db.opsLeads;
  check(l1.phone === "5545999998888" && l1.potential_value === 1500.5 && l1.currency === "BRL" && l2.currency === "USD", "lead gravado (telefone só dígitos, valor e moeda)");
  await page.getByTestId("ops-commercial-total").waitFor();
  const total = (await page.getByTestId("ops-commercial-total").innerText()).replace(/\s/g, " ");
  check(total.includes("R$ 1.500,50") && total.includes("US$ 300,00") && !total.includes("1.800"), `totais separados por moeda (${total})`);
  check(await page.getByTestId("ops-kanban-column").count() === 11, "11 colunas comerciais");

  // Aviso de duplicado (não impede)
  await page.getByRole("button", { name: "Novo lead" }).click();
  let dialog = page.getByRole("dialog", { name: "Novo lead" });
  await dialog.getByLabel("Nome da empresa", { exact: true }).fill("Loja Existente");
  await dialog.getByLabel("E-mail", { exact: true }).fill("ana@sol.com");
  await dialog.getByTestId("ops-lead-duplicates").waitFor();
  const dupText = await dialog.getByTestId("ops-lead-duplicates").innerText();
  check(dupText.includes("Padaria Sol") && dupText.includes("mesmo e-mail") && dupText.includes("Cliente Loja Existente"), "aviso mostra lead e cliente parecidos");
  await dialog.getByRole("button", { name: "Cadastrar lead" }).click();
  await dialog.waitFor({ state: "detached" });
  check(db.opsLeads.length === 3, "o aviso não impede o cadastro");
  await page.getByRole("button", { name: "Fechar lead" }).click();
  const l3 = db.opsLeads[2];

  // Perder pede motivo (arrastando no Kanban). O quadro rola para os lados:
  // leva o lead para perto de "Perdido" pelo painel e rola o quadro até o fim.
  await card(page, l2.number).click();
  await page.getByTestId("ops-lead-drawer").getByLabel("Coluna do lead").selectOption("aguardando_pagamento");
  await waitFor(page, () => l2.stage_id === "aguardando_pagamento", "lead movido pelo painel");
  await page.getByRole("button", { name: "Fechar lead" }).click();
  await col(page, "perdido").evaluate((el) => el.scrollIntoView({ inline: "end", block: "nearest" }));
  await col(page, "aguardando_pagamento").getByText("Tech USA").waitFor();
  await dragTo(page, card(page, l2.number), col(page, "perdido"));
  dialog = page.getByRole("dialog", { name: "Motivo da perda" });
  await dialog.getByRole("button", { name: "Marcar como perdido" }).click();
  await dialog.getByText("Escolha o motivo.").waitFor();
  await dialog.getByLabel("Motivo").selectOption({ label: "Valor incompatível" });
  await dialog.getByLabel("Observação").fill("Achou caro");
  await dialog.getByRole("button", { name: "Marcar como perdido" }).click();
  await dialog.waitFor({ state: "detached" });
  await waitFor(page, () => l2.stage_id === "perdido", "lead perdido");
  check(l2.stage_id === "perdido" && l2.loss_reason_id === "valor", "perdido com motivo");
  // 38.1: o perdido sai do funil e vai para "Ganhos e perdidos".
  await col(page, "perdido").getByText("Os perdidos ficam em “Ganhos e perdidos”").waitFor();
  check(await col(page, "perdido").getByTestId("ops-lead-card").count() === 0, "38.1: o perdido sai do funil");
  await page.getByTestId("ops-commercial-tab-resultados").click();
  await page.getByTestId("ops-commercial-results").waitFor();
  await page.getByRole("button", { name: /^Perdidos \(1\)/ }).click();
  await page.getByTestId("ops-result-row").filter({ hasText: "Tech USA" }).getByText("Valor incompatível").waitFor();
  check(true, "38.1: o perdido aparece em Ganhos e perdidos, com o motivo");
  await page.getByTestId("ops-commercial-tab-funil").click();
  await page.getByTestId("ops-kanban").waitFor();

  // Regra de transição configurável (38.1: dentro do Comercial, em "Configurações do comercial")
  await page.getByTestId("ops-commercial-tab-config").click();
  await page.getByTestId("ops-lead-stages").waitFor();
  check(page.url().includes("ver=config"), "38.1: configurações do comercial dentro do Comercial");
  await page.getByRole("button", { name: "Editar coluna comercial Negociação" }).click();
  dialog = page.getByRole("dialog", { name: "Editar coluna comercial" });
  await dialog.getByLabel("Exige próxima ação com data para entrar").check();
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await dialog.waitFor({ state: "detached" });
  check(db.opsLeadStages.find((s) => s.id === "negociacao").require_next_action, "regra salva");
  check(await page.getByTestId("ops-loss-reason-row").count() === 5, "5 motivos de perda");
  await page.getByTestId("ops-commercial-tab-funil").click();
  await card(page, l1.number).click();
  await page.getByTestId("ops-lead-drawer").getByLabel("Coluna do lead").selectOption("negociacao");
  await page.getByText('Para entrar em "Negociação", preencha a próxima ação e a data dela.').waitFor();
  check(l1.stage_id === "prospeccao", "regra de transição impede a mudança");
  await page.getByRole("button", { name: "Fechar lead" }).click();
  await page.screenshot({ path: `${SHOTS}/ops-comercial.png`, fullPage: true });

  // Detalhe: registro, edição (histórico sem telefone) e conversão
  await card(page, l1.number).click();
  const drawer = page.getByTestId("ops-lead-drawer");
  await drawer.getByLabel("Tipo de registro").selectOption("reuniao");
  await drawer.getByLabel("O que aconteceu").fill("Reunião de apresentação");
  await drawer.getByRole("button", { name: "Registrar" }).click();
  await drawer.getByTestId("ops-lead-history").getByText("Reunião: Reunião de apresentação").waitFor();
  check(Boolean(l1.last_interaction_at), "interação registrada");
  await drawer.getByRole("button", { name: "Editar" }).click();
  dialog = page.getByRole("dialog", { name: `Editar lead #${l1.number}` });
  await dialog.getByLabel("Telefone", { exact: true }).fill("(45) 98888-7777");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await dialog.waitFor({ state: "detached" });
  await drawer.getByText("Mudou: telefone").waitFor();
  check(!JSON.stringify(db.opsLeadEvents).match(/4599999|4598888|ana@sol/), "telefone e e-mail nunca vão para o histórico");
  await drawer.getByLabel("Coluna do lead").selectOption("contrato_pago");
  await drawer.getByTestId("ops-lead-convert").waitFor();
  check(!(await drawer.getByTestId("ops-lead-convert").innerText()).includes("Vincular"), "sem cliente parecido: só criar");
  await drawer.getByLabel("Account Manager do onboarding").selectOption({ label: "Maria Gestora" });
  await drawer.getByRole("button", { name: "Criar cliente novo com os dados do lead" }).click();
  await drawer.getByText("Cliente criado e onboarding iniciado.").waitFor();
  const created = db.clients.find((c) => c.name === "Padaria Sol");
  check(created && l1.client_id === created.id && created.phone === "5545988887777", "cliente criado com os dados do lead");
  check(db.opsClientOps[created.id]?.am_user_id === MARIA, "onboarding iniciado com o Account Manager");
  check(db.opsActivity.some((a) => a.client_id === created.id && a.action === "cliente.convertido"), "conversão no Histórico Operacional do cliente");
  await drawer.getByText("Virou cliente:").waitFor();
  await drawer.getByLabel("Coluna do lead").selectOption("negociacao");
  await drawer.getByText("Este lead já virou cliente").waitFor();
  check(true, "convertido não volta para negociação");
  await page.screenshot({ path: `${SHOTS}/ops-lead.png` });
  await drawer.getByRole("button", { name: "Fechar lead" }).click();

  // Lead com o nome de um cliente existente: vincular (não duplica)
  await card(page, l3.number).click();
  await drawer.getByLabel("Coluna do lead").selectOption("contrato_pago");
  await drawer.getByRole("button", { name: "Vincular a Loja Existente" }).waitFor();
  check(await drawer.getByRole("button", { name: /^Vincular a / }).count() === 2, "mostra os 2 clientes parecidos (mesmo nome e mesmo e-mail)");
  await drawer.getByRole("button", { name: "Criar cliente novo com os dados do lead" }).click();
  await drawer.getByText('Já existe o cliente "Loja Existente"').waitFor();
  check(db.clients.filter((c) => c.name === "Loja Existente").length === 1, "criar duplicado é recusado");
  await drawer.getByLabel("Iniciar o onboarding").uncheck();
  await drawer.getByRole("button", { name: "Vincular a Loja Existente" }).click();
  await drawer.getByText("Lead vinculado ao cliente.").waitFor();
  check(l3.client_id === EXISTENTE, "lead vinculado ao cliente existente");
  await drawer.getByRole("button", { name: "Fechar lead" }).click();
  // 38.1: quem virou cliente sai do funil e fica em "Ganhos".
  check(await page.getByTestId("ops-lead-card").filter({ hasText: "Padaria Sol" }).count() === 0, "38.1: quem virou cliente sai do funil");
  await page.getByTestId("ops-commercial-tab-resultados").click();
  await page.getByRole("button", { name: /^Ganhos \(2\)/ }).click();
  const won = await page.getByTestId("ops-result-row").allInnerTexts();
  check(won.length === 2 && won.some((t) => t.includes("Padaria Sol")) && won.some((t) => t.includes("Loja Existente")), `38.1: Ganhos lista os 2 que viraram cliente (${won.length})`);
  await page.screenshot({ path: `${SHOTS}/38.1-ganhos.png`, fullPage: true });
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// ---------------------------------------------------------------- Vendedor (papel Equipe + "Comercial"): não cria cliente
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Comercial"), secondary: [], job_title: "Vendas", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.commercial"] };
  await login(page, "/operacoes/comercial");
  await page.getByTestId("ops-commercial").waitFor();
  check(await page.getByTestId("ops-commercial-tab-config").count() === 0 && await page.getByTestId("ops-commercial-tab-resultados").count() === 1,
    "38.1: vendedor vê Funil e Ganhos e perdidos, sem as configurações do comercial");
  await newLead(page, { "Nome da empresa": "Studio Nova" });
  const drawer = page.getByTestId("ops-lead-drawer");
  await drawer.getByLabel("Coluna do lead").selectOption("contrato_pago");
  await drawer.getByTestId("ops-lead-convert").waitFor();
  const text = await drawer.getByTestId("ops-lead-convert").innerText();
  check(await drawer.getByRole("button", { name: "Criar cliente novo com os dados do lead" }).count() === 0 && text.includes("só para administrador ou gestor"),
    "sem papel admin/gestor: não cria cliente (só vincula)");
  check(await drawer.getByLabel("Iniciar o onboarding").count() === 0, "sem permissão de fluxo: não inicia onboarding");
  check(errors.length === 0, `sem erros (vendedor) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Sem "Comercial"
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true, permissions: ["ops.access"] };
  await login(page, "/operacoes/comercial");
  await page.waitForURL("**/operacoes/minhas-tarefas");
  await page.getByTestId("ops-my-tasks").waitFor();
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(!tabs.includes("Comercial"), `sem a aba Comercial (${tabs.join(", ")})`);
  check(errors.length === 0, `sem erros (designer) ${errors.join(" | ")}`);
  await browser.close();
}
