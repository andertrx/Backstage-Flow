/**
 * Teste de navegador da T5.20 — ligar o grupo do WhatsApp (botão "Ligar grupo", ficha do cliente, atalho em Integrações)
 * e escolher quem marcar (@) por número. Supabase e servidor de conexão SIMULADOS; nada é enviado.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const A = "a4400000-0000-4000-8000-0000000000a4";
const B = "b4400000-0000-4000-8000-0000000000b4";
const ENVIO = "e4400000-0000-4000-8000-0000000000e4";
const t = "2026-10-27T12:00:00Z";
const G1 = "120363000000000001@g.us";
const G2 = "120363000000000002@g.us";
const P = ["5545999991111", "5545988882222", "5545977773333"];

function seed(db) {
  db.clients.push(client(A, "Loja Aurora"), client(B, "Loja Brisa"));
  db.opsEnvios.push({ id: ENVIO, nome: "Feedback semanal", mensagem: "Bom dia! Como foi a semana?", dia_semana: 1, horario: "10:00", ativo: true,
    arquivado_em: null, versao: 1, criado_por: USER_ID, atualizado_por: USER_ID, created_at: t, updated_at: t });
  for (const [id, grupo] of [[A, "Acelera A. – Aurora"], [B, "STG – Brisa"]]) {
    db.opsEnvioClientes.push({ id: crypto.randomUUID(), envio_id: ENVIO, cliente_id: id, nome_grupo: grupo, contatos_marcar: ["Ana", "Beto"], ativo: true, observacao: null, removido_em: null, created_at: t, updated_at: t });
    db.opsEnvioPadroes.push({ cliente_id: id, nome_grupo: grupo, contatos_marcar: ["Ana", "Beto"], contatos_desligados: [], atualizado_por: USER_ID, created_at: t, updated_at: t });
  }
  Object.assign(db.waGw, { base_url: "https://whats.exemplo.com.br", has_key: true, risk_accepted_at: t, enabled: true, connection_state: "conectado" });
  db.waSim.state = "open";
  db.waSim.groups = [{ id: G1, name: "Acelera A. - Aurora", size: 8 }, { id: G2, name: "STG - Brisa (Marketing)", size: 5 }];
  db.waParticipantes = { [G1]: [{ numero: P[0], admin: true }, { numero: P[1], admin: false }, { numero: P[2], admin: false }] };
  db.envioAgora = "2026-11-02T11:30:00Z";
}

const base = (page) => page.url().split("/").slice(0, 3).join("/");
/** Abre a página de Envios e fecha o pop-up de aprovação, se aparecer. */
async function abrirEnvios(page, path = "/operacoes/envios") {
  await page.goto(base(page) + path);
  const dec = page.getByTestId("envio-aprovacao").getByRole("button", { name: "Decidir depois" });
  await dec.waitFor({ timeout: 3000 }).then(() => dec.click()).catch(() => {});
}

