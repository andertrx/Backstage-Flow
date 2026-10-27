/**
 * Teste de navegador da Etapa 41.3 — grupo e @ padrão de cada cliente, com ligar/desligar por pessoa. Supabase SIMULADO.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const A = "a3000000-0000-4000-8000-0000000000a3";
const B = "b3000000-0000-4000-8000-0000000000b3";
const ENVIO = "e4130000-0000-4000-8000-0000000000e4";
const t = "2026-10-27T12:00:00Z";

const { browser, page, errors } = await launch();
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
const db = await mockSupabase(page, { role: "admin" });
db.clients.push(client(A, "Loja Aurora"), client(B, "Loja Brisa"));
db.opsEnvios.push({ id: ENVIO, nome: "Feedback semanal", mensagem: "Bom dia!", dia_semana: 1, horario: "09:00", ativo: false, arquivado_em: null, versao: 1,
  criado_por: USER_ID, atualizado_por: USER_ID, created_at: t, updated_at: t });
db.opsEnvioClientes.push({ id: crypto.randomUUID(), envio_id: ENVIO, cliente_id: A, nome_grupo: "Acelera A. – Aurora", contatos_marcar: ["Ana Paula", "Bruno", "Carla"],
  contatos_desligados: ["Carla"], ativo: true, observacao: null, removido_em: null, created_at: t, updated_at: t });
db.opsEnvioPadroes.push({ cliente_id: A, nome_grupo: "Acelera A. – Aurora", contatos_marcar: ["Ana Paula", "Bruno", "Carla"], contatos_desligados: ["Carla"],
  atualizado_por: USER_ID, created_at: t, updated_at: t });

await login(page, "/operacoes/envios");
await page.getByTestId("envio-card").waitFor();
check(!(await page.getByTestId("envio-card").innerText()).includes("Carla") && (await page.getByTestId("envio-card").locator("li").first().getAttribute("title")) === "Marcar: @Ana Paula @Bruno",
  "envio marca só os ligados (Carla desligada fica de fora)");

// Grupos e @ dos clientes: lista com ligar/desligar
await page.getByRole("button", { name: "Grupos e @ dos clientes" }).click();
const row = page.getByTestId("envio-padrao").first();
await row.waitFor();
const txt = await row.innerText();
check(txt.includes("Loja Aurora") && txt.includes("Acelera A. – Aurora") && txt.includes("2 de 3 marcado(s)") && txt.includes("Nos envios: Feedback semanal"),
  "cliente com grupo, @ ligados e os envios em que está");
check(await row.getByRole("switch", { name: "Marcar Carla em Loja Aurora" }).getAttribute("aria-checked") === "false", "Carla aparece desligada");

// Desligar Bruno salva na hora e vale para o envio (versão nova)
await row.getByRole("switch", { name: "Marcar Bruno em Loja Aurora" }).click();
await page.getByText("1 de 3 marcado(s)").waitFor();
const pa = db.opsEnvioPadroes.find((x) => x.cliente_id === A);
const ea = db.opsEnvioClientes.find((x) => x.envio_id === ENVIO && x.cliente_id === A);
check(JSON.stringify(pa.contatos_desligados) === JSON.stringify(["Bruno", "Carla"]) && JSON.stringify(pa.contatos_marcar) === JSON.stringify(["Ana Paula", "Bruno", "Carla"]),
  "desligar guarda o nome e não apaga");
check(JSON.stringify(ea.contatos_desligados) === JSON.stringify(["Bruno", "Carla"]) && db.opsEnvios[0].versao === 2, "vale também para o envio (com versão nova)");

// Adicionar o padrão de um cliente novo
await page.getByLabel("Adicionar cliente").selectOption({ label: "Loja Brisa" });
await page.getByRole("button", { name: "Adicionar", exact: true }).click();
const pf = page.getByTestId("envio-padrao-form");
await pf.getByLabel("Nome do grupo").fill("STG – Brisa");
await pf.getByLabel("Adicionar pessoa para marcar em Loja Brisa").fill("11 98765-4321");
await pf.getByRole("button", { name: "Adicionar", exact: true }).click();
await pf.getByRole("button", { name: "Salvar" }).click();
check((await pf.innerText()).includes("não o telefone"), "telefone recusado no padrão");
await pf.getByRole("button", { name: "Tirar 11 98765-4321" }).click();
await pf.getByLabel("Adicionar pessoa para marcar em Loja Brisa").fill("Diego - Brisa");
await pf.getByRole("button", { name: "Adicionar", exact: true }).click();
await pf.getByRole("button", { name: "Salvar" }).click();
await pf.waitFor({ state: "detached" });
await page.getByTestId("envio-padrao").nth(1).waitFor();
check(db.opsEnvioPadroes.some((x) => x.cliente_id === B && x.nome_grupo === "STG – Brisa" && x.contatos_marcar[0] === "Diego - Brisa"), "padrão do cliente novo salvo");
await page.screenshot({ path: `${SHOTS}/envios-grupos-e-arrobas.png` });

// Novo envio: marcar o cliente já preenche o grupo e os @ (com os desligados)
await page.getByRole("button", { name: "Envios", exact: true }).click();
await page.getByRole("button", { name: "Novo envio" }).click();
const form = page.getByTestId("envio-form");
await form.getByLabel("Nome do envio").fill("Feedback mensal");
await form.getByLabel("Mensagem").fill("Oi!");
await form.getByLabel("Dia da semana").selectOption({ label: "Sexta-feira" });
await form.getByLabel("Horário (Brasília)").fill("10:30");
await form.getByLabel("Incluir Loja Aurora").check();
await form.getByLabel("Incluir Loja Brisa").check();
check(await form.getByLabel("Nome do grupo").first().inputValue() === "Acelera A. – Aurora" && await form.getByLabel("Nome do grupo").nth(1).inputValue() === "STG – Brisa",
  "grupo vem preenchido do padrão");
check(await form.getByRole("switch", { name: "Marcar Bruno" }).getAttribute("aria-checked") === "false"
  && await form.getByRole("switch", { name: "Marcar Ana Paula" }).getAttribute("aria-checked") === "true"
  && (await form.getByRole("list", { name: "Quem marcar em Loja Brisa" }).innerText()).includes("@Diego - Brisa"), "@ vêm preenchidos, com ligado/desligado");

// Religar Carla no envio: ao salvar, vira o padrão do cliente
await form.getByRole("switch", { name: "Marcar Carla" }).click();
await form.getByRole("button", { name: "Salvar" }).click();
await page.getByTestId("envio-card").nth(1).waitFor();
const novo = db.opsEnvios.find((e) => e.nome === "Feedback mensal");
const na = db.opsEnvioClientes.find((x) => x.envio_id === novo.id && x.cliente_id === A);
check(JSON.stringify(na.contatos_desligados) === JSON.stringify(["Bruno"]), "envio novo guarda quem está desligado");
check(JSON.stringify(db.opsEnvioPadroes.find((x) => x.cliente_id === A).contatos_desligados) === JSON.stringify(["Bruno"]), "salvar o envio atualiza o padrão do cliente");

// Copiar comando: não marca quem está desligado
await page.getByRole("button", { name: "Copiar comando de Feedback mensal" }).click();
const cmd = await page.evaluate(() => navigator.clipboard.readText());
check(cmd.includes('marcar @Ana Paula @Carla') && !cmd.includes("@Bruno") && cmd.includes("marcar @Diego - Brisa"), "comando copiado só com os @ ligados");

// Editar o envio mostra os desligados de volta
await page.getByRole("button", { name: "Editar Feedback mensal" }).click();
check(await page.getByTestId("envio-form").getByRole("switch", { name: "Marcar Bruno" }).getAttribute("aria-checked") === "false", "editar mostra quem está desligado");
await page.getByTestId("envio-form").getByRole("button", { name: "Cancelar" }).click();

await page.goto(`${BASE}/operacoes/envios`);
await page.getByTestId("envio-card").first().waitFor();
check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();
console.log("Grupos e @ dos clientes (Etapa 41.3): tudo certo.");
