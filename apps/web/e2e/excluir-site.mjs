/**
 * Teste de navegador — T5.35: organizar o Tracking e excluir um site só.
 * A lista por cliente separa site e WhatsApp, e o WhatsApp separa servidor próprio de API oficial.
 * Excluir site: pede o nome, tira o site da lista, guarda o histórico e deixa restaurar.
 * Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005901";
const CLI2 = "e0000000-0000-4000-8000-000000005902";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const site = (id, cli, name, kind = "site") => ({ id, client_id: cli, name, public_key: `bf_${id}0123456789abcdef0123`.slice(0, 27), allowed_domains: kind === "site" ? [name] : [], status: "ativo", test_mode: false,
  consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null, kind, clients: { name: cli === CLI ? "Loja Aurora" : "Loja Brisa" } });

function seed(db) {
  db.clients.push(client(CLI, "Loja Aurora"), client(CLI2, "Loja Brisa"));
  db.trackingContainers.push(site("t-a", CLI, "aurora.com.br"), site("t-a2", CLI, "loja.aurora.com.br"), site("t-b", CLI2, "brisa.com.br"));
  // Cliente com as duas conexões: servidor próprio e API oficial
  db.trackingContainers.push(site("t-c-wa", CLI2, "WhatsApp (sem site)", "whatsapp"));
  db.whatsappConnections.push(
    { id: "c-server", container_id: "t-c-wa", client_id: CLI2, phone_number_id: "5545999998888", waba_id: null, enabled: true, last_webhook_at: new Date().toISOString(),
      last_error_at: null, last_error_message: null, mode: "nao_oficial", display_phone: "5545999998888", verified_name: null, store_messages: true, store_ack_at: new Date().toISOString(), ai_suggest: true },
    { id: "c-oficial", container_id: "t-b", client_id: CLI2, phone_number_id: "109876543210", waba_id: "123456789012", enabled: true, last_webhook_at: new Date().toISOString(),
      last_error_at: null, last_error_message: null, mode: "coexistencia", display_phone: null, verified_name: "Loja Brisa" },
  );
}

{
  // Lista por cliente: site separado, WhatsApp separado por tipo
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?secao=config");
  await page.getByTestId("cli-site-whatsapp").waitFor();
  const linhaBrisa = page.getByTestId("cli-site-whatsapp-row").filter({ hasText: "Loja Brisa" });
  const txt = await linhaBrisa.innerText();
  check(txt.includes("Servidor próprio") && txt.includes("API oficial"), "cada cliente mostra os dois tipos de WhatsApp separados");
  check(txt.includes("brisa.com.br"), "o site do cliente aparece na coluna de site");
  const aurora = page.getByTestId("cli-site-whatsapp-row").filter({ hasText: "Loja Aurora" });
  check((await aurora.innerText()).includes("aurora.com.br") && (await aurora.innerText()).includes("loja.aurora.com.br"), "dois sites do mesmo cliente aparecem um por um");
  check((await aurora.innerText()).includes("não ligado"), "quem não tem WhatsApp mostra “não ligado” nos dois tipos");

  // Blocos por tipo nos detalhes do cliente
  const detalhesBrisa = page.getByTestId("cliente-detalhe").filter({ hasText: "Loja Brisa" });
  await detalhesBrisa.locator("summary").click();
  await detalhesBrisa.getByTestId("wa-bloco-servidor").waitFor();
  check((await detalhesBrisa.getByTestId("wa-bloco-servidor").innerText()).includes("Loja Brisa · Só WhatsApp"), "bloco do servidor próprio mostra a conexão do servidor");
  check((await detalhesBrisa.getByTestId("wa-bloco-oficial").innerText()).includes("Loja Brisa · brisa.com.br"), "bloco da API oficial mostra a conta oficial");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

{
  // Excluir site: pede o nome, some da lista, guarda o histórico e deixa restaurar
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?secao=config");
  await page.getByTestId("cli-site-whatsapp").waitFor();
  const detalhesBrisa = page.getByTestId("cliente-detalhe").filter({ hasText: "Loja Brisa" });
  await detalhesBrisa.locator("summary").click();
  await detalhesBrisa.getByRole("button", { name: "Excluir site: brisa.com.br" }).click();
  const modal = page.getByRole("dialog").last();
  await modal.waitFor();
  const confirmar = modal.getByTestId("container-exclude-confirm");
  check(await confirmar.isDisabled(), "sem digitar o nome, o botão fica travado");
  await modal.getByTestId("container-exclude-name").fill("outro nome");
  check(await confirmar.isDisabled(), "com o nome errado, o botão continua travado");
  await modal.getByTestId("container-exclude-name").fill("brisa.com.br");
  check(await confirmar.isEnabled(), "com o nome certo, o botão libera");
  await confirmar.click();
  await page.waitForTimeout(500);

  const site = db.trackingContainers.find((c) => c.id === "t-b");
  check(site && site.excluded_at && site.status === "pausado", "excluir marca o site e pausa o script (a Edge Function só aceita container ativo)");
  check(!(await page.getByTestId("cli-site-whatsapp").innerText()).includes("brisa.com.br"), "o site excluído sai da lista");
  check(await page.getByTestId("excluded-sites").count() === 1, "o site excluído aparece em “Sites excluídos”");
  check((await page.getByTestId("excluded-site-row").innerText()).includes("brisa.com.br"), "a lista de excluídos mostra o site");

  // restaurar
  await page.getByRole("button", { name: "Restaurar site: brisa.com.br" }).click();
  await page.waitForTimeout(500);
  const voltou = db.trackingContainers.find((c) => c.id === "t-b");
  check(voltou && !voltou.excluded_at && voltou.status === "ativo", "restaurar devolve o site e reativa o script");
  check(await page.getByTestId("excluded-sites").count() === 0, "restaurar tira o site da lista de excluídos");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

{
  // Quem não administra não exclui site
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "operador" });
  seed(db);
  await login(page, "/tracking?secao=config");
  await page.getByRole("heading", { name: "Detalhes de cada cliente" }).waitFor();
  check(await page.getByRole("button", { name: /Excluir site:/ }).count() === 0, "operador não exclui site");
  check(await page.getByTestId("excluded-sites").count() === 0, "operador não vê a lista de sites excluídos");
  await browser.close();
}

console.log("excluir-site: OK");