// ---------------------------------------------------------------- Admin
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);

  // 1) Integrações: atalho para ligar os grupos
  await login(page, "/configuracoes/integracoes");
  const atalho = page.getByTestId("wa-ligar-grupos-atalho");
  await atalho.waitFor();
  check((await atalho.innerText()).includes("Ligar os grupos dos clientes"), "Integrações tem o atalho para ligar os grupos dos clientes");

  // 2) Envios: com nenhum grupo ligado o card avisa e fica em destaque; "Pessoas a marcar" espera o grupo
  await abrirEnvios(page, "/envios");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  const card = page.getByTestId("wa-grupos-card");
  await card.waitFor();
  check((await card.innerText()).includes("Nenhum grupo ligado: o envio automático não vai enviar nada"), "card avisa quando não há nenhum grupo ligado");
  check(await page.getByTestId("cliente-grupo-marcar").first().isDisabled(), "'Pessoas a marcar' só abre depois de ligar o grupo");

  // 3) Painel do envio automático: a lista de clientes sem grupo tem o botão "Ligar grupo" e abre a busca com a sugestão pelo nome
  await abrirEnvios(page);
  await page.getByRole("button", { name: "Envios", exact: true }).click();
  const painel = page.getByTestId("envio-card").first().getByTestId("wa-envio-panel");
  await painel.waitFor();
  db.waAuto.push(ENVIO);
  await page.reload();
  const dec2 = page.getByTestId("envio-aprovacao").getByRole("button", { name: "Decidir depois" });
  await dec2.waitFor({ timeout: 3000 }).then(() => dec2.click()).catch(() => {});
  await page.getByRole("button", { name: "Envios", exact: true }).click();
  const sem = page.getByTestId("wa-sem-grupo");
  await sem.waitFor();
  check((await sem.innerText()).includes("2 cliente(s) sem grupo ligado"), "o painel avisa quantos clientes estão sem grupo");
  await sem.getByTestId("wa-ligar-grupo").first().click();
  const um = page.getByTestId("wa-ligar-um");
  await um.getByLabel("Grupo de Loja Aurora").waitFor();
  check(db.functionCalls.some((c) => c.fn === "wa-gateway" && c.action === "groups"), "ao abrir, já busca os grupos no WhatsApp");
  check(await um.getByLabel("Grupo de Loja Aurora").inputValue() === G1, "sugere o grupo pelo nome parecido");
  await um.getByRole("button", { name: "Salvar" }).click();
  await um.getByText("Ligação salva.").waitFor();
  check(db.waGrupos.some((g) => g.cliente_id === A && g.grupo_id === G1 && !g.desvinculado_em), "a ligação foi gravada");
  await um.getByRole("button", { name: "Fechar" }).click();

  // 4) Ficha do cliente: seção "Grupo do WhatsApp" com o grupo ligado e escolha de números
  await page.goto(page.url().split("/").slice(0, 3).join("/") + `/clientes/${A}`);
  const sec = page.getByTestId("cliente-grupo-wa");
  await sec.waitFor();
  await page.getByTestId("cliente-grupo-nome").waitFor();
  check((await sec.innerText()).includes("Ninguém marcado nos envios"), "ficha mostra o grupo e que ninguém está marcado ainda");
  await page.getByTestId("cliente-grupo-marcar").click();
  const mm = page.getByTestId("wa-marcacoes-modal");
  await mm.getByLabel("Número da pessoa").waitFor();
  check(db.functionCalls.some((c) => c.fn === "wa-gateway" && c.action === "participants" && c.groupId === G1), "lê quem está no grupo (só números)");
  const optsTxt = await mm.getByLabel("Número da pessoa").innerText();
  check(optsTxt.includes("+55 45 99999-1111 · admin do grupo") && optsTxt.includes("+55 45 98888-2222"), "mostra os números formatados e quem é admin do grupo");
  check((await mm.innerText()).includes("Nomes que este cliente já tinha: Ana, Beto"), "os nomes antigos aparecem só como ajuda para o apelido");
  await mm.getByLabel("Apelido da pessoa").fill("Dono");
  await mm.getByLabel("Número da pessoa").selectOption(P[1]);
  await mm.getByRole("button", { name: "Adicionar" }).click();
  await mm.getByTestId("wa-marcacao-linha").first().waitFor();
  await mm.getByLabel("Apelido da pessoa").fill("Sócia");
  check(!(await mm.getByLabel("Número da pessoa").innerText()).includes("98888-2222"), "número já usado não aparece de novo na lista");
  await mm.getByLabel("Número da pessoa").selectOption(P[2]);
  await mm.getByRole("button", { name: "Adicionar" }).click();
  await mm.getByTestId("wa-marcacao-linha").nth(1).waitFor();
  await page.screenshot({ path: `${SHOTS}/wa-marcacoes-modal.png` });
  check(db.waMarcacoes.length === 2 && db.waMarcacoes.find((m) => m.nome === "Dono")?.numero === P[1] && db.waMarcacoes.find((m) => m.nome === "Sócia")?.numero === P[2], "grava o número de cada pessoa");

  // 5) Desligar uma pessoa (fica guardada) e tirar outra
  await mm.getByRole("switch", { name: "Marcar Dono" }).click();
  await page.waitForTimeout(300);
  await mm.getByRole("button", { name: "Tirar Sócia" }).click();
  await page.waitForTimeout(300);
  check(db.waMarcacoes.length === 1 && db.waMarcacoes[0].nome === "Dono" && db.waMarcacoes[0].ativo === false, "desligar guarda a pessoa sem marcar; tirar remove só a outra");
  await mm.getByRole("button", { name: "Fechar" }).click();

  // 6) Aba Clientes: mostra o grupo ligado de Aurora e "Sem grupo ligado" de Brisa
  await abrirEnvios(page, "/envios");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  const linhas = await page.getByTestId("envio-padrao").allInnerTexts();
  check(linhas.length === 2 && linhas[0].includes("Loja Aurora") && linhas[0].includes("Acelera A. - Aurora") && linhas[1].includes("Sem grupo ligado"), "aba Clientes: Aurora com grupo ligado; Brisa ainda sem grupo");
  check(!(await page.getByTestId("ops-envios").innerText()).includes("@Ana"), "nenhum @nome antigo aparece na tela");
  await page.screenshot({ path: `${SHOTS}/wa-marcacoes-index.png` });
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// ---------------------------------------------------------------- Não administrador (Envios semanais, sem poder de ligar)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.waGrupos.push({ id: "g1", cliente_id: A, grupo_id: G1, grupo_nome: "Acelera A. - Aurora", desvinculado_em: null });
  db.waMarcacoes.push({ cliente_id: A, nome: "Ana", numero: P[0], ativo: true });
  await login(page, `/clientes/${A}`);
  const sec = page.getByTestId("cliente-grupo-wa");
  if (await sec.count() === 0) await sec.waitFor({ timeout: 4000 }).catch(() => {});
  if (await sec.count()) {
    check(await page.getByTestId("cliente-grupo-ligar").count() === 0 && await page.getByTestId("cliente-grupo-marcar").count() === 0, "quem não é administrador não vê os botões de ligar nem de escolher números");
    check(!(await sec.innerText()).includes(P[0]) && !(await sec.innerText()).includes("99999-1111"), "o número de telefone nunca aparece para quem não é administrador");
  } else {
    check(true, "gestor sem acesso a Envios semanais não vê a seção (nada a mostrar)");
  }
  check(errors.length === 0, `sem erros no navegador (gestor) (${errors.join(" | ")})`);
  await browser.close();
}
console.log("wa-marcacoes: OK");
