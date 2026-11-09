/**
 * Teste de navegador — Ficha do cliente com abas (T5.9, 09/11/2026).
 * Dentro de Clientes → o cliente: Resumo, Conversas, Contatos e vendas, Site e origem, WhatsApp, Vendas sugeridas.
 * Cada aba mostra SÓ o cliente aberto (o outro cliente nunca aparece). Marcar venda fica só em Conversas.
 * Quem não tem acesso não vê as abas. Supabase SIMULADO.
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
const tabs = async (page) => (await page.getByTestId("client-tabs").getByRole("button").allInnerTexts()).map((t) => t.trim());

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${A}`);
  await page.getByTestId("client-tabs").waitFor();
  const t = await tabs(page);
  check(["Resumo", "Conversas", "Contatos e vendas", "Site e origem", "WhatsApp", "Vendas sugeridas"].every((x) => t.includes(x)), `abas da ficha (${t.join(", ")})`);
  await page.screenshot({ path: `${SHOTS}/cliente-abas-resumo.png`, fullPage: true });
  check(await page.getByTestId("client-guide").count() === 1 && (await page.getByTestId("client-guide").innerText()).includes("único lugar para marcar venda"), "o Resumo traz o guia de onde fica cada coisa");

  // Conversas
  await page.getByTestId("client-tab-conversas").click();
  await page.getByTestId("wa-conversation").first().waitFor();
  check(await page.getByTestId("wa-conversation").count() === 1 && (await page.getByTestId("wa-conversations").innerText()).includes("João Atacado"), "Conversas: só as deste cliente");
  await page.getByTestId("wa-conversation").first().click();
  await page.getByTestId("wa-chat").waitFor();
  await page.screenshot({ path: `${SHOTS}/cliente-abas-conversas.png`, fullPage: true });

  // Contatos e vendas (cliente fixo, sem escolher outro)
  await page.getByTestId("client-tab-contatos").click();
  await page.getByRole("heading", { name: "Contatos e vendas" }).waitFor();
  check(await page.getByLabel("Cliente", { exact: true }).count() === 0, "Contatos e vendas: cliente fixo, sem seletor de outro cliente");
  check(page.url().includes("aba=contatos"), "a aba fica no endereço");

  // Site e origem: só o site deste cliente
  await page.getByTestId("client-tab-site").click();
  await page.getByTestId("container-card").first().waitFor();
  const siteText = await page.locator("main").innerText();
  check(siteText.includes("atacado.com.br") && !siteText.includes("varejo.com.br"), "Site e origem: só o site deste cliente");
  check(await page.getByTestId("tracking-tab-origens").count() === 1 && await page.getByTestId("tracking-tab-saude").count() === 1 && await page.getByTestId("tracking-tab-whatsapp").count() === 0,
    "Site e origem: partes Sites, Origem e jornada e Saúde (sem WhatsApp aqui)");
  await page.getByTestId("tracking-tab-saude").click();
  check(page.url().includes("aba=site") && page.url().includes("sub=saude"), "a parte escolhida não troca a aba da ficha");

  // WhatsApp: conexão do cliente, e o aviso de que a venda se marca em Conversas
  await page.getByTestId("client-tab-whatsapp").click();
  await page.getByTestId("wa-connections").waitFor();
  const wa = await page.getByTestId("wa-connections").innerText();
  check(wa.includes("atacado.com.br") && !wa.includes("varejo.com.br"), "WhatsApp: só a conexão deste cliente");
  check(await page.getByRole("button", { name: "WhatsApp pelo servidor: atacado.com.br" }).count() === 1, "WhatsApp: botão do servidor do cliente");
  check((await page.getByTestId("wa-mark-moved").innerText()).includes("aba Conversas"), "WhatsApp: avisa que a venda se marca em Conversas");
  check(await page.getByRole("button", { name: /Marcar como Venda|Marcar como Lead/ }).count() === 0, "WhatsApp: não há mais botão de marcar venda aqui");

  // Vendas sugeridas: só as deste cliente
  await page.getByTestId("client-tab-sugestoes").click();
  await page.getByTestId("wa-suggestions").waitFor();
  const sug = await page.getByTestId("wa-suggestions").innerText();
  check(sug.includes("João Atacado") && !sug.includes("Maria Varejo"), "Vendas sugeridas: só as deste cliente");
  check(await page.getByTestId("wa-ai-card").count() === 0, "a chave da IA (do sistema todo) não aparece na ficha do cliente");

  // Endereço antigo das conversas leva para a aba
  await page.goto(page.url().split("?")[0] + "/conversas");
  await page.getByTestId("wa-conversations").waitFor();
  check(page.url().includes("aba=conversas"), "o endereço antigo das conversas leva para a aba Conversas");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// Visualizador: lê o tracking, mas não vê as conversas nem as sugestões da IA
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, `/clientes/${A}`);
  await page.getByRole("heading", { name: "Dados cadastrais" }).waitFor();
  const t = await page.getByTestId("client-tabs").count() ? await tabs(page) : [];
  check(!t.includes("Conversas") && !t.includes("Vendas sugeridas") && t.includes("Site e origem"), `visualizador não vê Conversas nem Vendas sugeridas (só lê o tracking) (${t.join(", ") || "nenhuma aba extra"})`);
  check(errors.length === 0, `sem erros (${errors.join(" | ")})`);
  await browser.close();
}
console.log("cliente-abas: OK");
