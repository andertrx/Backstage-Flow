/**
 * Teste de navegador — Tracking T5.6: Vendas sugeridas pela IA (08/11/2026).
 * Admin configura a IA (chave só no cofre, nunca volta à tela), a lista mostra o que a IA sugeriu, "Houve venda" e "Descartar"
 * guardam a decisão (some em 30 dias), gestor vê mas não configura a IA, visualizador não vê nada. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005601";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const today = new Date().toISOString().slice(0, 10);
const sug = (id, extra = {}) => ({ id, client_id: CLI, contact_id: null, push_name: "João", phone_tail: "8888", day: today, reason: "Cliente enviou o comprovante do PIX.",
  confidence: "alta", status: "pendente", decided_at: null, expires_at: null, created_at: new Date().toISOString(), ...extra });
function seed(db) {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.waSuggestions.push(sug("s1"), sug("s2", { push_name: "Ana", phone_tail: "1234", reason: "Atendente agradeceu a compra.", confidence: "media" }));
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?aba=sugestoes");
  await page.getByTestId("wa-suggestions").waitFor();
  check((await page.getByTestId("tracking-tab-sugestoes").innerText()).includes("(2)"), "a aba mostra quantas sugestões esperam");
  check(await page.getByTestId("wa-suggestion").count() === 2, "lista as 2 sugestões pendentes");
  const txt = await page.getByTestId("wa-suggestions").innerText();
  check(txt.includes("João") && txt.includes("final 8888") && txt.includes("Loja Atacado") && txt.includes("comprovante do PIX") && txt.includes("Confiança alta"),
    "cada sugestão mostra nome, final do número, cliente, motivo e confiança (sem texto da conversa)");

  // IA: chave inválida é recusada; válida liga; a chave nunca volta
  const card = page.getByTestId("wa-ai-card");
  check(await card.getByRole("checkbox", { name: "Ligar a IA" }).isDisabled(), "sem chave, não liga a IA");
  await card.getByLabel(/Chave da Anthropic/).fill("chave-errada");
  await card.getByRole("button", { name: "Salvar chave" }).click();
  await card.getByText(/começa com "sk-ant-"/).waitFor();
  const KEY = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  await card.getByLabel(/Chave da Anthropic/).fill(KEY);
  await card.getByRole("button", { name: "Salvar chave" }).click();
  await card.getByRole("checkbox", { name: "Ligar a IA" }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid="wa-ai-card"] input[aria-label="Ligar a IA"][disabled]'));
  await card.getByRole("checkbox", { name: "Ligar a IA" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="wa-ai-card"]')?.textContent?.includes("Ligada"));
  check(db.waAiSettings.has_key && db.waAiSettings.enabled, "chave salva e IA ligada");
  check(!(await page.content()).includes(KEY) && JSON.stringify(db.waAiSettings).includes(KEY) === false, "a chave nunca aparece na tela nem fica no registro da configuração");

  // Decidir
  await page.getByTestId("wa-suggestion").first().getByRole("button", { name: "Houve venda" }).click();
  await page.getByText("Já decididas (1)").waitFor();
  const s1 = db.waSuggestions.find((x) => x.id === "s1" || x.id === "s2" && x.status !== "pendente");
  check(s1 && s1.status === "confirmada" && s1.expires_at, "'Houve venda' guarda a decisão com prazo de 30 dias");
  check(await page.getByTestId("wa-suggestion").count() === 2, "a decidida passa para a lista de decididas");
  await page.getByTestId("wa-suggestion").filter({ hasText: "Ana" }).getByRole("button", { name: "Descartar" }).click();
  await page.getByText("Já decididas (2)").waitFor();
  check(db.waSuggestions.every((x) => x.status !== "pendente"), "descartar também guarda a decisão");
  await page.getByTestId("wa-suggestions-empty").waitFor();
  await page.getByTestId("wa-suggestion").filter({ hasText: "Ana" }).getByRole("button", { name: "Voltar para pendente" }).click();
  await page.getByText("Para conferir (1)").waitFor();
  check(db.waSuggestions.find((x) => x.push_name === "Ana").expires_at === null, "voltar para pendente tira o prazo");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  await login(page, "/tracking?aba=sugestoes");
  await page.getByTestId("wa-suggestions").waitFor();
  check(await page.getByTestId("wa-suggestion").count() === 2 && await page.getByTestId("wa-ai-card").count() === 0, "gestor vê as sugestões, mas não configura a IA");
  await browser.close();
}
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/tracking?aba=sugestoes");
  await page.getByTestId("wa-suggestions").waitFor();
  check(await page.getByTestId("wa-suggestion").count() === 0 && await page.getByTestId("wa-ai-card").count() === 0, "visualizador não vê sugestões nem a IA");
  await browser.close();
}
console.log("\nVendas sugeridas (T5.6): tudo certo.");
