/**
 * Teste de navegador da Etapa 44.3 — envio pelo WhatsApp conectado (chave "enviar sozinho" e "Enviar agora").
 * Supabase e servidor de conexão SIMULADOS; nenhuma mensagem real é enviada.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const A = "a4300000-0000-4000-8000-0000000000a4";
const B = "b4300000-0000-4000-8000-0000000000b4";
const C = "c4300000-0000-4000-8000-0000000000c4";
const ENVIO = "e4300000-0000-4000-8000-0000000000e4";
const SEG_0830 = "2026-11-02T11:30:00Z";
const t = "2026-10-27T12:00:00Z";

function seed(db, conectado = true) {
  db.clients.push(client(A, "Loja Aurora"), client(B, "Loja Brisa"), client(C, "Loja Cais"));
  db.opsEnvios.push({ id: ENVIO, nome: "Feedback semanal", mensagem: "Bom dia! Como foi a semana?", dia_semana: 1, horario: "10:00", ativo: true,
    arquivado_em: null, versao: 1, criado_por: USER_ID, atualizado_por: USER_ID, created_at: t, updated_at: t });
  for (const [id, g] of [[A, "Aurora"], [B, "Brisa"], [C, "Cais"]]) {
    db.opsEnvioClientes.push({ id: crypto.randomUUID(), envio_id: ENVIO, cliente_id: id, nome_grupo: g, contatos_marcar: [], ativo: true, observacao: null, removido_em: null, created_at: t, updated_at: t });
  }
  db.waGrupos.push(
    { id: "g1", cliente_id: A, grupo_id: "120363000000000001@g.us", grupo_nome: "Aurora", desvinculado_em: null },
    { id: "g2", cliente_id: B, grupo_id: "120363000000000002@g.us", grupo_nome: "Brisa", desvinculado_em: null },
  );
  Object.assign(db.waGw, { base_url: "https://whats.exemplo.com.br", has_key: true, risk_accepted_at: t, enabled: conectado, connection_state: conectado ? "conectado" : "desconhecido" });
  db.envioAgora = SEG_0830;
}

// ---------------------------------------------------------------- Admin
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/operacoes/envios");
  await page.getByTestId("envio-aprovacao").getByRole("button", { name: "Decidir depois" }).click();
  const card = page.getByTestId("envio-card").first();
  const panel = card.getByTestId("wa-envio-panel");
  await panel.waitFor();
  const sw = panel.getByRole("switch", { name: "Enviar sozinho pelo WhatsApp conectado" });
  check(await sw.getAttribute("aria-checked") === "false", "começa desligado");
  await sw.click();
  await panel.getByText("Automático: sai sozinho depois de aprovado").waitFor();
  check(db.waAuto.includes(ENVIO) && db.rpcCalls.some((c) => c.fn === "wa_envio_set_automatico" && c.p_on === true), "liga o envio automático");
  check((await panel.innerText()).includes("não envia este envio"), "avisa que o Claude (MCP) não envia mais este envio");

  await panel.getByRole("button", { name: "Enviar agora" }).click();
  const modal = page.getByTestId("wa-enviar-agora");
  await modal.waitFor();
  check((await modal.innerText()).includes("Sem grupo ligado"), "mostra quem está sem grupo ligado");
  await modal.getByLabel("Loja Aurora").check();
  await modal.getByLabel("Loja Cais").check();
  await page.screenshot({ path: `${SHOTS}/wa-enviar-agora.png` });
  await modal.getByRole("button", { name: /Enviar para 2 cliente/ }).click();
  await modal.getByText("1 mensagem(ns) na fila").waitFor();
  check((await modal.innerText()).includes("Loja Cais: Sem grupo do WhatsApp ligado."), "Cais fica de fora com o motivo");
  await modal.getByRole("button", { name: "Fechar" }).click();
  await panel.getByTestId("wa-disparos-lista").getByText("Na fila").waitFor();
  check((await panel.getByTestId("wa-disparos-lista").innerText()).includes("Loja Aurora"), "mostra o disparo na fila");

  // De novo: já está na fila
  await panel.getByRole("button", { name: "Enviar agora" }).click();
  await modal.getByLabel("Loja Aurora").check();
  await modal.getByRole("button", { name: /Enviar para 1 cliente/ }).click();
  await modal.getByText("Já está na fila.").waitFor();
  check(true, "segundo pedido para o mesmo cliente: já está na fila");
  await modal.getByRole("button", { name: "Fechar" }).click();
  await page.screenshot({ path: `${SHOTS}/wa-disparos-painel.png` });
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

// ---------------------------------------------------------------- Sem conexão: nada de botão que não funciona
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db, false);
  await login(page, "/operacoes/envios");
  await page.getByTestId("envio-card").first().waitFor();
  check(await page.getByTestId("wa-envio-panel").count() === 0, "WhatsApp desconectado: o painel nem aparece");
  await browser.close();
}
console.log("OK: wa-disparos");
