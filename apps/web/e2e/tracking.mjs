/**
 * Teste de navegador da Etapa 34.1 — Tracking (tela no CRM + script t.js).
 * Supabase SIMULADO (support.mjs). O script roda num site fictício servido
 * pelo próprio teste; o envio dos eventos é interceptado (nada sai daqui).
 */
import { createHash } from "node:crypto";
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const sha = (t) => createHash("sha256").update(t).digest("hex");

const EXC = "e0000000-0000-4000-8000-000000000001";
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

function seedClients(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
}

// ---------------------------------------------------------------------------
// 1) Tela do CRM (admin): criar container, código de instalação, origens
// ---------------------------------------------------------------------------
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seedClients(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();

  const links = await page.getByRole("navigation").first().getByRole("link").allInnerTexts();
  const labels = links.map((t) => t.trim().split("\n")[0]);
  check(labels.indexOf("Tracking") === labels.indexOf("Alertas") + 1, "menu: Tracking logo depois de Alertas");

  await page.getByRole("link", { name: "Tracking" }).first().click();
  await page.getByRole("heading", { name: "Tracking", level: 1 }).waitFor();
  await page.getByTestId("tracking-empty").waitFor();
  check(true, "sem containers: mensagem explicando o que fazer");

  await page.getByRole("button", { name: "Novo container" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo container de tracking" });
  await dialog.getByLabel("Cliente *").selectOption(EXC);
  await dialog.getByLabel("Nome do site *").fill("Loja Excalibur");
  await dialog.getByLabel("Domínios autorizados *").fill("https://www.Excalibur.com.br/loja\nlocalhost");
  await dialog.getByRole("button", { name: "Criar container" }).click();
  await dialog.getByText("Domínio inválido: localhost").waitFor();
  check(db.trackingContainers.length === 0, "domínio inválido: explica e não grava");

  await dialog.getByLabel("Domínios autorizados *").fill("https://www.Excalibur.com.br/loja\nexcalibur.com.br");
  check(await dialog.getByLabel("Modo teste").isChecked(), "container novo nasce em modo teste");
  await dialog.getByRole("button", { name: "Criar container" }).click();
  const install = page.getByRole("dialog", { name: "Instalar no site — Loja Excalibur" });
  await install.waitFor();
  const saved = db.trackingContainers[0];
  check(JSON.stringify(saved.allowed_domains) === JSON.stringify(["www.excalibur.com.br", "excalibur.com.br"]), "domínios gravados limpos (sem https e caminho)");
  check(saved.client_id === EXC && saved.test_mode === true && saved.consent_mode === "nao_exigir" && !("public_key" in db.rpcCalls.find((c) => c.fn === "tracking_containers.insert")), "a chave pública é gerada pelo banco, não pela tela");
  const blocks = await install.getByTestId("copy-block").allInnerTexts();
  check(blocks[0] === `<script async src="https://web-ivory-three-49.vercel.app/t.js" data-key="${saved.public_key}"></script>`, "código de instalação com a chave pública do container");
  check(blocks.some((b) => b.includes("bf_c={{campaign.id}}&bf_s={{adset.id}}&bf_a={{ad.id}}")), "parâmetros de URL do Meta com os IDs do anúncio");
  check(blocks.some((b) => b.startsWith("{lpurl}?utm_source=google")), "modelo de rastreamento do Google Ads");
  check(!blocks.join(" ").match(/service_role|secret|sb_secret|eyJ/), "nenhum segredo no código de instalação");
  await install.screenshot({ path: `${SHOTS}/tracking-instalar.png` });
  await install.getByLabel("Capturar formulários como Lead automaticamente").check();
  const withForms = (await install.getByTestId("copy-block").allInnerTexts())[0];
  check(withForms.endsWith(' data-forms="lead"></script>'), "opção de capturar formulários entra no código de instalação");
  check((await install.innerText()).includes('bf("track", "Purchase", { value: 199.90, currency: "BRL", transaction_id:'), "exemplo de compra com valor, moeda e nº do pedido");
  await install.getByRole("button", { name: "Fechar", exact: true }).click();

  const card = page.getByTestId("container-card");
  await card.waitFor();
  check((await card.innerText()).includes("Nenhum evento recebido ainda"), "container sem eventos avisa para conferir a instalação");

  // Editar: pausar
  await page.getByRole("button", { name: "Editar Loja Excalibur" }).click();
  const edit = page.getByRole("dialog", { name: "Editar container" });
  check(await edit.getByLabel("Cliente *").isDisabled(), "cliente do container não muda depois de criado");
  await edit.getByLabel("Situação").selectOption("pausado");
  await edit.getByRole("button", { name: "Salvar" }).click();
  await edit.waitFor({ state: "detached" });
  check(db.trackingContainers[0].status === "pausado" && !("client_id" in db.rpcCalls.filter((c) => c.fn === "tracking_containers.update").at(-1)), "edição grava a situação (sem mexer no cliente)");
  await card.getByText("Pausado").waitFor();
  check(true, "card mostra Pausado");

  // Chegam eventos
  const cid = saved.id;
  db.trackingTouchpoints.push(
    { id: 1, container_id: cid, occurred_at: ago(5), channel: "meta", paid: true, evidence: "confirmada", reason: "IDs do anúncio do Meta na URL.", utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "Black Friday", fbclid: "Iw1", gclid: null, ad_campaign_id: "120", landing_url: null },
    { id: 2, container_id: cid, occurred_at: ago(20), channel: "direto", paid: null, evidence: "desconhecida", reason: "Sem parâmetros nem site de origem (acesso direto ou origem perdida).", utm_source: null, utm_medium: null, utm_campaign: null, fbclid: null, gclid: null, ad_campaign_id: null, landing_url: null },
  );
  db.trackingEvents.push(
    { event_id: "e1", container_id: cid, event_name: "PageView", occurred_at: ago(5), page_path: "/", test: true, touchpoint_id: 1, session_id: "s1", visitor_id: "v1" },
    { event_id: "e2", container_id: cid, event_name: "Lead", occurred_at: ago(4), page_path: "/obrigado", test: true, touchpoint_id: null, session_id: "s1", visitor_id: "v1" },
    { event_id: "e3", container_id: cid, event_name: "PageView", occurred_at: ago(20), page_path: "/", test: true, touchpoint_id: 2, session_id: "s2", visitor_id: "v2" },
  );
  await page.reload();
  await page.getByTestId("touchpoint-row").first().waitFor();
  const stats = (await page.getByTestId("tracking-stat").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  check(stats[0] === "Sessões 2" && stats[1] === "Visitantes 2" && stats[2] === "Páginas vistas 2" && stats[3] === "Sessões de anúncio 1" && stats[4] === "Origem desconhecida 1", `resumo do dia (${stats.join(" | ")})`);
  const rows = await page.getByTestId("touchpoint-row").allInnerTexts();
  check(rows[0].includes("Meta Ads") && rows[0].includes("Pago") && rows[0].includes("Confirmada") && rows[0].includes("Black Friday"), "origem Meta confirmada com a campanha");
  check(rows[1].includes("Direto") && rows[1].includes("Não dá para saber") && rows[1].includes("Desconhecida"), "acesso direto aparece como desconhecido (não inventa origem)");
  const evs = await page.getByTestId("event-row").allInnerTexts();
  check(evs.length === 3 && evs[0].includes("Lead") && evs[0].includes("Teste"), "eventos recentes marcados como teste");
  check((await card.innerText()).includes("Último evento recebido"), "card mostra quando chegou o último evento");

  // Testar um link (não grava nada)
  const tester = page.getByLabel("Testar link");
  await tester.getByLabel("URL de destino").fill("https://loja.com.br/?utm_source=facebook&utm_medium=paid_social&bf_c=120&bf_a=121");
  await tester.getByRole("button", { name: "Testar" }).click();
  let result = await page.getByTestId("link-test-result").innerText();
  check(result.includes("Meta Ads") && result.includes("Confirmada") && result.includes("bf_c") === false && result.includes("campaign=120"), "testar link: anúncio do Meta confirmado pelos IDs");
  await tester.getByLabel("URL de destino").fill("https://loja.com.br/?fbclid=abc");
  await tester.getByRole("button", { name: "Testar" }).click();
  result = await page.getByTestId("link-test-result").innerText();
  check(result.includes("Provável") && result.includes("Não dá para saber"), "testar link: fbclid sozinho é só provável");
  await tester.getByLabel("URL de destino").fill("loja.com.br");
  await tester.getByRole("button", { name: "Testar" }).click();
  await tester.getByText("Cole a URL completa").waitFor();
  check(true, "testar link: URL incompleta explica o erro");

  // 34.2: leads, conversões e jornada
  const touchSummary = { channel: "meta", evidence: "confirmada", paid: true, utm_campaign: "Black Friday", ad_campaign_id: "120" };
  db.trackingEvents.push(
    { event_id: "e4", container_id: cid, event_name: "Purchase", occurred_at: ago(3), page_path: "/pedido", test: true, touchpoint_id: null, session_id: "s1", visitor_id: "v1" },
    { event_id: "e5", container_id: cid, event_name: "Purchase", occurred_at: ago(2), page_path: "/pedido", test: true, touchpoint_id: null, session_id: "s1", visitor_id: "v1" },
  );
  db.trackingPurchases.push(
    { id: 1, container_id: cid, occurred_at: ago(3), value_micros: 199_900_000, currency: "BRL", transaction_id: "P-1" },
    { id: 2, container_id: cid, occurred_at: ago(2), value_micros: 50_000_000, currency: "USD", transaction_id: "P-2" },
  );
  db.trackingLeads.push(
    { id: 7, container_id: cid, first_event_name: "Lead", first_converted_at: ago(4), last_converted_at: ago(2), conversions: 3, purchases: 2, test: true, em_hash: sha("ana@x.com"), ph_hash: null, first_touch: touchSummary, last_touch: { ...touchSummary, channel: "google", utm_campaign: null, ad_campaign_id: null } },
    { id: 8, container_id: cid, first_event_name: "Lead", first_converted_at: ago(30), last_converted_at: ago(30), conversions: 1, purchases: 0, test: true, em_hash: null, ph_hash: null, first_touch: null, last_touch: null },
  );
  db.trackingJourneys[7] = [
    { kind: "origem", occurred_at: ago(5), name: null, channel: "meta", paid: true, evidence: "confirmada", reason: "IDs", campaign: "Black Friday", page_path: null, value_micros: null, currency: null, transaction_id: null, visitor_id: "v1", test: false },
    { kind: "evento", occurred_at: ago(4), name: "Lead", channel: null, paid: null, evidence: null, reason: null, campaign: null, page_path: "/obrigado", value_micros: null, currency: null, transaction_id: null, visitor_id: "v1", test: true },
    { kind: "origem", occurred_at: ago(3.5), name: null, channel: "google", paid: true, evidence: "confirmada", reason: "gclid", campaign: null, page_path: null, value_micros: null, currency: null, transaction_id: null, visitor_id: "v9", test: false },
    { kind: "compra", occurred_at: ago(3), name: "Purchase", channel: null, paid: null, evidence: null, reason: null, campaign: null, page_path: null, value_micros: 199_900_000, currency: "BRL", transaction_id: "P-1", visitor_id: "v9", test: true },
  ];
  await page.reload();
  await page.getByTestId("lead-row").first().waitFor();
  const convStats = (await page.getByRole("list", { name: "Conversões do período" }).innerText()).replace(/\s+/g, " ");
  check(/Leads 1 Conversões 3 Compras 2/.test(convStats), `conversões do dia (${convStats})`);
  const revenue = (await page.getByTestId("tracking-revenue").innerText()).replace(/\u00a0/g, " ");
  check(revenue.includes("R$ 199,90") && revenue.includes("US$ 50,00") && !revenue.includes("249"), "receita separada por moeda (BRL e USD nunca somados)");
  const leadRows = await page.getByTestId("lead-row").allInnerTexts();
  check(leadRows[0].includes("E-mail") && leadRows[0].includes("Meta Ads · Confirmada · Black Friday") && leadRows[0].includes("Google Ads") && leadRows[0].includes("2 compras"), "lead com e-mail, primeira origem Meta, última Google e compras");
  check(!(await page.getByTestId("leads").innerText()).includes(sha("ana@x.com").slice(0, 12)), "o hash do e-mail não aparece na tela");
  check(leadRows[1].includes("Anônimo") && leadRows[1].includes("Origem desconhecida"), "lead sem contato nem origem: anônimo e origem desconhecida (não inventa)");
  await page.getByRole("button", { name: "Ver jornada do lead 7" }).click();
  const journey = page.getByRole("dialog", { name: "Jornada do lead" });
  await journey.getByTestId("journey-item").first().waitFor();
  const steps = (await journey.getByTestId("journey-item").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  check(steps.length === 4 && steps[0].includes("Chegou por Meta Ads") && steps[1].includes("Lead em /obrigado") && steps[2].includes("Chegou por Google Ads") && steps[3].includes("Compra de R$ 199,90") && steps[3].includes("pedido P-1"), "jornada em ordem: Meta → Lead → Google → Compra");
  check((await journey.innerText()).includes("Visto em 2 aparelhos"), "jornada mostra que a pessoa usou 2 aparelhos");
  await journey.screenshot({ path: `${SHOTS}/tracking-jornada.png` });
  await journey.getByRole("button", { name: "Fechar", exact: true }).click();

  // 34.5-W: WhatsApp (app comum)
  db.whatsappClicks.push({ id: 1, container_id: cid, code: "K7Q2M9", clicked_at: ago(15), status: "clicado", sales: 0, test: true,
    touch: { channel: "meta", evidence: "confirmada", paid: true, utm_campaign: "Black Friday", ad_campaign_id: "120", reason: "IDs do anúncio do Meta na URL." } });
  await page.reload();
  await page.getByTestId("wa-click-row").first().waitFor();
  check((await page.getByTestId("wa-click-row").first().innerText()).includes("K7Q2M9"), "lista de cliques no WhatsApp com o código");
  const wa = page.getByRole("region", { name: "WhatsApp" });
  await wa.getByLabel("Código da conversa").fill("abc");
  await wa.getByRole("button", { name: "Buscar" }).click();
  await wa.getByText("Código inválido").waitFor();
  check(true, "código inválido: explica o formato");
  await wa.getByLabel("Código da conversa").fill("ref. k7q-2m9");
  await wa.getByRole("button", { name: "Buscar" }).click();
  await wa.getByTestId("wa-lookup").waitFor();
  check((await wa.getByTestId("wa-origin").innerText()).includes("Meta Ads · Confirmada · Black Friday"), "busca pelo código (do jeito que veio na mensagem) mostra a origem");
  await wa.getByLabel("Telefone do cliente (opcional)").fill("(45) 99999-8888");
  await wa.getByLabel("Nome (opcional)").fill("Ana Souza");
  await wa.getByRole("button", { name: "Marcar como Lead" }).click();
  await wa.getByText("Lead registrado.").waitFor();
  const leadCall = db.functionCalls.filter((c) => c.fn === "tracking-whatsapp").at(-1);
  check(leadCall.code === "K7Q2M9" && leadCall.kind === "lead" && leadCall.ud.ph === sha("5545999998888") && leadCall.ud.fn === sha("ana") && leadCall.ud.ln === sha("souza"),
    "Lead marcado com o contato cifrado na tela (padrão do Meta)");
  check(!/99999|Ana|Souza/i.test(JSON.stringify(leadCall)), "telefone e nome legíveis não saem da tela");
  await wa.getByRole("button", { name: "Marcar como Venda" }).click();
  await wa.getByText("Informe o valor da venda").waitFor();
  await wa.getByLabel("Valor da venda").fill("350,00");
  await wa.getByLabel("Nº do pedido (recomendado)").fill("PED-1");
  await wa.getByRole("button", { name: "Marcar como Venda" }).click();
  await wa.getByText("Venda registrada.").waitFor();
  const saleCall = db.functionCalls.filter((c) => c.fn === "tracking-whatsapp").at(-1);
  check(saleCall.kind === "venda" && saleCall.value === 350 && saleCall.currency === "BRL" && saleCall.orderId === "PED-1", "venda com valor, moeda e nº do pedido");
  await wa.getByRole("button", { name: "Marcar como Venda" }).click();
  await wa.getByText("Este nº de pedido já foi registrado").waitFor();
  check(true, "mesmo nº de pedido não conta duas vezes");
  await page.getByTestId("wa-click-row").first().getByText("Venda").waitFor();
  check(true, "lista mostra a conversa como Venda");
  await wa.screenshot({ path: `${SHOTS}/tracking-whatsapp.png` });

  await page.getByRole("button", { name: "Código de instalação: Loja Excalibur" }).click();
  const install3 = page.getByRole("dialog", { name: "Instalar no site — Loja Excalibur" });
  await install3.getByLabel("Código de rastreio no WhatsApp").check();
  check((await install3.getByTestId("copy-block").allInnerTexts())[0].includes('data-wa-code="1"'), "opção do código no WhatsApp entra no código de instalação");
  await install3.getByRole("button", { name: "Fechar", exact: true }).click();

  // 34.3: Meta CAPI
  await page.getByRole("button", { name: "Meta API de Conversões: Loja Excalibur" }).click();
  const meta = page.getByRole("dialog", { name: /Meta — API de Conversões/ });
  check((await meta.getByTestId("capi-status").innerText()).includes("Não configurado"), "Meta CAPI: começa como não configurado");
  await meta.getByLabel("ID do Pixel (conjunto de dados) *").fill("abc");
  await meta.getByRole("button", { name: "Salvar" }).click();
  await meta.getByText("O ID do Pixel tem só números").waitFor();
  check(!db.functionCalls.some((c) => c.fn === "tracking-destinations"), "Pixel inválido: explica e não chama o servidor");
  const TOKEN = "EAA" + "x".repeat(80);
  await meta.getByLabel("ID do Pixel (conjunto de dados) *").fill("123456789012345");
  await meta.getByLabel("Token da API de Conversões *").fill(TOKEN);
  await meta.getByLabel("Enviar eventos ao Meta").check();
  await meta.getByRole("button", { name: "Salvar" }).click();
  await meta.getByText("Salvo. O envio ao Meta está ligado.").waitFor();
  const saveCall = db.functionCalls.filter((c) => c.fn === "tracking-destinations").at(-1);
  check(saveCall.token === TOKEN && saveCall.pixelId === "123456789012345" && saveCall.enabled && saveCall.sendEvents.includes("Purchase") && !saveCall.sendEvents.includes("PageView"),
    "token vai só para o servidor; eventos padrão = conversões (sem Página vista)");
  await meta.getByText("Ligado, sem envio ainda").waitFor();
  check(await meta.getByLabel("Token da API de Conversões *").count() === 0 && (await meta.getByLabel("Token da API de Conversões (salvo)").inputValue()) === "", "depois de salvo, o token não volta para a tela");
  check(!(await page.content()).includes(TOKEN), "o token não aparece em nenhum lugar da página");
  await meta.getByRole("button", { name: "Enviar evento de teste" }).click();
  await meta.getByText("Informe o código de teste do Meta").waitFor();
  check(true, "teste sem código de teste: explica onde pegar o código");
  await meta.getByLabel("Código de teste (opcional)").fill("TEST12345");
  await meta.getByRole("button", { name: "Salvar" }).click();
  await meta.getByText("Ligado (teste)").waitFor();
  await meta.getByRole("button", { name: "Enviar evento de teste" }).click();
  await meta.getByText(/Evento de teste recebido pelo Meta/).waitFor();
  await meta.getByTestId("capi-log").getByText("Teste").waitFor();
  check(true, "evento de teste recebido e registrado nas últimas chamadas");
  db.capiTestResult = { ok: false, message: "Token inválido ou expirado. Gere um novo token no Gerenciador de Eventos e cole no CRM." };
  await meta.getByRole("button", { name: "Enviar evento de teste" }).click();
  await meta.getByRole("alert").getByText(/Token inválido ou expirado/).waitFor();
  check(true, "token recusado pelo Meta: mensagem clara em português");
  await meta.screenshot({ path: `${SHOTS}/tracking-meta-capi.png` });
  await meta.getByRole("button", { name: "Apagar token" }).click();
  await meta.getByText("Token apagado. O envio foi desligado.").waitFor();
  await meta.getByText("Falta o token").waitFor();
  check(true, "apagar token desliga o envio");
  await meta.getByRole("button", { name: "Fechar", exact: true }).last().click();
  check((await card.innerText()).includes("Meta CAPI · Falta o token"), "card do site mostra a situação do Meta");

  // 34.5-W2: WhatsApp pela API oficial
  check((await card.innerText()).includes("WhatsApp API · Não configurado"), "card do site mostra a situação da API oficial do WhatsApp");
  check(await page.getByTestId("wa-conversations").count() === 0, "sem API oficial: lista de conversas não aparece (app comum segue igual)");
  await page.getByRole("button", { name: "WhatsApp API oficial: Loja Excalibur" }).click();
  const waApi = page.getByRole("dialog", { name: /WhatsApp — API oficial/ });
  await waApi.getByLabel("ID do número de telefone *").fill("+55 45 9999");
  await waApi.getByLabel("ID da conta do WhatsApp Business (WABA) *").fill("102290129340398");
  await waApi.getByRole("button", { name: "Salvar" }).click();
  await waApi.getByText("O ID do número de telefone tem só números").waitFor();
  await waApi.getByLabel("ID do número de telefone *").fill("106540352242922");
  await waApi.getByLabel("Registrar as conversas").check();
  await waApi.getByRole("button", { name: "Salvar" }).click();
  await waApi.getByText("Cole o segredo do app do Meta antes de ligar").waitFor();
  check(!db.functionCalls.some((c) => c.fn === "tracking-whatsapp" && String(c.action).startsWith("connection_")), "API oficial: ID inválido ou sem segredo explica e não chama o servidor");
  const APP_SECRET = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  await waApi.getByLabel("Segredo do app *").fill(APP_SECRET);
  await waApi.getByRole("button", { name: "Salvar" }).click();
  await waApi.getByText("Salvo. As mensagens recebidas passam a ser registradas.").waitFor();
  const connCall = db.functionCalls.filter((c) => c.fn === "tracking-whatsapp").at(-1);
  check(connCall.action === "connection_save" && connCall.appSecret === APP_SECRET && connCall.phoneNumberId === "106540352242922" && connCall.enabled, "segredo do app vai só para o servidor");
  await waApi.getByText("Ligado, sem mensagem ainda").waitFor();
  check(!(await page.content()).includes(APP_SECRET) && (await waApi.getByLabel("Segredo do app (salvo)").inputValue()) === "", "depois de salvo, o segredo do app não volta para a tela");
  await waApi.getByRole("button", { name: "Ver endereço do webhook" }).click();
  const hook = await waApi.getByTestId("wa-api-webhook").innerText();
  check(/whatsapp-webhook\?c=[0-9a-f-]{36}/.test(hook) && /Token de verificação\s+\S{10,}/.test(hook), "mostra a URL do webhook e o token de verificação para colar no Meta");
  await waApi.screenshot({ path: `${SHOTS}/tracking-whatsapp-api.png` });
  await waApi.getByRole("button", { name: "Fechar", exact: true }).last().click();
  check((await card.innerText()).includes("WhatsApp API · Ligado, sem mensagem ainda"), "card mostra a API oficial ligada");

  db.whatsappConversations.push(
    { id: 77, container_id: cid, origin: "anuncio_whatsapp", ad_id: "120210000000001", click_code: null, first_message_at: ago(5), last_message_at: ago(2),
      messages: 3, status: "conversa", sales: 0, test: true, touch: { channel: "meta", evidence: "confirmada", utm_campaign: null } },
    { id: 78, container_id: cid, origin: "desconhecida", ad_id: null, click_code: null, first_message_at: ago(9), last_message_at: ago(8),
      messages: 1, status: "conversa", sales: 0, test: true, touch: null });
  await page.reload();
  const convRows = page.getByTestId("wa-conversation-row");
  await convRows.first().waitFor();
  const firstConv = await convRows.first().innerText();
  check(firstConv.includes("Anúncio de WhatsApp") && firstConv.includes("Anúncio 120210000000001 · confirmada") && (await convRows.nth(1).innerText()).includes("Direto no WhatsApp"),
    "conversas da API oficial chegam com a origem (anúncio confirmado / direto, sem inventar)");
  await convRows.first().getByRole("button", { name: /Marcar conversa/ }).click();
  const markForm = page.getByTestId("wa-conversations").getByTestId("wa-mark-form");
  check(await markForm.getByLabel("Telefone do cliente (opcional)").count() === 0, "conversa da API oficial: telefone já vai sozinho (em código), não precisa digitar");
  await markForm.getByRole("button", { name: "Marcar como Lead" }).click();
  await markForm.getByText("Lead registrado.").waitFor();
  const convCall = db.functionCalls.filter((c) => c.fn === "tracking-whatsapp").at(-1);
  check(convCall.conversationId === 77 && convCall.code === undefined && convCall.kind === "lead", "marcação pela conversa (sem código)");
  await markForm.getByLabel("Valor da venda").fill("90,00");
  await markForm.getByLabel("Nº do pedido (recomendado)").fill("P-77");
  await markForm.getByRole("button", { name: "Marcar como Venda" }).click();
  await markForm.getByText("Venda registrada.").waitFor();
  await convRows.first().getByText("Venda").waitFor();
  check(true, "conversa marcada como Venda na lista");
  await page.getByRole("region", { name: "WhatsApp" }).screenshot({ path: `${SHOTS}/tracking-whatsapp-conversas.png` });

  await page.getByRole("button", { name: "WhatsApp API oficial: Loja Excalibur" }).click();
  const waApi2 = page.getByRole("dialog", { name: /WhatsApp — API oficial/ });
  await waApi2.getByRole("button", { name: "Apagar segredos" }).click();
  await waApi2.getByText("Segredos apagados. A conexão foi desligada.").waitFor();
  await waApi2.getByText("Falta o segredo do app").waitFor();
  check(true, "apagar os segredos desliga a conexão");
  await waApi2.getByRole("button", { name: "Fechar", exact: true }).last().click();

  // 34.4: atribuição por campanha e qualidade do tracking
  const bf = { client_id: EXC, channel: "meta", campaign_id: "k1", campaign_label: "Black Friday", match: "id", leads: 2, purchases: 2, confirmed: 4,
    revenue: { BRL: 200_000_000, USD: 50_000_000 }, spend_currency: "BRL", spend_micros: 100_000_000, platform_leads: 5, platform_conversions: 2, platform_value_micros: 300_000_000 };
  const none = { client_id: EXC, channel: null, campaign_id: null, campaign_label: null, match: null, leads: 1, purchases: 0, confirmed: 0, revenue: {},
    spend_currency: null, spend_micros: null, platform_leads: null, platform_conversions: null, platform_value_micros: null };
  db.trackingAttribution = {
    last: [bf,
      { ...none, channel: "meta", campaign_id: "k2", campaign_label: "Remarketing", match: "nome" },
      { ...none, channel: "meta", campaign_label: "Dup" },
      none,
      { ...none, channel: "meta", campaign_id: "k5", campaign_label: "Sem conversão", match: "sem_conversao", leads: 0, spend_currency: "BRL", spend_micros: 50_000_000, platform_leads: 0 }],
    first: [{ ...bf, leads: 1, purchases: 1, revenue: { BRL: 200_000_000 } }, { ...none, channel: "google", purchases: 1, revenue: { USD: 50_000_000 } }, none],
  };
  db.trackingQuality = [{ container_id: cid, sessions: 6, sessions_unknown: 1, paid_sessions: 5, paid_without_campaign_id: 3, leads: 5, leads_without_origin: 1,
    leads_with_contact: 1, purchases: 2, purchases_without_order: 1, purchases_without_lead: 0 }];
  await page.reload();
  const attr = page.getByRole("region", { name: "Atribuição" });
  await attr.getByTestId("attr-campaign-row").first().waitFor();
  const bfRow = (await attr.getByTestId("attr-campaign-row").first().innerText()).replace(/\u00a0/g, " ");
  check(bfRow.includes("Black Friday") && bfRow.includes("ID da campanha") && bfRow.includes("R$ 200,00 + US$ 50,00"), "campanha ligada pelo ID; receita em BRL e USD separadas (nunca somadas)");
  check(/R\$\s?100,00/.test(bfRow) && /R\$\s?50,00/.test(bfRow) && bfRow.includes("2×"), "investimento, custo por lead e ROAS (só na mesma moeda)");
  check(bfRow.split(/\t/).map((c) => c.trim()).includes("5"), "mostra ao lado os leads que a própria plataforma contou");
  const allRows = (await attr.getByTestId("attr-campaign-row").allInnerTexts()).join("\n");
  check(allRows.includes("Pelo nome") && allRows.includes("Não ligada a uma campanha") && allRows.includes("Sem conversão no site") && allRows.includes("Sem origem identificada"),
    "diz como cada linha foi ligada (ID / nome / não ligada / sem conversão / sem origem) — sem inventar");
  const chanRows = await attr.getByTestId("attr-channel-row").allInnerTexts();
  check(chanRows[0].includes("Meta Ads") && chanRows[0].includes("4") && chanRows.some((r) => r.includes("Sem origem identificada")), "resumo por canal");
  await attr.getByRole("button", { name: "Primeiro contato" }).click();
  await attr.getByText("Google Ads — campanha não identificada").waitFor();
  check(page.url().includes("atribuicao=primeiro") && (await attr.getByRole("button", { name: "Primeiro contato" }).getAttribute("aria-pressed")) === "true",
    "troca para primeiro contato (fica no endereço)");
  const q = await page.getByTestId("quality-card").first().innerText();
  check(q.includes("Fraca") && q.includes("3 de 5 visitas de anúncio vieram sem o ID da campanha") && q.includes("bf_c={{campaign.id}}") && q.includes("sem nº do pedido"),
    "qualidade do tracking com os motivos e como corrigir");
  await attr.screenshot({ path: `${SHOTS}/tracking-atribuicao.png` });
  await attr.getByRole("button", { name: "Último contato" }).click();

  await page.getByRole("button", { name: "Código de instalação: Loja Excalibur" }).click();
  const install2 = page.getByRole("dialog", { name: "Instalar no site — Loja Excalibur" });
  await install2.getByLabel("Disparar também o Pixel do Meta no navegador").check();
  check((await install2.getByTestId("copy-block").allInnerTexts())[0].includes('data-pixel="123456789012345"'), "opção de disparar o Pixel no navegador entra no código");
  await install2.getByRole("button", { name: "Fechar", exact: true }).click();

  await page.screenshot({ path: `${SHOTS}/tracking.png`, fullPage: true });
  check(errors.length === 0, `sem erros na página${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

// ---------------------------------------------------------------------------
// 2) Permissões: visualizador vê e não configura; cliente não entra
// ---------------------------------------------------------------------------
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seedClients(db);
  db.trackingContainers.push({ id: "t1", client_id: EXC, name: "Loja", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"], status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: ago(60) });
  await login(page, "/tracking");
  await page.getByRole("heading", { name: "Tracking", level: 1 }).waitFor();
  await page.getByTestId("container-card").waitFor();
  check(await page.getByRole("button", { name: "Novo container" }).count() === 0 && await page.getByRole("button", { name: "Editar Loja" }).count() === 0, "visualizador vê o tracking mas não cria nem edita");
  check(await page.getByRole("button", { name: "Código de instalação: Loja" }).count() === 1, "visualizador pode ver o código de instalação");
  await page.getByRole("button", { name: "Meta API de Conversões: Loja" }).click();
  const metaV = page.getByRole("dialog", { name: /Meta — API de Conversões/ });
  await metaV.getByText("Só administradores e gestores configuram").waitFor();
  check(await metaV.getByLabel(/Token da API/).count() === 0, "visualizador vê a situação do Meta, sem campo de token");
  await metaV.getByRole("button", { name: "Fechar", exact: true }).last().click();
  check(await page.getByRole("button", { name: "WhatsApp API oficial: Loja" }).count() === 0, "visualizador não vê a configuração da API oficial sem conexão");
  db.whatsappClicks.push({ id: 9, container_id: "t1", code: "V9SUAL", clicked_at: ago(5), status: "clicado", sales: 0, test: false, touch: null });
  await page.reload();
  const waV = page.getByRole("region", { name: "WhatsApp" });
  await waV.getByLabel("Código da conversa").fill("V9SUAL");
  await waV.getByRole("button", { name: "Buscar" }).click();
  await waV.getByTestId("wa-lookup").waitFor();
  check(await waV.getByRole("button", { name: "Marcar como Lead" }).count() === 0 && (await waV.getByTestId("wa-origin").innerText()).includes("desconhecida"),
    "visualizador consulta o código (origem desconhecida, sem inventar) mas não marca");
  db.whatsappConnections.push({ id: "00000000-0000-4000-8000-0000000000c1", container_id: "t1", phone_number_id: "100000000000009", waba_id: "100000000000010",
    enabled: true, last_webhook_at: ago(3), last_error_at: null, last_error_message: null });
  db.waSecrets["00000000-0000-4000-8000-0000000000c1"] = { app: "x".repeat(32), verify: "v".repeat(20) };
  db.whatsappConversations.push({ id: 5, container_id: "t1", origin: "anuncio_whatsapp", ad_id: "1", click_code: null, first_message_at: ago(4), last_message_at: ago(3),
    messages: 1, status: "conversa", sales: 0, test: false, touch: null });
  await page.reload();
  await page.getByTestId("wa-conversation-row").first().waitFor();
  check(await page.getByRole("button", { name: /Marcar conversa/ }).count() === 0, "visualizador vê as conversas da API oficial mas não marca");
  await page.getByRole("button", { name: "WhatsApp API oficial: Loja" }).click();
  const waApiV = page.getByRole("dialog", { name: /WhatsApp — API oficial/ });
  await waApiV.getByText("Só administradores e gestores configuram a API oficial").waitFor();
  check((await waApiV.getByTestId("wa-api-status").innerText()).includes("Funcionando") && await waApiV.getByLabel(/Segredo do app/).count() === 0,
    "visualizador vê a situação da API oficial, sem campo de segredo");
  await waApiV.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await browser.close();
}
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "cliente" });
  await login(page, "/tracking");
  await page.waitForTimeout(800);
  check(await page.getByRole("heading", { name: "Tracking", level: 1 }).count() === 0, "perfil cliente não acessa o tracking");
  await browser.close();
}

// ---------------------------------------------------------------------------
// 3) Script t.js num site fictício
// ---------------------------------------------------------------------------
const KEY = "bf_0123456789abcdef01234567";
const SITE = "https://www.site-teste.example";
const ENDPOINT = "https://coletor.teste.example/track";
// O t.js publicado pelo site (dist), servido como se viesse de outro domínio (igual à vida real).
const SCRIPT_URL = "https://cdn.teste.example/t.js";
const SCRIPT = await (await fetch(`${BASE}/t.js`)).text();
// Site sem UTF-8 declarado lê acentos errado: o código do script precisa ser só ASCII (comentários podem ter acento).
check(/^[\x00-\x7F]*$/.test(SCRIPT.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), "código do t.js só com caracteres simples (funciona em site sem UTF-8)");
const html = (extra = "", attrs = "", body = "") => `<!doctype html><html><head><title>Site</title>
<script>window.bf = window.bf || function () { (window.bf.q = window.bf.q || []).push(arguments); }; bf("track", "ViewContent", { produto: "plano" });</script>
<script async src="${SCRIPT_URL}" data-key="${KEY}" data-endpoint="${ENDPOINT}"${attrs}></script>${extra}</head><body><h1>Oi</h1>${body}</body></html>`;

async function site(page, sent, markup) {
  await page.route(`${SITE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: markup }));
  await page.route(SCRIPT_URL, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: SCRIPT }));
  await page.route(`${ENDPOINT}**`, (route) => route.fulfill({ status: 204 }));
  page.on("request", (r) => {
    if (r.url().startsWith(ENDPOINT) && r.method() === "POST") sent.push(JSON.parse(r.postData()));
  });
}
const waitSent = async (page, sent, n) => {
  for (let i = 0; i < 40 && sent.length < n; i++) await page.waitForTimeout(100);
  return sent.length;
};

{
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html());
  await page.goto(`${SITE}/?utm_source=facebook&utm_medium=paid_social&bf_c=120&fbclid=IwTeste&email=ana@x.com`);
  await waitSent(page, sent, 2);
  const pv = sent.find((b) => b.n === "PageView");
  check(pv && pv.k === KEY && /^[A-Za-z0-9_-]{22}$/.test(pv.v) && /^[A-Za-z0-9_-]{20}$/.test(pv.s) && pv.nt === true, "primeira visita: PageView com visitante, sessão e marca de chegada");
  check(pv.u.includes("bf_c=120") && /^[A-Za-z0-9_.:-]{8,80}$/.test(pv.e) && typeof pv.t === "number", "leva a URL com os parâmetros e um event_id único");
  const vc = sent.find((b) => b.n === "ViewContent");
  check(vc && vc.cd?.produto === "plano" && vc.v === pv.v && vc.s === pv.s && !vc.nt, "evento chamado antes do script carregar não se perde (fila)");
  const cookies = await page.context().cookies(SITE);
  const bft = cookies.find((c) => c.name === "_bft");
  check(bft && bft.value === pv.v && bft.domain.replace(/^\./, "") === "site-teste.example", "cookie do próprio site (_bft) no domínio principal");

  // Recarregar: mesmo visitante, mesma sessão, sem nova chegada
  sent.length = 0;
  await page.reload();
  await waitSent(page, sent, 2);
  const pv2 = sent.find((b) => b.n === "PageView");
  check(pv2.v === pv.v && pv2.s === pv.s && !pv2.nt && pv2.e !== pv.e, "recarregar: mesma sessão, sem contar nova origem, novo event_id");

  // Evento pelo site e troca de página sem recarregar
  sent.length = 0;
  await page.evaluate(() => window.bf("track", "Lead", { formulario: "contato" }));
  await page.evaluate(() => history.pushState({}, "", "/obrigado"));
  await waitSent(page, sent, 2);
  check(sent.some((b) => b.n === "Lead" && b.cd.formulario === "contato"), "bf('track', 'Lead') envia o evento");
  check(sent.some((b) => b.n === "PageView" && b.u.endsWith("/obrigado")), "troca de página sem recarregar conta PageView");
  sent.length = 0;
  await page.evaluate(() => window.bf("track", "1 inválido"));
  await page.waitForTimeout(300);
  check(sent.length === 0, "nome de evento inválido é ignorado");

  // Nova campanha na URL = nova sessão com nova origem
  sent.length = 0;
  await page.goto(`${SITE}/?gclid=G123`);
  await waitSent(page, sent, 2);
  const pv3 = sent.find((b) => b.n === "PageView");
  check(pv3.v === pv.v && pv3.s !== pv.s && pv3.nt === true, "chegou de outro anúncio: mesma pessoa, nova sessão e nova origem");
  check(errors.length === 0, `script não gera erro no site${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

{
  // Consentimento exigido: nada sai (nem cookie) antes do aceite
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html("", ' data-consent="aguardar"'));
  await page.goto(`${SITE}/`);
  await page.waitForTimeout(800);
  const before = await page.context().cookies(SITE);
  check(sent.length === 0 && !before.some((c) => c.name === "_bft"), "aguardando consentimento: nenhum envio e nenhum cookie");
  await page.evaluate(() => window.bf("consent", true));
  await waitSent(page, sent, 2);
  check(sent.length === 2 && sent.every((b) => b.c === "concedido") && sent.some((b) => b.n === "PageView"), "depois do aceite: envia o que estava na fila, marcado como consentido");
  check(errors.length === 0, "sem erros com consentimento");
  await browser.close();
}

{
  // Chave inválida: o script não faz nada (e não quebra o site)
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html().replace(KEY, "chave-errada"));
  await page.goto(`${SITE}/`);
  await page.waitForTimeout(800);
  check(sent.length === 0 && errors.length === 0 && (await page.getByRole("heading", { name: "Oi" }).count()) === 1, "chave inválida: nada é enviado e o site funciona normal");
  await browser.close();
}

{
  // 34.2: formulários, WhatsApp, identificação e compra
  const FORM = `
    <form id="orcamento" onsubmit="event.preventDefault()">
      <input name="nome" aria-label="Nome"><input type="email" name="email" aria-label="E-mail"><input type="tel" name="whatsapp" aria-label="WhatsApp">
      <input type="password" name="senha" aria-label="Senha"><button>Enviar</button>
    </form>
    <form id="busca" onsubmit="event.preventDefault()"><input name="q" aria-label="Buscar"><button>Buscar</button></form>
    <a href="https://wa.me/5545999998888?text=oi" target="_blank" onclick="event.preventDefault()">Fale no WhatsApp</a>`;
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html("", ' data-forms="lead"', FORM));
  await page.goto(`${SITE}/`);
  await waitSent(page, sent, 2);
  sent.length = 0;

  await page.getByLabel("Nome").fill("Ana Maria Souza");
  await page.getByLabel("E-mail").fill("  Ana@X.com ");
  await page.getByLabel("WhatsApp").fill("(45) 99999-8888");
  await page.getByLabel("Senha").fill("segredo123");
  await page.getByRole("button", { name: "Enviar" }).click();
  await waitSent(page, sent, 1);
  const lead = sent.find((b) => b.n === "Lead");
  check(lead && lead.cd.formulario === "orcamento", "formulário com e-mail/telefone enviado = Lead (com o nome do formulário)");
  check(lead.ud.em === sha("ana@x.com") && lead.ud.ph === sha("5545999998888") && lead.ud.fn === sha("ana") && lead.ud.ln === sha("souza"),
    "e-mail, telefone e nome cifrados no navegador com a mesma regra do servidor (padrão do Meta)");
  const raw = JSON.stringify(sent);
  check(!/ana@x|99999|souza|segredo/i.test(raw), "nenhum dado legível (nem a senha) sai do navegador");

  sent.length = 0;
  await page.getByLabel("Buscar").fill("planos");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.waitForTimeout(500);
  check(sent.length === 0, "formulário sem e-mail/telefone (busca) não vira Lead");

  await page.getByRole("link", { name: "Fale no WhatsApp" }).click();
  await waitSent(page, sent, 1);
  check(sent.some((b) => b.n === "Contact" && b.cd.canal === "whatsapp" && !b.ud), "clique no WhatsApp = Contato (sem dados pessoais)");

  sent.length = 0;
  await page.evaluate(() => window.bf("identify", { email: "joao@y.com" }));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.bf("track", "Purchase", { value: 199.9, currency: "BRL", transaction_id: "P-1" }));
  await page.evaluate(() => window.bf("track", "ViewContent", { item: "x" }));
  await waitSent(page, sent, 2);
  const buy = sent.find((b) => b.n === "Purchase");
  check(buy && buy.cd.value === 199.9 && buy.cd.currency === "BRL" && buy.cd.transaction_id === "P-1" && buy.ud?.em === sha("joao@y.com"), "compra leva valor, moeda, nº do pedido e a identificação feita antes (em hash)");
  check(!sent.find((b) => b.n === "ViewContent").ud, "identificação só vai junto de conversões");
  check(errors.length === 0, `sem erros no site${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

{
  // Sem data-forms="lead": formulários não são capturados
  const { browser, page } = await launch();
  const sent = [];
  await site(page, sent, html("", "", '<form onsubmit="event.preventDefault()"><input type="email" aria-label="E-mail"><button>Enviar</button></form>'));
  await page.goto(`${SITE}/`);
  await waitSent(page, sent, 2);
  sent.length = 0;
  await page.getByLabel("E-mail").fill("ana@x.com");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForTimeout(500);
  check(sent.length === 0, "captura de formulários só funciona quando ligada");
  await browser.close();
}

{
  // 34.3: cookies do Meta e Pixel no navegador com o MESMO event_id
  const { browser, page, errors } = await launch();
  const sent = [];
  await page.route("https://connect.facebook.net/**", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "/* fbevents fictício */" }));
  await site(page, sent, html("", ' data-pixel="123456789012345"'));
  await page.goto(`${SITE}/?fbclid=IwTesteClique`);
  await waitSent(page, sent, 2);
  const pv = sent.find((b) => b.n === "PageView");
  check(/^fb\.1\.\d{13}\.\d{10}$/.test(pv.fbp) && /^fb\.1\.\d{13}\.IwTesteClique$/.test(pv.fbc), "cria _fbp e _fbc (a partir do fbclid) no formato do Meta");
  const ck = await page.context().cookies(SITE);
  check(ck.find((c) => c.name === "_fbp")?.value === pv.fbp && ck.find((c) => c.name === "_fbc")?.value === pv.fbc, "cookies _fbp/_fbc gravados no próprio site");
  const calls = await page.evaluate(() => (window.fbq?.queue ?? []).map((a) => Array.from(a)));
  const pixelPv = calls.find((c) => c[0] === "track" && c[1] === "PageView");
  check(calls[0][0] === "init" && calls[0][1] === "123456789012345" && pixelPv && pixelPv[3].eventID === pv.e, "Pixel do navegador dispara com o MESMO event_id do servidor (o Meta conta uma vez)");
  await page.evaluate(() => window.bf("track", "Purchase", { value: 10, currency: "BRL", transaction_id: "P-9" }));
  await waitSent(page, sent, 3);
  const buy = sent.find((b) => b.n === "Purchase");
  const pixelBuy = (await page.evaluate(() => window.fbq.queue.map((a) => Array.from(a)))).find((c) => c[1] === "Purchase");
  check(pixelBuy[2].order_id === "P-9" && pixelBuy[2].value === 10 && pixelBuy[3].eventID === buy.e, "compra no Pixel com valor, pedido e o mesmo event_id");
  check(errors.length === 0, "sem erros com o Pixel");
  await browser.close();
}

{
  // Sem data-pixel: nosso script não carrega o Pixel
  const { browser, page } = await launch();
  const sent = [];
  let pixelLoaded = false;
  await page.route("https://connect.facebook.net/**", (route) => { pixelLoaded = true; return route.fulfill({ status: 200, body: "" }); });
  await site(page, sent, html());
  await page.goto(`${SITE}/`);
  await waitSent(page, sent, 2);
  check(!pixelLoaded && (await page.evaluate(() => typeof window.fbq)) === "undefined", "sem a opção, o Pixel não é carregado (evita contar em dobro)");
  await browser.close();
}

{
  // 34.5-W: código de rastreio na mensagem do WhatsApp
  const WA = '<a id="wa" href="https://wa.me/5545999998888?text=Ol%C3%A1!%20Quero%20saber%20mais" onclick="window.__href=this.href; event.preventDefault()">Fale no WhatsApp</a>';
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html("", ' data-wa-code="1"', WA));
  await page.goto(`${SITE}/?utm_source=facebook&bf_c=120`);
  await waitSent(page, sent, 2);
  sent.length = 0;
  await page.getByRole("link", { name: "Fale no WhatsApp" }).click();
  await waitSent(page, sent, 1);
  const contact = sent.find((b) => b.n === "Contact");
  const href = await page.evaluate(() => window.__href);
  const text = new URL(href).searchParams.get("text");
  check(/^[2-9A-HJ-NP-Z]{6}$/.test(contact.cd.ref) && text === `Olá! Quero saber mais (ref. ${contact.cd.ref})`, `mensagem do WhatsApp ganha o código (${text})`);
  check(href.includes("%20(ref.%20") && !href.includes("+"), "espaços como %20 (a mensagem aparece certinha no WhatsApp)");
  await page.getByRole("link", { name: "Fale no WhatsApp" }).click();
  await waitSent(page, sent, 2);
  const text2 = new URL(await page.evaluate(() => window.__href)).searchParams.get("text");
  check((text2.match(/\(ref\./g) ?? []).length === 1 && sent[1].cd.ref !== contact.cd.ref, "clicar de novo troca o código (não acumula dois)");
  check(errors.length === 0, "sem erros com o código no WhatsApp");
  await browser.close();
}
{
  // Sem a opção: link e mensagem ficam como estão
  const WA = '<a href="https://wa.me/5545999998888?text=Oi" onclick="window.__href=this.href; event.preventDefault()">Fale no WhatsApp</a>';
  const { browser, page } = await launch();
  const sent = [];
  await site(page, sent, html("", "", WA));
  await page.goto(`${SITE}/`);
  await waitSent(page, sent, 2);
  sent.length = 0;
  await page.getByRole("link", { name: "Fale no WhatsApp" }).click();
  await waitSent(page, sent, 1);
  check((await page.evaluate(() => window.__href)) === "https://wa.me/5545999998888?text=Oi" && sent[0].n === "Contact" && !("ref" in sent[0].cd), "sem a opção, a mensagem do cliente não muda");
  await browser.close();
}

console.log("\nEtapa 34 (tracking 34.1 a 34.5-W2, com 34.4): todos os testes passaram.");
