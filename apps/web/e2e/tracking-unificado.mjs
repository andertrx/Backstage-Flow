/**
 * Teste de navegador (25/11/2026) — Tracking mais enxuto (pedido do Ander):
 *  - faixa no topo do Painel quando o WhatsApp de um cliente cai (com "Reconectar" para quem configura);
 *  - Contatos e vendas: busca e etapas numa barra só; nome da conversa e "Abrir conversa" (só para quem lê conversas);
 *  - Configurações: os sites abrem dentro da linha do cliente, e o pixel do cliente aparece no cartão do site (sem "desligado" falso).
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000007101";
const OUTRO = "e0000000-0000-4000-8000-000000007102";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const SHOTS = "../../docs/etapa-34-tracking/imagens";

function seed(db) {
  db.clients.push(client(CLI, "Prata e Pérola"), client(OUTRO, "Loja Brisa"));
  const site = (id, cid, dom) => ({ id, client_id: cid, name: dom, public_key: "bf_0123456789abcdef01234567", allowed_domains: [dom],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null, kind: "site" });
  db.trackingContainers.push(site("t-site", CLI, "catalogo.prata.com.br"), { ...site("t-wa", CLI, "WhatsApp (sem site)"), kind: "whatsapp", allowed_domains: [] }, site("t-brisa", OUTRO, "brisa.com.br"));
  // WhatsApp da Prata e Pérola caído há 26 horas; o da Brisa conectado
  const conn = (id, container, cid, state, since) => ({ id, container_id: container, client_id: cid, phone_number_id: "5581998888622", waba_id: null, enabled: true,
    last_webhook_at: ago(30 * 60), last_error_at: null, last_error_message: null, mode: "nao_oficial", display_phone: "5581998888622", verified_name: null,
    has_inbound_key: true, inbound_key_hint: "abcd", instance_name: `inst-${id}`, gateway_state: state, health_since: since, store_messages: true, store_ack_at: ago(9000), ai_suggest: false });
  db.whatsappConnections.push(conn("c0000000-0000-4000-8000-000000007101", "t-wa", CLI, "desconectado", ago(26 * 60)),
    conn("c0000000-0000-4000-8000-000000007102", "t-brisa", OUTRO, "conectado", ago(60)));
  db.waPeople.push({ id: 71, client_id: CLI, wa_hash: "d".repeat(64), phone: "5581977771111", push_name: "Gabriela Miranda", last_at: ago(30), last_direction: "recebida",
    last_preview: "Obrigada!", messages: 2, origin: "anuncio_whatsapp", from_ad: true, ad_id: "1200" });
  db.waMessages.push({ id: 71, person_id: 71, direction: "recebida", at: ago(30), body: "Obrigada!" });
  const stage = `st-${CLI.slice(-4)}-0`; // etapas padrão que o servidor simulado cria para o cliente
  db.contacts.push({ id: 7101, client_id: CLI, origin: "whatsapp", ph_hash: null, wa_hash: "d".repeat(64), em_hash: null, wa_click_id: null, ref_code: null, container_id: "t-wa",
    stage_id: stage, profile_id: null, meta_sent: [], sales: 0, created_at: ago(40), last_change_at: ago(40), archived_at: null },
    { id: 7102, client_id: CLI, origin: "site", ph_hash: "e".repeat(64), wa_hash: null, em_hash: null, wa_click_id: null, ref_code: null, container_id: "t-site",
    stage_id: stage, profile_id: null, meta_sent: [], sales: 0, created_at: ago(50), last_change_at: ago(50), archived_at: null });
}

{
  // Administrador
  const { browser, page, errors } = await launch();
  await page.setViewportSize({ width: 1440, height: 950 });
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking");

  // 1) faixa de WhatsApp caído
  await page.getByTestId("wa-queda-alerta").waitFor();
  const faixa = await page.getByTestId("wa-queda-alerta").innerText();
  check(faixa.includes("WhatsApp de Prata e Pérola sem conexão") && faixa.includes("há 1 dia e 2 h") && !faixa.includes("Loja Brisa"), `faixa: só o cliente caído, com o tempo fora (${faixa.replace(/\n/g, " ")})`);
  await page.screenshot({ path: `${SHOTS}/tracking-faixa-whatsapp-caido.png` });
  await page.getByRole("button", { name: "Reconectar o WhatsApp de Prata e Pérola" }).click();
  await page.getByTestId("wa-qr-modal").waitFor();
  check(true, "“Reconectar” abre o QR Code ali mesmo");
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.getByTestId("tracking-client").selectOption(OUTRO);
  await page.waitForURL(new RegExp(`cliente=${OUTRO}`));
  await page.waitForTimeout(300);
  check(await page.getByTestId("wa-queda-alerta").count() === 0, "com outro cliente escolhido, a faixa some");

  // 2) Contatos e vendas: barra única, nome e "Abrir conversa"
  await page.getByTestId("tracking-client").selectOption(CLI);
  await page.waitForURL(new RegExp(`cliente=${CLI}`));
  await page.getByTestId("tracking-panel-tab-contatos").click();
  await page.getByTestId("contatos-barra").waitFor();
  const barra = page.getByTestId("contatos-barra");
  check(await barra.getByLabel("Código da mensagem ou telefone").count() === 1 && await barra.getByRole("tab", { name: "Todos" }).count() === 1, "busca e etapas na mesma barra");
  await page.getByTestId("contact-name").first().waitFor();
  const linhas = page.getByTestId("contact-row");
  check((await linhas.nth(0).innerText()).includes("Gabriela Miranda") && (await linhas.nth(0).innerText()).includes("Contato #7101"), "o contato do WhatsApp mostra o nome da conversa");
  check(!(await linhas.nth(1).innerText()).includes("Gabriela") && await page.getByTestId("contact-open-conversation").count() === 1, "contato sem conversa: continua “Contato #N”, sem botão de conversa");
  await page.screenshot({ path: `${SHOTS}/tracking-contatos-barra-unica.png` });
  await page.getByTestId("contact-open-conversation").click();
  await page.getByTestId("wa-chat").waitFor();
  check((await page.getByTestId("wa-chat").innerText()).includes("Gabriela Miranda"), "“Abrir conversa” abre a conversa da pessoa");

  // 3) Configurações: sites na linha do cliente; pixel do cliente no cartão
  await page.goto(page.url().split("/").slice(0, 3).join("/") + "/tracking?secao=config");
  await page.getByTestId("cli-site-whatsapp").waitFor();
  check(!(await page.getByTestId("tracking-config").innerText()).includes("Detalhes dos sites de cada cliente") && await page.getByTestId("cliente-detalhe").count() === 0,
    "sem seção separada; com vários clientes, os detalhes começam fechados");
  const linha = page.getByTestId("cli-site-whatsapp-row").filter({ hasText: "Prata e Pérola" });
  await linha.getByTestId("cli-abrir-detalhe").click();
  await linha.getByTestId("cliente-detalhe").getByTestId("container-card").waitFor();
  check(await page.getByTestId("cliente-detalhe").count() === 1 && (await linha.getByTestId("cliente-detalhe").innerText()).includes("catalogo.prata.com.br"), "clicar no cliente abre os sites dele dentro da linha");
  check((await linha.getByTestId("cliente-detalhe").innerText()).includes("Pixel do Meta ·"), "o cartão do site fala em “Pixel do Meta”");
  await page.screenshot({ path: `${SHOTS}/tracking-configuracoes-linha-aberta.png` });
  await linha.getByTestId("cli-abrir-detalhe").click();
  await page.waitForTimeout(200);
  check(await page.getByTestId("cliente-detalhe").count() === 0, "clicar de novo fecha");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
{
  // Visualizador: vê a faixa, mas não reconecta; nos contatos não vê nome nem conversa
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/tracking");
  await page.getByTestId("wa-queda-alerta").waitFor();
  check((await page.getByTestId("wa-queda-alerta").innerText()).includes("Peça a um administrador") && await page.getByRole("button", { name: /Reconectar o WhatsApp/ }).count() === 0,
    "visualizador vê a faixa, sem o botão Reconectar");
  await browser.close();
}
{
  // Celular: faixa e barra cabem na tela
  const { browser, page } = await launch();
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/tracking?cliente=${CLI}&aba=contatos`);
  await page.getByTestId("wa-queda-alerta").waitFor();
  await page.getByTestId("contatos-barra").waitFor();
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  check(largura <= 390, `no celular nada passa da largura da tela (${largura}px)`);
  await page.screenshot({ path: `${SHOTS}/tracking-celular-faixa-e-barra.png` });
  await browser.close();
}
console.log("tracking-unificado: OK");
