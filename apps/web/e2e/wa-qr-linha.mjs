/**
 * Teste de navegador — T5.38: botão "Conectar por QR Code" direto na linha do cliente em Tracking → Configurações,
 * com o estado do QR ao lado. Servidor de WhatsApp e Supabase SIMULADOS.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005338";
const OUTRO = "e0000000-0000-4000-8000-000000005339";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Acollar"), client(OUTRO, "Loja Sem Número"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "acollar.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["acollar.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.whatsappConnections.push({ id: "c0000000-0000-4000-8000-0000000000aa", container_id: "t-cont", client_id: CLI, phone_number_id: "558195067876", waba_id: null,
    enabled: false, last_webhook_at: null, last_error_at: null, last_error_message: null, mode: "nao_oficial", display_phone: "558195067876", verified_name: null,
    has_inbound_key: true, inbound_key_hint: "abcd", instance_name: null, gateway_state: null });
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?secao=config");
  const rows = page.getByTestId("cli-site-whatsapp-row");
  const acollar = rows.filter({ hasText: "Acollar" });
  const botao = acollar.getByRole("button", { name: "Conectar por QR Code o WhatsApp de Acollar" });
  await botao.waitFor();
  check(true, "a linha do cliente tem o botão 'Conectar por QR Code' (sem abrir a janela grande)");
  check((await rows.filter({ hasText: "Loja Sem Número" }).getByRole("button", { name: /Conectar por QR Code/ }).count()) === 0, "cliente sem número cadastrado não tem o botão (primeiro cadastra o número em 'Ligar')");
  check((await acollar.getByText(/^QR:/).count()) === 0, "antes de conectar, não mostra estado de QR");

  await botao.click();
  const modal = page.getByTestId("wa-qr-modal");
  await modal.waitFor();
  check((await modal.innerText()).includes("Número com DDD") === false, "sem o formulário do número nem os passos de configuração");
  await modal.getByTestId("wa-qr-box").waitFor();
  check(db.waInst.connectCalls === 1, "a janela já pede o QR ao abrir, sem precisar clicar (uma chamada só)");
  await modal.getByText("Conectado", { exact: true }).waitFor({ timeout: 15000 });
  check(true, "QR lido (simulado) → conectado");
  await modal.screenshot({ path: `${SHOTS}/t538-linha-modal.png` });
  await modal.getByRole("button", { name: "Fechar" }).click();
  await acollar.getByText("QR: conectado").waitFor();
  check(true, "a linha mostra 'QR: conectado' depois de fechar");
  await acollar.screenshot({ path: `${SHOTS}/t538-linha-conectado.png` });
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// quem não gerencia o Tracking (visualizador) não vê o botão
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/tracking?secao=config");
  await page.waitForTimeout(800);
  check((await page.getByRole("button", { name: /Conectar por QR Code/ }).count()) === 0, "visualizador não vê o botão de QR Code");
  await browser.close();
}
console.log("OK: wa-qr-linha");
