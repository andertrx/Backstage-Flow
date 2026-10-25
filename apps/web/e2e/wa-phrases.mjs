/**
 * Teste de navegador — Tracking T4.1: frases do WhatsApp, como no Tintim (25/10/2026).
 * Admin cadastra frases (venda e perfil), frase repetida é recusada, testa uma mensagem (valor lido com a moeda;
 * sem valor = não registra; valor padrão), vê as frases reconhecidas, desliga e arquiva.
 * Aviso honesto quando o cliente ainda não tem WhatsApp ligado. Operador não configura. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004701";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
}
const text = async (loc) => (await loc.innerText()).replace(/\s/g, " ");

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/contatos?cliente=${CLI}`);
  await page.getByRole("button", { name: "Frases do WhatsApp" }).click();
  const modal = page.getByTestId("wa-phrases");
  await modal.waitFor();
  await modal.getByText("ainda não tem o WhatsApp ligado").waitFor();
  check(true, "aviso honesto: cliente sem WhatsApp ligado (as frases valem quando ligar)");

  const novo = page.getByTestId("wa-phrase-new");
  await novo.getByLabel("Frase nova").fill("ok");
  check(await novo.getByRole("button", { name: "Adicionar" }).isDisabled(), "frase curta ou sem o que marcar: botão travado");
  await novo.getByLabel("Frase nova").fill("Parabéns pela sua compra");
  await novo.getByLabel("Marca").selectOption({ label: "Etapa: Venda ★" });
  await novo.getByRole("button", { name: "Adicionar" }).click();
  await modal.getByTestId("wa-phrase").first().waitFor();
  await novo.getByLabel("Frase nova").fill("cadastro de lojista");
  await novo.getByLabel("Marca").selectOption({ label: "Perfil: Lojista ★" });
  await novo.getByRole("button", { name: "Adicionar" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=wa-phrase]").length === 2);
  const venda = db.waTriggers.find((t) => t.phrase === "Parabéns pela sua compra");
  const loja = db.waTriggers.find((t) => t.phrase === "cadastro de lojista");
  check(venda?.stage_id === `st-${CLI.slice(-4)}-2` && loja?.profile_id === `pf-${CLI.slice(-4)}-0`, "frases salvas com a etapa Venda e o perfil Lojista");

  await novo.getByLabel("Frase nova").fill("parabéns pela sua compra");
  await novo.getByLabel("Marca").selectOption({ label: "Etapa: Venda ★" });
  await novo.getByRole("button", { name: "Adicionar" }).click();
  await modal.getByText("Já existe uma frase igual").waitFor();
  check(db.waTriggers.length === 2, "frase repetida é recusada");

  // Testar uma mensagem
  const sample = modal.getByLabel("Mensagem de teste");
  await sample.fill("Maria, parabens pela sua compra de R$ 297,50! Seu cadastro de lojista está ativo.");
  let out = await text(page.getByTestId("wa-phrase-test"));
  check(out.includes("Perfil: Lojista") && out.includes("Etapa: Venda de R$ 297,50"), `teste: acha as duas frases e o valor com a moeda (${out})`);
  await sample.fill("Parabéns pela sua compra! Pedido 4455");
  out = await text(page.getByTestId("wa-phrase-test"));
  check(out.includes("sem valor na mensagem"), "número solto não vira valor: avisa que a venda não seria registrada");
  await modal.getByLabel("Valor padrão: Parabéns pela sua compra").fill("150");
  await modal.getByTestId("wa-phrase").filter({ hasText: "Etapa: Venda" }).getByRole("button", { name: "Salvar" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=wa-phrase-test]")?.textContent?.includes("valor padrão"));
  check(venda.default_value === 150, "valor padrão salvo e usado no teste");
  await sample.fill("Bom dia, tudo bem?");
  check((await text(page.getByTestId("wa-phrase-test"))).includes("Nenhuma frase"), "mensagem comum: o CRM não faria nada");

  // Frases reconhecidas (o servidor registra; a tela mostra)
  db.waTriggerLog.push({ id: 1, client_id: CLI, trigger_id: venda.id, contact_id: 301, at: new Date().toISOString(), result: "aplicado", reason: null,
    value_micros: 297500000, currency: "BRL" });
  db.whatsappConnections.push({ id: "00000000-0000-4000-8000-0000000047c1", container_id: "t-cont", client_id: CLI, phone_number_id: "100000000000047",
    waba_id: "100000000000048", enabled: true });
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Frases do WhatsApp" }).click();
  await page.getByTestId("wa-phrase-log-row").first().waitFor();
  const row = await text(page.getByTestId("wa-phrase-log-row").first());
  check(row.includes("Marcado") && row.includes("Parabéns pela sua compra") && row.includes("R$ 297,50") && row.includes("contato #301"), "frase reconhecida aparece com o valor");
  check(await modal.getByText("ainda não tem o WhatsApp ligado").count() === 0, "com o WhatsApp ligado, o aviso some");
  await page.screenshot({ path: `${SHOTS}/frases-whatsapp.png`, fullPage: true });

  await modal.getByLabel("Ligada: cadastro de lojista").click();
  await page.waitForFunction(() => !document.querySelector("[aria-label='Ligada: cadastro de lojista']")?.checked);
  check(loja.enabled === false, "desligar uma frase");
  await sample.fill("cadastro de lojista feito");
  check((await text(page.getByTestId("wa-phrase-test"))).includes("Nenhuma frase"), "frase desligada não vale no teste");
  page.once("dialog", (d) => d.accept());
  await modal.getByRole("button", { name: "Arquivar cadastro de lojista" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=wa-phrase]").length === 1);
  check(Boolean(loja.archived_at) && db.waTriggers.length === 2, "arquivar tira da lista sem apagar");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "operador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: CLI, created_at: "" });
  await login(page, "/contatos");
  await page.getByRole("heading", { name: "Contatos" }).waitFor();
  await page.waitForTimeout(300);
  check(await page.getByRole("button", { name: "Frases do WhatsApp" }).count() === 0, "operador não configura as frases");
  await browser.close();
}

console.log("Frases do WhatsApp (T4.1): tudo certo.");
