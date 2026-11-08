/**
 * Teste de navegador — Tracking T5.7: Conversas do WhatsApp na palma da mão (08/11/2026).
 * Admin abre o cliente → "Conversas do WhatsApp": lista, busca, a conversa inteira em ordem, origem (anúncio / orgânico), sugestão da IA,
 * "Marcar venda" (cria o contato e registra a venda no caminho do Meta, também para quem veio sem anúncio) e "Apagar" (só admin).
 * Gestor sem acesso ao cliente e visualizador não leem. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005701";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
function seed(db) {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.waPeople.push(
    { id: 1, client_id: CLI, wa_hash: "a".repeat(64), phone: "5545999998888", push_name: "João Silva", last_at: ago(5), last_direction: "recebida",
      last_preview: "Fechado, vou pagar agora", messages: 3, origin: "anuncio_whatsapp", from_ad: true, ad_id: "120000000001" },
    { id: 2, client_id: CLI, wa_hash: "b".repeat(64), phone: "5511977776666", push_name: "Maria Souza", last_at: ago(600), last_direction: "enviada",
      last_preview: "Segue o orçamento", messages: 2, origin: "desconhecida", from_ad: false, ad_id: null },
  );
  db.waMessages.push(
    { id: 1, person_id: 1, direction: "recebida", at: ago(60), body: "Oi, vi o anúncio" },
    { id: 2, person_id: 1, direction: "enviada", at: ago(30), body: "Olá João! Posso ajudar?" },
    { id: 3, person_id: 1, direction: "recebida", at: ago(5), body: "Fechado, vou pagar agora" },
    { id: 4, person_id: 2, direction: "recebida", at: ago(700), body: "Quanto custa?" },
    { id: 5, person_id: 2, direction: "enviada", at: ago(600), body: "Segue o orçamento" },
  );
  db.waSuggestions.push({ id: "s1", client_id: CLI, wa_hash: "a".repeat(64), contact_id: null, push_name: "João Silva", phone_tail: "8888", day: new Date().toISOString().slice(0, 10),
    reason: "Cliente disse que vai pagar agora.", confidence: "alta", status: "pendente", decided_at: null, expires_at: null, created_at: new Date().toISOString() });
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${CLI}`);
  await page.getByTestId("client-conversations").click();
  await page.getByTestId("wa-conversations").waitFor();
  check(await page.getByTestId("wa-conversation").count() === 2, "lista as 2 conversas");
  const first = await page.getByTestId("wa-conversation").first().innerText();
  check(first.includes("João Silva") && first.includes("Fechado, vou pagar agora") && first.includes("Anúncio") && first.includes("IA sugere venda"),
    "a mais recente vem primeiro, com origem e aviso da IA");
  const second = await page.getByTestId("wa-conversation").nth(1).innerText();
  check(second.includes("Maria Souza") && second.includes("Orgânico") && !second.includes("IA sugere"), "a conversa orgânica sem sugestão");

  // Busca por nome e por telefone
  await page.getByLabel("Buscar por nome ou telefone").fill("maria");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="wa-conversation"]').length === 1);
  await page.getByLabel("Buscar por nome ou telefone").fill("99999-8888");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="wa-conversation"]').length === 1 && document.body.textContent.includes("João Silva"));
  await page.getByLabel("Buscar por nome ou telefone").fill("");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="wa-conversation"]').length === 2);

  // A conversa inteira, em ordem de leitura, com telefone completo, origem e sugestão
  await page.getByTestId("wa-conversation").first().click();
  await page.getByTestId("wa-chat").waitFor();
  check((await page.getByTestId("wa-chat-phone").innerText()).includes("+55 (45) 99999-8888"), "mostra o telefone completo");
  const bodies = await page.getByTestId("wa-messages").locator("p.whitespace-pre-wrap").allInnerTexts();
  check(JSON.stringify(bodies) === JSON.stringify(["Oi, vi o anúncio", "Olá João! Posso ajudar?", "Fechado, vou pagar agora"]), `mensagens em ordem de leitura (${bodies.join(" | ")})`);
  check(await page.getByTestId("wa-msg-enviada").count() === 1 && await page.getByTestId("wa-msg-recebida").count() === 2, "enviadas e recebidas separadas");
  check((await page.getByTestId("wa-chat").innerText()).includes("Anúncio de WhatsApp") && (await page.getByTestId("wa-chat-suggestion").innerText()).includes("vai pagar agora"), "origem e motivo da IA na conversa");

  // Marcar venda (cria o contato e entra no caminho do Meta)
  await page.getByTestId("wa-mark-sale").click();
  const sale = page.getByTestId("mark-sale");
  await sale.waitFor();
  await sale.getByLabel("Valor da venda").fill("297,00");
  await sale.getByRole("button", { name: "Marcar venda" }).click();
  await page.waitForFunction(() => document.body.textContent.includes("Venda registrada"));
  const k = db.contacts.find((c) => c.client_id === CLI && c.wa_hash === "a".repeat(64));
  check(k && k.sales === 1 && db.contactHistory.some((h) => h.contact_id === k.id && h.kind === "venda" && h.value_micros === 297_000_000 && h.currency === "BRL"), "a venda ficou no Contato, com valor e moeda");
  check(db.contactQueue.some((q) => q.contact_id === k.id && q.event_name === "Purchase" && q.value === 297), "e entrou na fila de envio ao Meta");
  check(db.waSuggestions.find((x) => x.id === "s1").status === "confirmada", "a sugestão da IA vira confirmada");
  await page.waitForFunction(() => !document.querySelector('[data-testid="wa-chat-suggestion"]'));

  // Venda em conversa orgânica (sem anúncio) também funciona
  await page.getByTestId("wa-conversation").filter({ hasText: "Maria Souza" }).click();
  await page.getByTestId("wa-mark-sale").click();
  await page.getByTestId("mark-sale").getByLabel("Valor da venda").fill("150");
  await page.getByTestId("mark-sale").getByRole("button", { name: "Marcar venda" }).click();
  await page.waitForFunction(() => document.body.textContent.includes("Venda registrada"));
  check(db.contacts.some((c) => c.client_id === CLI && c.wa_hash === "b".repeat(64) && c.sales === 1), "venda orgânica registrada");

  // Apagar (admin)
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Apagar esta conversa" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="wa-conversation"]').length === 1);
  check(db.waPeople.length === 1 && db.waMessages.every((m) => m.person_id === 1), "apagar tira a conversa e as mensagens");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// Visualizador (sem ser Account Manager) não vê o botão e o banco recusa
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, `/clientes/${CLI}`);
  await page.getByRole("heading", { name: "Loja Atacado" }).waitFor();
  check(await page.getByTestId("client-conversations").count() === 0, "visualizador não vê o botão de conversas");
  await page.goto(page.url().replace(`/clientes/${CLI}`, `/clientes/${CLI}/conversas`));
  await page.getByText(/Sem permissão/).waitFor();
  check(await page.getByTestId("wa-conversation").count() === 0, "e o banco não devolve nenhuma conversa");
  check(errors.every((e) => /403|permiss/i.test(e)) || errors.length === 0, `sem erros inesperados (${errors.join(" | ")})`);
  await browser.close();
}
console.log("conversas-whatsapp: OK");
