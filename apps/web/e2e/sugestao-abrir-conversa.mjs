/**
 * Teste de navegador (22/11/2026) — "Abrir a conversa e marcar a venda" (Vendas sugeridas) abre DE VERDADE a conversa da pessoa.
 * Antes o link só levava à lista de conversas do cliente. Aqui no celular (390 px), com uma sugestão JÁ DECIDIDA e dois contatos com o mesmo final de telefone.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005801";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const today = new Date().toISOString().slice(0, 10);
function seed(db) {
  db.clients.push(client(CLI, "Prata e Pérola"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "pratapherola.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["pratapherola.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.waPeople.push(
    { id: 1, client_id: CLI, wa_hash: "a".repeat(64), phone: "5511999991925", push_name: "Gabriela Souza", last_at: ago(5), last_direction: "recebida",
      last_preview: "Oi, tem desconto?", messages: 1, origin: "desconhecida", from_ad: false, ad_id: null },
    { id: 2, client_id: CLI, wa_hash: "b".repeat(64), phone: "5521988881925", push_name: "Gabriela Miranda", last_at: ago(60), last_direction: "enviada",
      last_preview: "Entrega a caminho", messages: 3, origin: "anuncio_whatsapp", from_ad: true, ad_id: "120000000009" },
    { id: 3, client_id: CLI, wa_hash: "c".repeat(64), phone: "5531977778022", push_name: "Josefa", last_at: ago(120), last_direction: "recebida",
      last_preview: "Já mandei", messages: 1, origin: "desconhecida", from_ad: false, ad_id: null },
  );
  db.waMessages.push(
    { id: 1, person_id: 1, direction: "recebida", at: ago(5), body: "Oi, tem desconto?" },
    { id: 2, person_id: 2, direction: "recebida", at: ago(90), body: "A entrega chegou na portaria, obrigada!" },
    { id: 3, person_id: 2, direction: "enviada", at: ago(60), body: "Entrega a caminho" },
    { id: 4, person_id: 3, direction: "recebida", at: ago(120), body: "Já mandei o comprovante" },
  );
  const sug = (id, nome, tail) => ({ id, client_id: CLI, contact_id: null, push_name: nome, phone_tail: tail, day: today, reason: "Entrega confirmada.",
    confidence: "media", status: "confirmada", decided_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), created_at: new Date().toISOString() });
  db.waSuggestions.push(sug("d1", "Gabriela Miranda", "1925"), sug("d2", "Josefa", "8022"));
  // pendente da Gabriela Souza (pessoa 1): "Marcar a venda" abre a conversa com a janela de marcar venda
  db.waSuggestions.push({ id: "p1", client_id: CLI, wa_hash: "a".repeat(64), contact_id: null, push_name: "Gabriela Souza", phone_tail: "1925", day: today, reason: "Cliente disse que vai pagar.",
    confidence: "alta", status: "pendente", decided_at: null, expires_at: null, created_at: new Date().toISOString() });
}

{
  const { browser, page, errors } = await launch();
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/tracking?cliente=${CLI}&aba=sugestoes`);
  await page.getByTestId("wa-suggestions").waitFor();
  const link = page.getByTestId("wa-suggestion").filter({ hasText: "Gabriela Miranda" }).getByTestId("wa-suggestion-open");
  await link.waitFor();
  check((await link.getAttribute("href")).includes("final=1925") && (await link.getAttribute("href")).includes("nome=Gabriela+Miranda"), "o link leva quem é a pessoa (final do telefone e nome)");
  await link.click();
  await page.waitForURL("**aba=conversas**");
  // abre a conversa CERTA (a Gabriela Miranda, não a Gabriela Souza que tem o mesmo final), com o texto
  await page.getByText("A entrega chegou na portaria, obrigada!").waitFor();
  check(!(await page.getByText("Oi, tem desconto?").first().isVisible()), "não abriu a outra Gabriela (mesmo final de telefone)");
  check(await page.getByTestId("wa-chat-voltar").isVisible(), "no celular: conversa aberta em tela cheia, com Voltar");
  check((await page.getByTestId("wa-from-suggestion").innerText()).includes("Conversa da sugestão da IA aberta"), "avisa que é a conversa da sugestão");
  // Voltar e ver todas
  await page.getByTestId("wa-chat-voltar").click();
  await page.getByRole("button", { name: "Ver todas as conversas" }).click();
  await page.getByTestId("wa-conversation").nth(2).waitFor();
  check(await page.getByTestId("wa-conversation").count() === 3, "'Ver todas as conversas' limpa o filtro");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}
{
  // "Marcar a venda" numa sugestão pendente: abre a conversa JÁ com a janela de marcar venda; marcar confirma a sugestão e manda a Compra ao Meta
  const { browser, page, errors } = await launch();
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/tracking?cliente=${CLI}&aba=sugestoes`);
  await page.getByTestId("wa-suggestions").waitFor();
  check(await page.getByRole("button", { name: "Houve venda" }).count() === 0, "sem o botão enganoso 'Houve venda'");
  await page.getByTestId("wa-suggestion").filter({ hasText: "Gabriela Souza" }).getByTestId("wa-suggestion-mark").click();
  const sale = page.getByTestId("mark-sale");
  await sale.waitFor();
  check(true, "a janela 'Marcar venda' abre sozinha na conversa certa");
  await sale.getByLabel("Valor da venda").fill("150");
  await sale.getByRole("button", { name: "Marcar venda" }).click();
  await page.waitForFunction(() => document.body.textContent.includes("Venda registrada"));
  check(db.waSuggestions.find((x) => x.id === "p1").status === "confirmada", "marcar a venda confirma a sugestão");
  check(db.contactQueue.some((q) => q.event_name === "Purchase" && q.value === 150), "e a Compra entra na fila de envio ao Meta");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}
{
  // "Conferir se a venda foi marcada" (sugestão já confirmada, pessoa sem venda): abre com a marcação; com venda já marcada, NÃO abre (evita compra dobrada)
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.waPeople.find((x) => x.id === 2).conversation_sales = 1;
  db.contacts.push({ id: 900, client_id: CLI, wa_hash: "b".repeat(64), ph_hash: "b".repeat(64), sales: 1, archived_at: null, stage_id: null, profile_id: null });
  await login(page, `/tracking?cliente=${CLI}&aba=sugestoes`);
  await page.getByTestId("wa-suggestions").waitFor();
  await page.getByTestId("wa-suggestion").filter({ hasText: "Gabriela Miranda" }).getByTestId("wa-suggestion-mark-again").click();
  await page.getByText("A entrega chegou na portaria, obrigada!").waitFor();
  check(await page.getByTestId("mark-sale").count() === 0, "pessoa que já tem venda: a marcação NÃO abre sozinha (não duplica a compra)");
  check((await page.getByText("já tinha venda marcada").count()) === 1, "avisa que já tinha venda marcada");
  await browser.close();
}
{
  // 22/11/2026 — sem valor: em vez de bloquear, marca só "Qualificado" e envia apenas o LeadQualificado (sem Compra, sem venda)
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${CLI}/conversas?final=1925&nome=Gabriela+Souza&marcar=1`);
  await page.waitForURL("**aba=conversas**");
  const sale = page.getByTestId("mark-sale");
  await sale.waitFor();
  const botao = sale.getByTestId("mark-sale-submit");
  check((await botao.innerText()).includes("Só qualificar") && await botao.isEnabled(), "sem valor: o botão deixa de bloquear e vira 'Só qualificar (sem venda)'");
  await sale.getByLabel("Valor da venda").fill("150");
  check((await botao.innerText()).includes("Marcar venda"), "com valor: volta a ser 'Marcar venda'");
  await sale.getByLabel("Valor da venda").fill("");
  await botao.click();
  await page.waitForFunction(() => document.body.textContent.includes("Marcado como Qualificado"));
  const k = db.contacts.find((c) => c.client_id === CLI && c.wa_hash === "a".repeat(64));
  check(k && k.sales === 0, "não registrou venda (0 vendas)");
  check(db.contactQueue.some((q) => q.contact_id === k.id && q.event_name === "LeadQualificado"), "o LeadQualificado entrou na fila de envio ao Meta");
  check(!db.contactQueue.some((q) => q.event_name === "Purchase"), "nenhuma Compra foi enviada");
  check(db.waSuggestions.find((x) => x.id === "p1").status === "pendente", "a sugestão da IA continua pendente (venda ainda não marcada)");
  check(db.contactHistory.some((h) => h.contact_id === k.id && h.kind === "etapa" && h.meta_event === "LeadQualificado"), "o histórico do contato mostra o LeadQualificado enviado");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}
{
  // Pessoa que não está mais na lista: avisa, sem quebrar
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/clientes/${CLI}/conversas?final=0000&nome=Ninguem`);
  await page.waitForURL("**aba=conversas**");
  await page.getByTestId("wa-from-suggestion").waitFor();
  await page.getByText("Não achamos essa conversa na lista").waitFor();
  check(true, "conversa que não existe mais: a tela avisa e oferece 'Ver todas'");
  await browser.close();
}
console.log("OK: sugestao-abrir-conversa");
