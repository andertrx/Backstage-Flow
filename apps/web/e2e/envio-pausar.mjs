/**
 * Teste de navegador (24/11/2026) — botão "Pausar envio" nos Envios semanais (o Ander se arrependeu de um envio e precisou cortar a operação).
 * Pausar = o envio fica pausado + o que ainda estava na fila é cortado (vira "pulado"); o que já foi enviado fica. Retomar não recoloca ninguém na fila.
 * Supabase SIMULADO; nenhuma mensagem real é enviada.
 */
import { check, launch, login, mockSupabase, USER_ID } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const A = "a4300000-0000-4000-8000-0000000000a4";
const B = "b4300000-0000-4000-8000-0000000000b4";
const C = "c4300000-0000-4000-8000-0000000000c4";
const ENVIO = "e4300000-0000-4000-8000-0000000000e4";
const SEG_0830 = "2026-11-02T11:30:00Z";
const t = "2026-10-27T12:00:00Z";
function seed(db) {
  db.clients.push(client(A, "Loja Aurora"), client(B, "Loja Brisa"), client(C, "Loja Cais"));
  db.opsEnvios.push({ id: ENVIO, nome: "Feedback semanal", mensagem: "Bom dia! Como foi a semana?", dia_semana: 1, horario: "10:00", ativo: true,
    arquivado_em: null, versao: 1, criado_por: USER_ID, atualizado_por: USER_ID, created_at: t, updated_at: t });
  for (const [id, g] of [[A, "Aurora"], [B, "Brisa"], [C, "Cais"]]) {
    db.opsEnvioClientes.push({ id: crypto.randomUUID(), envio_id: ENVIO, cliente_id: id, nome_grupo: g, contatos_marcar: [], ativo: true, observacao: null, removido_em: null, created_at: t, updated_at: t });
  }
  Object.assign(db.waGw, { base_url: "https://whats.exemplo.com.br", has_key: true, risk_accepted_at: t, enabled: true, connection_state: "conectado" });
  db.envioAgora = SEG_0830;
  db.waAuto.push(ENVIO);
  db.opsEnvioAprovacoes.push({ id: 1, envio_id: ENVIO, semana: "2026-11-02", decisao: "aprovado", versao_envio: 1, decidido_por: USER_ID, decidido_em: SEG_0830, origem: "manual" });
  const d = (id, cliente_id, status) => ({ id, envio_id: ENVIO, cliente_id, semana: "2026-11-02", origem: "automatico", status, tentativas: 0, detalhe: null, enviado_em: status === "enviado" ? SEG_0830 : null, atualizado_em: t });
  db.waDisparos.push(d(1, A, "enviado"), d(2, B, "pendente"), d(3, C, "pendente"));
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/operacoes/envios");
  const card = page.getByTestId("envio-card").first();
  const botao = card.getByTestId("envio-pausar");
  await botao.waitFor();
  check((await botao.innerText()).includes("Pausar envio"), "o cartão do envio ativo tem o botão 'Pausar envio'");

  // cancelar a confirmação não muda nada
  await botao.click();
  const dlg = page.getByTestId("confirm-dialog");
  await dlg.waitFor();
  check((await dlg.innerText()).includes("O que já foi enviado não volta") && (await dlg.innerText()).includes("cortado"), "pede confirmação e avisa o que acontece (o enviado não volta)");
  await page.getByTestId("confirm-cancel").click();
  check(db.opsEnvios[0].ativo === true && db.waDisparos.filter((x) => x.status === "pendente").length === 2, "cancelar não mexe em nada");

  // pausar: corta a fila e deixa o envio pausado
  await botao.click();
  await page.getByTestId("confirm-ok").click();
  await page.getByText("Envio pausado. 2 mensagem(ns) cortada(s) da fila").waitFor();
  check(db.opsEnvios[0].ativo === false, "o envio ficou pausado");
  check(db.waDisparos.filter((x) => x.status === "pendente").length === 0 && db.waDisparos.filter((x) => x.status === "pulado").length === 2, "o que estava na fila foi cortado (pulado), nada apagado");
  check(db.waDisparos.length === 3 && db.waDisparos.find((x) => x.id === 1).status === "enviado", "quem já recebeu continua como enviado");
  check((await card.innerText()).includes("Pausado"), "o cartão mostra 'Pausado'");
  check((await botao.innerText()).includes("Retomar envio"), "o botão vira 'Retomar envio'");

  // retomar: reabre o envio, mas NÃO recoloca ninguém na fila
  await botao.click();
  await page.getByText("Envio retomado").waitFor();
  check(db.opsEnvios[0].ativo === true, "retomar reabre o envio");
  check(db.waDisparos.filter((x) => x.status === "pendente").length === 0, "retomar NÃO recoloca ninguém na fila (quem foi cortado não volta sozinho)");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}
{
  // quem não tem permissão de Envios não vê o botão
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/");
  await page.goto("http://localhost:4173/operacoes/envios");
  await page.waitForTimeout(800);
  check(await page.getByTestId("envio-pausar").count() === 0, "visualizador não vê o botão de pausar");
  await browser.close();
}
console.log("OK: envio-pausar");
