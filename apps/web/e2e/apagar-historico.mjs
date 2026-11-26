/**
 * Teste de navegador (26/11/2026) — Tracking → Configurações → "Apagar histórico do cliente" (só administrador).
 * WhatsApp, site ou os dois: mostra quanto será apagado, só apaga com APAGAR, mantém o outro lado, contatos e conversas com venda.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000007301";
const OUTRO = "e0000000-0000-4000-8000-000000007302";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();

function seed(db) {
  db.clients.push(client(CLI, "Prata e Pérola"), client(OUTRO, "Loja Brisa"));
  db.trackingContainers.push({ id: "t1", client_id: CLI, name: "prata.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["prata.com.br"], status: "ativo", test_mode: false,
    consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null, kind: "site" });
  const pessoa = (id, cid) => ({ id, client_id: cid, wa_hash: String(id).repeat(64).slice(0, 64), phone: "558199990000", push_name: "Pessoa " + id, last_at: ago(10), last_direction: "recebida", last_preview: "oi", messages: 1, origin: "desconhecida", from_ad: false, ad_id: null });
  db.waPeople.push(pessoa(1, CLI), pessoa(2, CLI), pessoa(3, OUTRO));
  db.waMessages.push({ id: 1, client_id: CLI, person_id: 1, direction: "recebida", at: ago(10), body: "oi" }, { id: 2, client_id: CLI, person_id: 2, direction: "recebida", at: ago(9), body: "bom dia" }, { id: 3, client_id: OUTRO, person_id: 3, direction: "recebida", at: ago(8), body: "olá" });
  const conv = (id, sales) => ({ id, client_id: CLI, container_id: "t1", origin: "desconhecida", ad_id: null, click_code: null, first_message_at: ago(40), last_message_at: ago(30), messages: 1, status: "conversa", sales, test: false, touch: null });
  db.whatsappConversations.push(conv(1, 0), conv(2, 1));
  db.trackingEvents.push({ event_id: "e1", client_id: CLI, container_id: "t1", event_name: "PageView", occurred_at: ago(30) }, { event_id: "e2", client_id: CLI, container_id: "t1", event_name: "Lead", occurred_at: ago(20) },
    { event_id: "e3", client_id: OUTRO, container_id: "t9", event_name: "PageView", occurred_at: ago(20) });
  db.contacts.push({ id: 1, client_id: CLI, origin: "whatsapp", ph_hash: null, wa_hash: "1".repeat(64), em_hash: null, wa_click_id: null, ref_code: null, container_id: "t1", stage_id: `st-${CLI.slice(-4)}-0`,
    profile_id: null, meta_sent: [], sales: 1, created_at: ago(60), last_change_at: ago(60), archived_at: null });
}
const conta = (db, k, cid) => (db[k] ?? []).filter((x) => x.client_id === cid).length;

{
  const { browser, page, errors } = await launch();
  await page.setViewportSize({ width: 1440, height: 950 });
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?secao=config");
  // sem cliente escolhido: pede para escolher
  await page.getByTestId("historico-escolha-cliente").waitFor();
  check(true, "sem cliente escolhido, pede para escolher (um cliente por vez)");
  await page.getByTestId("tracking-client").selectOption(CLI);
  await page.getByTestId("historico-card").waitFor();

  // 1) só o WhatsApp
  await page.getByTestId("historico-escopo-whatsapp").check();
  await page.getByTestId("historico-contar").click();
  await page.getByTestId("historico-confirmar").waitFor();
  const r1 = await page.getByTestId("historico-resumo").innerText();
  check(r1.includes("2 mensagem(ns)") && r1.includes("2 pessoa(s)") && r1.includes("1 conversa(s) sem venda") && !r1.includes("Site:"), `só WhatsApp: mostra números do WhatsApp e nada do site (${r1.replace(/\n/g, " | ")})`);
  const botao = page.getByTestId("historico-apagar");
  check(await botao.isDisabled(), "sem digitar APAGAR, o botão fica travado");
  await page.getByTestId("historico-palavra").fill("apagar ");
  check(await botao.isDisabled(), "com a palavra errada (minúscula), continua travado");
  await page.screenshot({ path: "../../docs/etapa-34-tracking/imagens/tracking-apagar-historico.png", fullPage: false });
  await page.getByTestId("historico-palavra").fill("APAGAR");
  // 2ª confirmação: "Você tem certeza?" — cancelar não apaga nada
  await botao.click();
  const dlg = page.getByTestId("confirm-dialog");
  await dlg.waitFor();
  const txt = await dlg.innerText();
  check(txt.includes("Você tem certeza?") && txt.includes("histórico do WhatsApp") && txt.includes("Prata e Pérola") && txt.includes("não pode ser desfeito"), "depois de digitar APAGAR ainda pergunta “Você tem certeza?”, dizendo o que e de quem");
  await page.getByTestId("confirm-cancel").click();
  await page.waitForTimeout(300);
  check(conta(db, "waMessages", CLI) === 2 && !db.historicoApagados, "cancelar na pergunta final não apaga nada");
  await botao.click();
  await page.getByTestId("confirm-ok").click();
  await page.getByTestId("historico-feito").waitFor();
  check(conta(db, "waMessages", CLI) === 0 && conta(db, "waPeople", CLI) === 0, "WhatsApp do cliente apagado");
  check(conta(db, "waMessages", OUTRO) === 1 && conta(db, "waPeople", OUTRO) === 1, "outro cliente não foi tocado");
  check(conta(db, "trackingEvents", CLI) === 2 && db.contacts.length === 1, "o site e os contatos continuam");
  check(db.whatsappConversations.length === 1 && db.whatsappConversations[0].sales === 1, "a conversa COM venda ficou");

  // 2) só o site
  await page.getByTestId("historico-escopo-site").check();
  await page.getByTestId("historico-contar").click();
  await page.getByTestId("historico-confirmar").waitFor();
  const r2 = await page.getByTestId("historico-resumo").innerText();
  check(r2.includes("2 evento(s)") && !r2.includes("WhatsApp:"), `só site: mostra números do site e nada do WhatsApp (${r2.replace(/\n/g, " | ")})`);
  await page.getByTestId("historico-palavra").fill("APAGAR");
  await page.getByTestId("historico-apagar").click();
  await page.getByTestId("confirm-ok").click();
  await page.getByTestId("historico-feito").waitFor();
  check(conta(db, "trackingEvents", CLI) === 0 && conta(db, "trackingEvents", OUTRO) === 1, "eventos do site do cliente apagados, do outro não");
  check(db.contacts.length === 1, "o contato marcado continua depois de apagar o site");
  check(db.historicoApagados.map((x) => x.escopo).join(",") === "whatsapp,site", "cada apagamento foi pedido com o escopo certo");

  // 3) nada para apagar
  await page.getByTestId("historico-escopo-ambos").check();
  await page.getByTestId("historico-contar").click();
  await page.getByTestId("historico-confirmar").waitFor();
  check(await page.getByTestId("historico-apagar").count() === 0, "sem nada para apagar, não oferece o botão");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
{
  // só administrador vê
  for (const role of ["gestor", "operador", "visualizador"]) {
    const { browser, page } = await launch();
    const db = await mockSupabase(page, { role });
    seed(db);
    db.access?.push?.({ user_id: "u", client_id: CLI, created_at: "" });
    await login(page, `/tracking?secao=config&cliente=${CLI}`);
    await page.getByTestId("tracking-config").waitFor();
    await page.waitForTimeout(400);
    check(await page.getByTestId("historico-card").count() === 0 && await page.getByTestId("section-cfg-historico").count() === 0, `${role} não vê “Apagar histórico”`);
    await browser.close();
  }
}
console.log("apagar-historico: OK");
