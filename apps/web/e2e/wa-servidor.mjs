/**
 * Teste de navegador — Tracking T5.3: WhatsApp do cliente pelo servidor não oficial (08/11/2026).
 * Admin cria a conexão (desligada, com chave mostrada uma vez), vê o endereço do webhook, liga, e a situação muda quando chega mensagem.
 * Site com WhatsApp oficial não deixa usar o servidor. Operador e visualizador não configuram. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005301";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db, official = false) {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  if (official) db.whatsappConnections.push({ id: "c-oficial", container_id: "t-cont", client_id: CLI, phone_number_id: "109876543210", waba_id: "123456789012", enabled: true,
    last_webhook_at: null, last_error_at: null, last_error_message: null, mode: "manual", display_phone: null, verified_name: null });
}

{
  const { browser, page, errors } = await launch();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?secao=config");
  await page.getByRole("button", { name: "WhatsApp pelo servidor: loja.com.br" }).click();
  const modal = page.getByTestId("wa-server");
  await modal.waitFor();
  check(await modal.getByRole("button", { name: "Criar conexão" }).isDisabled(), "sem número, o botão criar fica travado");
  await modal.getByLabel("Número com DDD (só números)").fill("(45) 99999-8888");
  await modal.getByRole("button", { name: "Criar conexão" }).click();
  await page.getByTestId("wa-server-key").waitFor();
  const w = db.whatsappConnections[0];
  check(w && w.mode === "nao_oficial" && w.phone_number_id === "5545999998888" && w.enabled === false && w.waba_id === null && /^[0-9a-f]{48}$/.test(w.inbound_key),
    "conexão nova: modo não oficial, número com 55, desligada, sem conta oficial, com chave");
  const txt = await modal.innerText();
  check(txt.includes(`/functions/v1/wa-inbound?c=${w.id}`) && txt.includes(`&k=${w.inbound_key}`) && txt.includes("Servidor: desligado"), "mostra o endereço do webhook, a chave uma vez e a situação desligada");
  await modal.getByRole("button", { name: "Copiar: Chave (cabeçalho x-webhook-key)" }).click();
  check((await page.evaluate(() => navigator.clipboard.readText())) === w.inbound_key, "botão copia a chave");
  check(txt.includes("conta oficial") && txt.includes("conversa"), "avisa que sem a conta oficial o Meta recebe a venda como conversa");

  await modal.getByRole("checkbox", { name: "Ligado" }).click();
  await page.getByTestId("wa-server-status").getByText("aguardando mensagem").waitFor();
  check(w.enabled === true, "ligar muda a situação para aguardando mensagem");

  // Chegou uma mensagem (o servidor avisou o CRM)
  w.last_webhook_at = new Date().toISOString();
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.reload();
  await page.getByRole("button", { name: "WhatsApp pelo servidor: loja.com.br" }).click();
  await modal.waitFor();
  check(await page.getByTestId("wa-server-key").count() === 0 && (await modal.innerText()).includes(`••••${w.inbound_key_hint}`), "reaberto: a chave não aparece mais");
  check((await page.getByTestId("wa-server-status").innerText()).includes("funcionando"), "com mensagem recebida: funcionando");
  // Guardar as conversas (opt-in, sem prazo, só depois de confirmar o aviso de privacidade — T5.7)
  const store = modal.getByRole("checkbox", { name: "Guardar as conversas deste WhatsApp" });
  check(w.store_messages !== true && await store.isChecked() === false, "guardar as conversas nasce desligado");
  await store.click();
  await page.getByTestId("wa-store-ack").waitFor();
  check(w.store_messages !== true, "ligar abre o aviso e ainda não liga");
  check((await page.getByTestId("wa-store-ack").innerText()).includes("Política de Privacidade"), "o aviso traz o texto pronto para o cliente usar");
  check(await page.getByTestId("wa-store-ack").getByRole("button", { name: "Confirmar e ligar" }).isDisabled(), "sem marcar a confirmação não liga");
  await page.getByTestId("wa-store-ack").getByRole("checkbox").check();
  await page.getByTestId("wa-store-ack").getByRole("button", { name: "Confirmar e ligar" }).click();
  await page.waitForFunction(() => document.body.textContent.includes("Guarda das conversas ligada."));
  check(w.store_messages === true && Boolean(w.store_ack_at), "liga a guarda e registra o aceite do aviso");
  const old = w.inbound_key;
  page.once("dialog", (d) => d.accept());
  await modal.getByRole("button", { name: "Gerar nova chave" }).click();
  await page.getByTestId("wa-server-key").waitFor();
  check(w.inbound_key !== old, "gerar nova chave troca a chave");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}
{
  // Site com WhatsApp oficial: não usa o servidor, e o botão da API oficial segue no lugar
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db, true);
  await login(page, "/tracking?secao=config");
  await page.getByRole("button", { name: /WhatsApp API oficial/ }).waitFor();
  await page.waitForTimeout(500);
  check(await page.getByRole("button", { name: "WhatsApp pelo servidor: loja.com.br" }).count() === 0 && await page.getByRole("button", { name: /WhatsApp API oficial/ }).count() === 1,
    "com API oficial ligada: só o botão da API oficial");
  await browser.close();
}
{
  for (const role of ["operador", "visualizador"]) {
    const { browser, page } = await launch();
    const db = await mockSupabase(page, { role });
    seed(db);
    await login(page, "/tracking?secao=config");
    await page.getByTestId("wa-connection-row").waitFor();
    await page.waitForTimeout(500);
    check(await page.getByRole("button", { name: "WhatsApp pelo servidor: loja.com.br" }).count() === 0, `${role} não configura o WhatsApp pelo servidor`);
    await browser.close();
  }
}
console.log("\nWhatsApp pelo servidor (T5.3): tudo certo.");
