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
