/**
 * Teste de navegador — Tracking com Painel e Configurações (T5.10, 09/11/2026).
 * Painel: Conversas, Contatos e vendas, Site e origem, WhatsApp, Vendas sugeridas (todos os clientes ou um só).
 * Configurações: sites (instalação, Meta, regras), teste de link e chave da IA. A ficha do cliente só guarda
 * Resumo, Tarefas, Histórico e Reuniões, com um atalho para o Tracking do cliente. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const A = "e0000000-0000-4000-8000-000000005901";
const B = "e0000000-0000-4000-8000-000000005902";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const site = (id, cli, name) => ({ id, client_id: cli, name, public_key: `bf_${id}0123456789abcdef0123`.slice(0, 27), allowed_domains: [name], status: "ativo", test_mode: false,
  consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null, clients: { name: cli === A ? "Loja Atacado" : "Loja Varejo" } });
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
function seed(db) {
  db.clients.push(client(A, "Loja Atacado"), client(B, "Loja Varejo"));
  db.trackingContainers.push(site("t-a", A, "atacado.com.br"), site("t-b", B, "varejo.com.br"));
  db.waPeople.push({ id: 1, client_id: A, wa_hash: "a".repeat(64), phone: "5545999998888", push_name: "João Atacado", last_at: ago(5), last_direction: "recebida", last_preview: "Quero fechar", messages: 1, origin: "desconhecida", from_ad: false, ad_id: null });
  db.waMessages.push({ id: 1, person_id: 1, direction: "recebida", at: ago(5), body: "Quero fechar" });
  db.waSuggestions.push(
    { id: "sa", client_id: A, wa_hash: "a".repeat(64), contact_id: null, push_name: "João Atacado", phone_tail: "8888", day: new Date().toISOString().slice(0, 10), reason: "Pediu a chave PIX.", confidence: "alta", status: "pendente", decided_at: null, expires_at: null, created_at: new Date().toISOString() },
    { id: "sb", client_id: B, wa_hash: "b".repeat(64), contact_id: null, push_name: "Maria Varejo", phone_tail: "1234", day: new Date().toISOString().slice(0, 10), reason: "Mandou o comprovante.", confidence: "media", status: "pendente", decided_at: null, expires_at: null, created_at: new Date().toISOString() },
  );
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);

  // Ficha: sem as abas que mudaram de lugar
  await login(page, `/clientes/${A}`);
  await page.getByRole("heading", { name: "Loja Atacado" }).waitFor();
  const fichaTabs = (await page.getByTestId("client-tabs").getByRole("button").allInnerTexts().catch(() => [])).map((t) => t.trim());
  check(!["Conversas", "Contatos e vendas", "Site e origem", "WhatsApp", "Vendas sugeridas"].some((x) => fichaTabs.includes(x)), `a ficha não repete as abas do Tracking (${fichaTabs.join(", ")})`);
  check(await page.locator("main").getByRole("link", { name: "Inteligência de Resultados" }).count() === 0, "a ficha não tem mais o botão Inteligência de Resultados");
  check((await page.getByTestId("client-guide").innerText()).includes("Tracking → Painel"), "o guia da ficha aponta para o Tracking");
  await page.screenshot({ path: `${SHOTS}/tracking-ficha-resumo.png`, fullPage: true });
  await page.getByTestId("client-open-tracking").click();
  await page.getByRole("heading", { name: "Tracking", level: 1 }).waitFor();
  await page.waitForFunction((id) => document.querySelector('[data-testid="tracking-client"]')?.value === id, A);
  check(page.url().includes(`cliente=${A}`), "“Abrir no Tracking” já escolhe o cliente");

  // Endereços antigos levam ao Tracking do cliente
  await page.goto(page.url().split("/tracking")[0] + `/clientes/${A}?aba=whatsapp`);
  await page.getByTestId("wa-status-strip").waitFor();
  check(page.url().includes("/tracking") && page.url().includes("aba=whatsapp"), "?aba=whatsapp da ficha leva ao Painel do Tracking");
  await page.goto(page.url().split("/tracking")[0] + `/clientes/${A}/conversas`);
  await page.getByTestId("wa-conversations").waitFor();
  check(page.url().includes("aba=conversas") && page.url().includes(`cliente=${A}`), "o endereço antigo das conversas leva ao Painel → Conversas do cliente");

  // Painel: abas e "todos os clientes"
  await page.goto(page.url().split("/tracking")[0] + "/tracking");
  await page.getByTestId("tracking-tabs").waitFor();
  const t = (await page.getByTestId("tracking-tabs").getByRole("button").allInnerTexts()).map((x) => x.trim());
  check(["Conversas", "Contatos e vendas", "Site e origem", "WhatsApp"].every((x) => t.includes(x)) && t.some((x) => x.startsWith("Vendas sugeridas")), `abas do Painel (${t.join(", ")})`);
  check(await page.getByTestId("tracking-section-painel").count() === 1 && await page.getByTestId("tracking-section-config").count() === 1, "Painel e Configurações no topo");
  await page.getByTestId("tracking-panel-tab-conversas").click();
  await page.getByTestId("tracking-pick-client").waitFor();
  check(true, "Conversas com “Todos os clientes”: pede para escolher um cliente");
  await page.getByTestId("tracking-panel-tab-contatos").click();
  await page.getByTestId("tracking-pick-client").waitFor();

  // Site e origem
  await page.getByTestId("tracking-panel-tab-site").click();
  await page.getByTestId("tracking-tab-origens").waitFor();
  check(await page.getByTestId("tracking-tab-resumo").count() === 1 && await page.getByTestId("tracking-tab-leads").count() === 1 && await page.getByTestId("tracking-tab-saude").count() === 1 && await page.getByTestId("tracking-tab-whatsapp").count() === 0,
    "Site e origem: Resumo, Origem e jornada, Leads recebidos e Saúde");
  check(await page.getByTestId("container-card").count() === 0, "o Painel não repete os cartões de site (ficam em Configurações)");
  await page.getByTestId("tracking-client").selectOption(A);
  await page.waitForURL(new RegExp(`cliente=${A}`));
  await page.getByTestId("tracking-tab-saude").click();
  await page.getByTestId("readiness-site").first().waitFor();
  const saude = await page.locator("main").innerText();
  check(saude.includes("atacado.com.br") && !saude.includes("varejo.com.br"), "Saúde: só o site do cliente escolhido");
  check(page.url().includes("aba=site") === false && page.url().includes("sub=saude"), "a parte escolhida fica no endereço");
  await page.screenshot({ path: `${SHOTS}/tracking-painel-site.png`, fullPage: true });

  // Conversas e contatos do cliente escolhido
  await page.getByTestId("tracking-panel-tab-conversas").click();
  await page.getByTestId("wa-conversation").first().waitFor();
  check(await page.getByTestId("wa-conversation").count() === 1 && (await page.getByTestId("wa-conversations").innerText()).includes("João Atacado"), "Conversas: só as do cliente escolhido");
  await page.getByTestId("wa-conversation").first().click();
  await page.getByTestId("wa-chat").waitFor();
  await page.screenshot({ path: `${SHOTS}/tracking-painel-conversas.png`, fullPage: true });
  await page.getByTestId("tracking-panel-tab-contatos").click();
  await page.getByRole("heading", { name: "Contatos e vendas" }).waitFor();
  check(await page.getByLabel("Cliente", { exact: true }).count() === 1, "Contatos e vendas: sem segundo seletor de cliente (vale o do topo)");

  // WhatsApp
  await page.getByTestId("tracking-panel-tab-whatsapp").click();
  await page.getByTestId("wa-status-strip").waitFor();
  const wa = await page.getByTestId("wa-status-strip").innerText();
  check(wa.includes("atacado.com.br") && !wa.includes("varejo.com.br"), "WhatsApp (Painel): só a situação do cliente escolhido");
  check(await page.getByRole("button", { name: /WhatsApp pelo servidor|WhatsApp API oficial/ }).count() === 0, "WhatsApp (Painel): sem botões de ligar (ficam em Configurações)");
  check((await page.getByTestId("wa-mark-moved").innerText()).includes("aba Conversas"), "WhatsApp: avisa que a venda se marca em Conversas");
  check(await page.getByRole("button", { name: /Marcar como Venda|Marcar como Lead/ }).count() === 0, "WhatsApp: não há botão de marcar venda aqui");
  check(await page.getByLabel("Código da conversa").count() === 0, "WhatsApp: sem o antigo campo de código da conversa");
  await page.getByTestId("wa-go-config").click();
  await page.getByTestId("wa-connections").waitFor();
  check(page.url().includes("secao=config"), "o link leva às Configurações → WhatsApp");
  const wc = await page.getByTestId("wa-connections").innerText();
  check(wc.includes("atacado.com.br") && !wc.includes("varejo.com.br"), "Configurações → WhatsApp: só a conexão do cliente escolhido");
  check(wc.replace(/\s+/g, " ").includes("Loja Atacado · atacado.com.br"), "Configurações → WhatsApp: o nome da empresa (cliente) vem na frente do nome do site");
  check(await page.getByRole("button", { name: "WhatsApp pelo servidor: atacado.com.br" }).count() === 1, "Configurações → WhatsApp: botão do servidor");
  check(await page.getByTestId("section-index").count() === 1, "Configurações tem o índice de seções");
  await page.getByTestId("tracking-section-painel").click();

  // Vendas sugeridas
  await page.getByTestId("tracking-panel-tab-sugestoes").click();
  await page.getByTestId("wa-suggestions").waitFor();
  const sug = await page.getByTestId("wa-suggestions").innerText();
  check(sug.includes("João Atacado") && !sug.includes("Maria Varejo"), "Vendas sugeridas: só as do cliente escolhido");
  check(await page.getByTestId("wa-ai-card").count() === 0, "a chave da IA não fica no Painel");

  // Configurações
  await page.getByTestId("tracking-section-config").click();
  await page.getByTestId("tracking-config").waitFor();
  await page.getByTestId("container-card").first().waitFor();
  const cfg = await page.getByTestId("tracking-config").innerText();
  check(cfg.includes("atacado.com.br") && !cfg.includes("varejo.com.br"), "Configurações: sites do cliente escolhido");
  check(await page.getByRole("button", { name: "Código de instalação: atacado.com.br" }).count() + await page.getByRole("button", { name: /Código de instalação/ }).count() >= 1, "Configurações: código de instalação");
  check(await page.getByRole("button", { name: "Novo site" }).count() === 1 && await page.getByTestId("wa-ai-card").count() === 1, "Configurações: Novo site e chave da IA (administrador)");
  await page.screenshot({ path: `${SHOTS}/tracking-configuracoes.png`, fullPage: true });

  // O botão Inteligência de Resultados não fica mais dentro do Tracking (a tela tem o seu item no menu)
  check(await page.getByTestId("tracking-results-link").count() === 0 && await page.locator("main").getByRole("link", { name: "Inteligência de Resultados" }).count() === 0, "Tracking não tem o botão Inteligência de Resultados");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

{
  // Visualizador: vê o Painel (site, WhatsApp), sem Conversas; Configurações só para consulta
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/tracking");
  await page.getByTestId("tracking-tabs").waitFor();
  const t = (await page.getByTestId("tracking-tabs").getByRole("button").allInnerTexts()).map((x) => x.trim());
  check(!t.includes("Conversas") && t.includes("Site e origem"), `visualizador não vê Conversas (${t.join(", ")})`);
  await page.getByTestId("tracking-section-config").click();
  await page.getByTestId("container-card").first().waitFor();
  check(await page.getByRole("button", { name: "Novo site" }).count() === 0 && await page.getByTestId("wa-ai-card").count() === 0, "visualizador não cria site nem vê a chave da IA");
  await browser.close();
}
console.log("tracking-painel: OK");
