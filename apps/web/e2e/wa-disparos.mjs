/**
 * Teste de navegador da Etapa 44.3 — envio pelo WhatsApp conectado (chave "enviar sozinho"; sem envio manual desde a T5.21).
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
  check((await panel.innerText()).includes("Quem envia é o próprio CRM"), "avisa que quem envia é o CRM");

  // T5.21: não existe envio manual; o painel avisa quem está sem grupo e o resultado de cada grupo aparece na lista
  check(await panel.getByRole("button", { name: "Enviar agora" }).count() === 0, "não há mais botão de envio manual");
  const sem = panel.getByTestId("wa-sem-grupo");
  await sem.waitFor();
  check((await sem.innerText()).includes("Loja Cais") && !(await sem.innerText()).includes("Loja Aurora"), "avisa quem está sem grupo ligado (Cais) e não cita quem já tem (Aurora)");
  check(await sem.getByTestId("wa-ligar-grupo").count() === 1, "cada cliente sem grupo tem o botão 'Ligar grupo'");
  db.waDisparos.push({ id: 1, envio_id: ENVIO, cliente_id: A, semana: "2026-11-02", origem: "automatico", status: "pendente", tentativas: 0, detalhe: null, enviado_em: null, atualizado_em: t });
  await page.reload();
  await page.getByTestId("envio-card").first().getByTestId("envio-clientes-abrir").click();
  await page.getByTestId("envio-clientes-lista").getByText("Na fila").waitFor();
  check((await page.getByTestId("envio-clientes-lista").innerText()).includes("Loja Aurora"), "mostra o disparo na fila na lista única");
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
// ---------------------------------------------------------------- T5.22 Fase 3: resumo e reenvio
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.waAuto.push(ENVIO);
  db.opsEnvioAprovacoes.push({ id: 1, envio_id: ENVIO, semana: "2026-11-02", decisao: "aprovado", versao_envio: 1, decidido_por: USER_ID, decidido_em: SEG_0830, origem: "manual" });
  const d = (id, cliente_id, status, detalhe = null) => ({ id, envio_id: ENVIO, cliente_id, semana: "2026-11-02", origem: "automatico", status, tentativas: 1, detalhe, enviado_em: status === "enviado" ? t : null, atualizado_em: t });
  db.waDisparos.push(d(1, A, "enviado"), d(2, B, "falhou", "Sem conexão"), d(3, C, "pulado", "Cliente sem grupo do WhatsApp ligado."));
  await login(page, "/operacoes/envios");
  const panel = page.getByTestId("envio-card").first().getByTestId("wa-envio-panel");
  await panel.waitFor();
  check((await panel.getByTestId("wa-resumo").innerText()).includes("1 enviado(s) · 1 falharam · 0 na fila · 1 pulado(s)"), "resumo da semana: enviados, falharam, na fila, pulados");
  const card = page.getByTestId("envio-card").first();
  check(await card.getByTestId("envio-clientes-lista").count() === 0 && (await card.getByTestId("envio-clientes-abrir").innerText()).includes("Quem recebeu nesta semana: 1 de 3"), "lista única recolhida: 'Quem recebeu nesta semana: 1 de 3'");
  await card.getByTestId("envio-clientes-abrir").click();
  const linhas = await card.getByTestId("envio-cliente-linha").allInnerTexts();
  check(linhas.length === 3 && linhas[0].includes("Enviado") && linhas[1].includes("Falhou") && linhas[2].includes("Pulado"), "uma linha por cliente com o último resultado");
  await page.screenshot({ path: `${SHOTS}/wa-reenviar.png` });
  await panel.getByRole("button", { name: /Reenviar só para quem não recebeu/ }).click();
  await panel.getByText("2 cliente(s) entraram na fila").waitFor();
  check(db.rpcCalls.some((c) => c.fn === "wa_envio_reenviar" && c.p_modo === "faltantes") && !db.waDisparos.some((x) => x.cliente_id === A && x.status === "pendente"),
    "reenviar só para quem não recebeu: Aurora (já recebeu) fica de fora");
  await panel.getByRole("button", { name: "Enviar de novo para todos" }).click();
  const conf = page.getByTestId("wa-reenviar-confirma");
  await conf.waitFor();
  check((await conf.innerText()).includes("receber a mensagem outra vez"), "enviar para todos pede confirmação e avisa da duplicidade");
  await conf.getByRole("button", { name: "Cancelar" }).click();
  check(!db.rpcCalls.some((c) => c.fn === "wa_envio_reenviar" && c.p_modo === "todos"), "cancelar não envia nada");
  await panel.getByRole("button", { name: "Enviar de novo para todos" }).click();
  await page.getByTestId("wa-reenviar-confirma").getByRole("button", { name: "Sim, enviar para todos" }).click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(400);
  check(db.rpcCalls.some((c) => c.fn === "wa_envio_reenviar" && c.p_modo === "todos"), "confirmando, pede o reenvio para todos");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

// ---------------------------------------------------------------- T5.25: botão "Reenviar" no cartão (sem trocar o horário)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.waAuto.push(ENVIO);
  const d = (id, cliente_id, status, detalhe = null) => ({ id, envio_id: ENVIO, cliente_id, semana: "2026-11-02", origem: "automatico", status, tentativas: 1, detalhe, enviado_em: status === "enviado" ? t : null, atualizado_em: t });
  db.waDisparos.push(d(1, A, "enviado"), d(2, B, "falhou", "Sem conexão"));
  db.opsEnvioExecucoes.push({ id: 1, envio_id: ENVIO, cliente_id: A, executado_em: new Date().toISOString(), status: "enviado", detalhe: "ok", registrado_por: USER_ID, origem: "whatsapp" });
  await login(page, "/operacoes/envios");
  await page.getByTestId("envio-aprovacao").getByRole("button", { name: "Decidir depois" }).click().catch(() => {});
  const card = page.getByTestId("envio-card").first();
  await card.getByTestId("envio-reenviar-botao").click();
  const m = page.getByTestId("envio-reenvio");
  await m.waitFor();
  check(await m.getByLabel("Reenviar para Loja Aurora").isChecked() === false && await m.getByLabel("Reenviar para Loja Brisa").isChecked() === true && await m.getByLabel("Reenviar para Loja Cais").isChecked() === true,
    "já vêm marcados só os clientes que não receberam (Aurora, que já recebeu, fica desmarcada)");
  check(await m.getByRole("button", { name: "Aprovar e enviar agora" }).isDisabled(), "só envia depois de marcar \"Analisei\"");
  await m.getByLabel("Reenviar para Loja Aurora").check();
  check((await m.innerText()).includes("vão receber a mensagem de novo"), "marcar quem já recebeu avisa que vai duplicar");
  await m.getByLabel("Reenviar para Loja Aurora").uncheck();
  await m.getByLabel("Reenviar para Loja Cais").uncheck();
  await page.screenshot({ path: `${SHOTS}/envios-reenviar-botao.png` });
  await m.getByLabel(/Analisei a mensagem/).check();
  await m.getByRole("button", { name: "Aprovar e enviar agora" }).click();
  await m.getByText("1 cliente(s) entraram na fila").waitFor();
  check(db.rpcCalls.some((c) => c.fn === "ops_envio_reenviar_agora" && c.p_clientes.length === 1 && c.p_clientes[0] === B), "reenvia só para a Brisa, sem trocar o horário do envio");
  check(db.opsEnvioAprovacoes.some((a) => a.envio_id === ENVIO && a.decisao === "aprovado") && db.opsEnvios[0].horario === "10:00", "aprova a semana e o horário do envio continua o mesmo");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

console.log("OK: wa-disparos");
