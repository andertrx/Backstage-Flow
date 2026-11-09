/**
 * Teste de navegador da Etapa 41.3/41.4, refeito na T5.22 — aba "Clientes" (grupo ligado pelo WhatsApp, sem @nome) e lista de clientes
 * do envio (só liga/desliga). Supabase e servidor de conexão SIMULADOS.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const A = "a3000000-0000-4000-8000-0000000000a3";
const B = "b3000000-0000-4000-8000-0000000000b3";
const ENVIO = "e4130000-0000-4000-8000-0000000000e4";
const t = "2026-10-27T12:00:00Z";
const G1 = "120363000000000001@g.us";
const G2 = "120363000000000002@g.us";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push(client(A, "Loja Aurora"), client(B, "Loja Brisa"));
db.opsEnvios.push({ id: ENVIO, nome: "Feedback semanal", mensagem: "Bom dia!", dia_semana: 1, horario: "09:00", ativo: false, arquivado_em: null, versao: 1,
  criado_por: USER_ID, atualizado_por: USER_ID, created_at: t, updated_at: t });
db.opsEnvioClientes.push({ id: crypto.randomUUID(), envio_id: ENVIO, cliente_id: A, nome_grupo: "Acelera A. – Aurora", contatos_marcar: ["Ana Paula", "Bruno", "Carla"],
  contatos_desligados: ["Carla"], ativo: true, observacao: null, removido_em: null, created_at: t, updated_at: t });
db.opsEnvioPadroes.push({ cliente_id: A, nome_grupo: "Acelera A. – Aurora", contatos_marcar: ["Ana Paula", "Bruno", "Carla"], contatos_desligados: ["Carla"],
  atualizado_por: USER_ID, created_at: t, updated_at: t });
Object.assign(db.waGw, { base_url: "https://whats.exemplo.com.br", has_key: true, risk_accepted_at: t, enabled: true, connection_state: "conectado" });
db.waSim.state = "open";
db.waSim.groups = [{ id: G1, name: "Acelera A. - Aurora", size: 8 }, { id: G2, name: "STG – Brisa (Marketing)", size: 5 }];
db.waGrupos.push({ id: "g1", cliente_id: A, grupo_id: G1, grupo_nome: "Acelera A. - Aurora", desvinculado_em: null });

await login(page, "/operacoes/envios");
await page.getByTestId("envio-card").waitFor();
const cardTxt = await page.getByTestId("envio-card").innerText();
check(!cardTxt.includes("Carla") && !cardTxt.includes("@"), "o envio não mostra mais @nome (quem é marcado fica na aba Clientes)");

// Aba Clientes: grupo ligado, sem campo de nome do grupo nem @nome
await page.getByRole("button", { name: "Clientes", exact: true }).click();
const row = page.getByTestId("envio-padrao").first();
await row.waitFor();
const txt = await row.innerText();
check(txt.includes("Loja Aurora") && txt.includes("Acelera A. - Aurora") && txt.includes("Ninguém marcado nos envios") && txt.includes("Nos envios: Feedback semanal"),
  "cliente com grupo ligado, ninguém marcado e os envios em que está");
check(!txt.includes("Carla") && await page.getByLabel("Nome do grupo").count() === 0, "sem nomes antigos e sem campo para digitar o grupo");

// Adicionar cliente novo: abre a lista de grupos do WhatsApp e cria o cliente nos envios com o nome do grupo escolhido
await page.getByLabel("Adicionar cliente").selectOption({ label: "Loja Brisa" });
await page.getByRole("button", { name: "Adicionar", exact: true }).click();
const um = page.getByTestId("wa-ligar-um");
await um.getByLabel("Grupo de Loja Brisa").waitFor();
await um.getByLabel("Grupo de Loja Brisa").selectOption(G2);
await um.getByRole("button", { name: "Salvar" }).click();
await um.getByText("Ligação salva.").waitFor();
check(db.waGrupos.some((g) => g.cliente_id === B && g.grupo_id === G2) && db.opsEnvioPadroes.some((x) => x.cliente_id === B && x.nome_grupo === "STG – Brisa (Marketing)"),
  "cliente novo: grupo ligado e entra na lista com o nome do grupo do WhatsApp");
await um.getByRole("button", { name: "Fechar" }).click();
await page.getByTestId("envio-padrao").nth(1).waitFor();
await page.screenshot({ path: `${SHOTS}/envios-aba-clientes.png` });

// Novo envio: já vem com a lista toda (todos ligados), só para ligar/desligar
await page.getByRole("button", { name: "Envios", exact: true }).click();
await page.getByRole("button", { name: "Novo envio" }).click();
const form = page.getByTestId("envio-form");
await form.getByTestId("envio-cliente").nth(1).waitFor();
check(await form.getByLabel("Incluir Loja Aurora").isChecked() && await form.getByLabel("Incluir Loja Brisa").isChecked()
  && (await form.innerText()).includes("2 de 2 ligados"), "envio novo já vem com todos os clientes ligados");
const rowA = () => form.getByTestId("envio-cliente").first();
check((await rowA().innerText()).includes("Grupo: Acelera A. – Aurora") && !(await form.innerText()).includes("@") && await form.getByRole("button", { name: /Editar grupo/ }).count() === 0,
  "mostra só o grupo, sem @nome e sem editar ali");
await form.getByRole("button", { name: "Tirar todos" }).click();
check((await form.innerText()).includes("0 de 2 ligados"), "Tirar todos");
await form.getByRole("button", { name: "Selecionar todos" }).click();
check((await form.innerText()).includes("2 de 2 ligados"), "Selecionar todos");

await form.getByLabel("Nome do envio").fill("Feedback mensal");
await form.getByLabel("Mensagem").fill("Oi!");
await form.getByLabel("Dia da semana").selectOption({ label: "Sexta-feira" });
await form.getByLabel("Horário (Brasília)").fill("10:30");
await form.getByLabel("Incluir Loja Brisa").uncheck();
await page.screenshot({ path: `${SHOTS}/envios-formulario-lista.png` });
await form.getByRole("button", { name: "Salvar" }).click();
await page.getByTestId("envio-card").nth(1).waitFor();
const novo = db.opsEnvios.find((e) => e.nome === "Feedback mensal");
check(db.opsEnvioClientes.filter((x) => x.envio_id === novo.id).length === 1, "só o cliente ligado entra no envio novo");
check(await page.getByRole("button", { name: /Copiar comando|Instrução da tarefa/ }).count() === 0, "sem 'Copiar comando' nem 'Instrução da tarefa'");

// Editar o envio: Brisa aparece desligada (não estava no envio)
await page.getByRole("button", { name: "Editar Feedback mensal" }).click();
check(!(await page.getByTestId("envio-form").getByLabel("Incluir Loja Brisa").isChecked()) && await page.getByTestId("envio-form").getByLabel("Incluir Loja Aurora").isChecked(),
  "editar mostra quem está ligado e desligado");
await page.getByTestId("envio-form").getByRole("button", { name: "Cancelar" }).click();

await page.goto(`${BASE}/operacoes/envios`);
await page.getByTestId("envio-card").first().waitFor();
check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();
console.log("Clientes e lista do envio (T5.22): tudo certo.");
