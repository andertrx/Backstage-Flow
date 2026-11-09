/**
 * Teste de navegador da Etapa 44.2 — ligar o grupo do WhatsApp a cada cliente (Envios → Clientes).
 * Supabase e servidor de conexão SIMULADOS. Nada é enviado nesta etapa.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const A = "a4200000-0000-4000-8000-0000000000a4";
const B = "b4200000-0000-4000-8000-0000000000b4";
const C = "c4200000-0000-4000-8000-0000000000c4";
const t = "2026-10-27T12:00:00Z";
const G1 = "120363000000000001@g.us";
const G2 = "120363000000000002@g.us";
const G3 = "120363000000000003@g.us";

function seed(db) {
  db.clients.push(client(A, "Loja Aurora"), client(B, "Loja Brisa"), client(C, "Loja Cais"));
  for (const [id, grupo] of [[A, "Acelera A. – Aurora"], [B, "STG – Brisa"], [C, "Cais Moda"]]) {
    db.opsEnvioPadroes.push({ cliente_id: id, nome_grupo: grupo, contatos_marcar: ["Ana"], contatos_desligados: [], atualizado_por: USER_ID, created_at: t, updated_at: t });
  }
  Object.assign(db.waGw, { base_url: "https://whats.exemplo.com.br", has_key: true, risk_accepted_at: t, connection_state: "conectado" });
  db.waSim.state = "open";
  db.waSim.groups = [
    { id: G1, name: "Acelera A. - Aurora", size: 8 },
    { id: G2, name: "STG - Brisa (Marketing)", size: 5 },
    { id: G3, name: "Grupo da Família", size: 20 },
  ];
}

// ---------------------------------------------------------------- Admin
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/operacoes/envios");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  const card = page.getByTestId("wa-grupos-card");
  await card.waitFor();
  check((await card.innerText()).includes("0 de 3 ligados"), "começa com 0 de 3 grupos ligados");
  await card.getByRole("button", { name: "Buscar e ligar grupos" }).click();
  const modal = page.getByTestId("wa-grupos-modal");
  await modal.getByRole("button", { name: "Buscar grupos agora" }).click();
  await modal.getByTestId("wa-grupo-linha").first().waitFor();
  check(db.functionCalls.some((c) => c.fn === "wa-gateway" && c.action === "groups"), "busca os grupos no servidor de conexão");
  check((await modal.innerText()).includes("3 grupo(s) no WhatsApp"), "mostra quantos grupos existem");
  const sel = (nome) => modal.getByLabel(`Grupo de ${nome}`);
  check(await sel("Loja Aurora").inputValue() === G1 && await sel("Loja Brisa").inputValue() === G2 && await sel("Loja Cais").inputValue() === "",
    "sugere pelo nome (igual e parecido) e não chuta onde não há semelhança");
  const linhas = await modal.getByTestId("wa-grupo-linha").allInnerTexts();
  check(linhas[0].includes("nome igual") && linhas[1].includes("nome parecido"), "marca se a sugestão é nome igual ou parecido");
  await page.screenshot({ path: `${SHOTS}/wa-grupos-modal.png` });

  // Mesmo grupo em dois clientes: bloqueia
  await sel("Loja Cais").selectOption(G1);
  await modal.getByText("mesmo grupo").waitFor();
  check(await modal.getByRole("button", { name: /Salvar/ }).isDisabled(), "dois clientes com o mesmo grupo: não deixa salvar");
  await sel("Loja Cais").selectOption(G3);
  await modal.getByRole("button", { name: /Salvar/ }).click();
  await modal.getByText("Ligações salvas.").waitFor();
  const ativos = db.waGrupos.filter((g) => !g.desvinculado_em);
  check(ativos.length === 3 && ativos.find((g) => g.cliente_id === A)?.grupo_id === G1 && ativos.find((g) => g.cliente_id === C)?.grupo_id === G3, "ligações gravadas para os 3 clientes");
  check(!JSON.stringify(db.waGrupos).includes("@s.whatsapp.net"), "só identificador de grupo (@g.us), nenhum telefone");
  await modal.getByRole("button", { name: "Fechar" }).click();
  await card.getByText("3 de 3 ligados").waitFor();
  check(true, "o quadro mostra 3 de 3 ligados");

  // Trocar e tirar: o antigo fica guardado como desligado (histórico)
  await card.getByRole("button", { name: "Buscar e ligar grupos" }).click();
  await modal.getByRole("button", { name: "Buscar grupos agora" }).click();
  await modal.getByTestId("wa-grupo-linha").first().waitFor();
  check(await sel("Loja Aurora").inputValue() === G1 && (await modal.getByTestId("wa-grupo-linha").first().innerText()).includes("ligado"), "reabrir mostra o que já está ligado");
  await sel("Loja Cais").selectOption("");
  await modal.getByRole("button", { name: /Salvar/ }).click();
  await modal.getByText("Ligações salvas.").waitFor();
  check(db.waGrupos.filter((g) => g.cliente_id === C).every((g) => g.desvinculado_em) && db.waGrupos.filter((g) => g.cliente_id === C).length === 1, "tirar o grupo guarda o registro como desligado (nada apagado)");
  check(errors.length === 0, "sem erros no navegador (admin)", errors.join(" | "));
  await browser.close();
}

// ---------------------------------------------------------------- WhatsApp desconectado: não deixa buscar
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.waGw.connection_state = "desconectado";
  await login(page, "/operacoes/envios");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  const card = page.getByTestId("wa-grupos-card");
  await card.waitFor();
  check(await card.getByRole("button", { name: "Buscar e ligar grupos" }).isDisabled(), "WhatsApp desconectado: não deixa buscar grupos");
  check((await card.innerText()).includes("Conecte o WhatsApp"), "explica que é preciso conectar");
  await browser.close();
}

console.log("Grupos do WhatsApp (Etapa 44.2): tudo certo.");
