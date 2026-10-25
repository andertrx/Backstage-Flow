/**
 * Teste de navegador — Tracking T3.2: vendas pelo webhook do sistema de vendas (25/10/2026).
 * Admin cria o endereço (chave aparece uma vez), recebe o 1º aviso de teste (só os nomes dos campos),
 * usa a sugestão do mapeamento, salva, desliga o modo teste, vê o registro dos avisos, troca a chave e arquiva.
 * Operador e visualizador não configuram. Supabase SIMULADO (support.mjs).
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004601";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
}

{
  const { browser, page, errors } = await launch();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.contacts.push({ id: 301, client_id: CLI, origin: "sistema", ph_hash: "a".repeat(64), em_hash: null, wa_click_id: null, ref_code: null, container_id: "t-cont",
    stage_id: `st-${CLI.slice(-4)}-2`, profile_id: null, meta_sent: [], sales: 1, created_at: "2026-10-25T10:00:00Z", last_change_at: "2026-10-25T10:00:00Z", archived_at: null });
  await login(page, `/contatos?cliente=${CLI}`);
  await page.getByTestId("contact-row").first().waitFor();
  check((await page.getByTestId("contact-row").first().innerText()).includes("Sistema de vendas"), "contato criado pela venda aparece com a origem Sistema de vendas");

  await page.getByRole("button", { name: "Sistemas de venda" }).click();
  const modal = page.getByTestId("sales-systems");
  await modal.waitFor();
  await modal.getByText("Nenhum sistema de venda").waitFor();
  check(await modal.getByRole("button", { name: "Criar endereço" }).isDisabled(), "sem nome, o botão criar fica travado");
  await modal.getByLabel("Nome do sistema").fill("Loja virtual");
  await modal.getByRole("button", { name: "Criar endereço" }).click();
  await page.getByTestId("sales-key").waitFor();
  const w = db.salesWebhooks[0];
  const keyText = await page.getByTestId("sales-key").innerText();
  check(w && w.test_mode && w.enabled && keyText.includes(w.key) && /^[0-9a-f]{48}$/.test(w.key), "endereço novo em modo teste, com a chave mostrada uma vez");
  const urlText = await modal.getByTestId("sales-webhook").innerText();
  check(urlText.includes(`/functions/v1/sales-webhook?w=${w.id}`) && urlText.includes(`&k=${w.key}`), "mostra o endereço (e a versão com a chave no endereço)");
  await modal.getByRole("button", { name: "Copiar: Chave (cabeçalho x-webhook-key)" }).click();
  check((await page.evaluate(() => navigator.clipboard.readText())) === w.key, "botão copia a chave");
  check(await modal.getByRole("button", { name: "Salvar mapeamento" }).isDisabled(), "sem nº do pedido e valor, não salva o mapeamento");

  // Fecha e abre de novo: a chave não aparece mais (a tela nunca recebe a chave do banco)
  await page.getByRole("button", { name: "Fechar janela" }).click();
  // Servidor recebeu o 1º aviso (modo teste): guarda só os nomes dos campos
  Object.assign(w, { last_keys: ["id", "order_number", "total_price", "currency", "financial_status", "customer.phone", "customer.email", "line_items.0.price"],
    last_received_at: new Date().toISOString(), last_result: "teste" });
  db.salesLog.push({ id: 1, webhook_id: w.id, client_id: CLI, received_at: new Date().toISOString(), result: "teste", reason: "Modo teste: conferido e não registrado.",
    order_id: "1050", value_micros: 297500000, currency: "BRL", contact_found: null });
  await page.getByRole("button", { name: "Sistemas de venda" }).click();
  await modal.waitFor();
  check(await page.getByTestId("sales-key").count() === 0 && (await modal.innerText()).includes(`••••${w.key_hint}`), "reaberto: a chave não aparece mais, só o final dela");
  const log = (await page.getByTestId("sales-log-row").first().innerText()).replace(/\s/g, " ");
  check(log.includes("Teste") && log.includes("pedido 1050") && log.includes("R$ 297,50"), "registro dos avisos mostra o teste com pedido e valor");

  await modal.getByRole("button", { name: "Sugerir pelos campos recebidos" }).click();
  check(await modal.getByLabel("Nº do pedido").inputValue() === "order_number" && await modal.getByLabel("Valor", { exact: true }).inputValue() === "total_price"
    && await modal.getByLabel("Telefone do comprador").inputValue() === "customer.phone", "sugestão do mapeamento pelos nomes dos campos");
  await modal.getByLabel("Status que contam como venda").fill("paid, aprovado");
  await modal.getByRole("button", { name: "Salvar mapeamento" }).click();
  await modal.getByText("Mapeamento salvo.").waitFor();
  check(w.mapping.order === "order_number" && w.mapping.value === "total_price" && w.mapping.email === "customer.email"
    && w.mapping.status === "financial_status" && w.mapping.status_values.join() === "paid,aprovado" && w.mapping.default_currency === "BRL", "mapeamento salvo no banco");
  await page.screenshot({ path: `${SHOTS}/vendas-webhook.png`, fullPage: true });

  await modal.getByLabel("Modo teste").click();
  await page.waitForFunction(() => document.body.innerText.includes("Registrando vendas"));
  check(w.test_mode === false, "desligar o modo teste passa a registrar as vendas");

  const oldKey = w.key;
  page.once("dialog", (d) => d.accept());
  await modal.getByRole("button", { name: "Gerar nova chave" }).click();
  await page.getByTestId("sales-key").waitFor();
  check(w.key !== oldKey && (await page.getByTestId("sales-key").innerText()).includes(w.key), "nova chave aparece uma vez e a antiga é trocada");

  page.once("dialog", (d) => d.accept());
  await modal.getByRole("button", { name: "Arquivar" }).click();
  await modal.getByText("Nenhum sistema de venda").waitFor();
  check(Boolean(w.archived_at) && db.salesWebhooks.length === 1, "arquivar tira da lista sem apagar");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

for (const role of ["operador", "visualizador"]) {
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: CLI, created_at: "" });
  await login(page, "/contatos");
  await page.getByRole("heading", { name: "Contatos" }).waitFor();
  await page.waitForTimeout(300);
  check(await page.getByRole("button", { name: "Sistemas de venda" }).count() === 0, `${role} não configura sistemas de venda`);
  await browser.close();
}

console.log("Vendas pelo webhook (T3.2): tudo certo.");
