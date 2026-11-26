/**
 * Teste de navegador (26/11/2026) — o código de pareamento por número mostra um contador ("vale por mais 1:40") e,
 * passando da estimativa de 2 minutos, avisa que provavelmente venceu e pede para gerar outro. Gerar outro zera o contador.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000007401";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();

const { browser, page, errors } = await launch();
await page.clock.install();
await page.setViewportSize({ width: 1440, height: 950 });
const db = await mockSupabase(page, { role: "admin" });
db.clients.push(client(CLI, "Prata e Pérola"));
db.trackingContainers.push({ id: "t2", client_id: CLI, name: "WhatsApp (sem site)", public_key: "bf_0123456789abcdef01234567", allowed_domains: [], status: "ativo", test_mode: false,
  consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null, kind: "whatsapp" });
db.whatsappConnections.push({ id: "c1", container_id: "t2", client_id: CLI, phone_number_id: "558198398622", waba_id: null, enabled: true, last_webhook_at: ago(30), last_error_at: null, last_error_message: null,
  mode: "nao_oficial", display_phone: "558198398622", verified_name: null, has_inbound_key: true, inbound_key_hint: "abcd", instance_name: "i", gateway_state: "desconectado", health_since: ago(60), store_messages: false, store_ack_at: null, ai_suggest: false });
await login(page, `/tracking?secao=config&cliente=${CLI}`);
await page.getByRole("button", { name: /Conectar o WhatsApp de/ }).first().click();
await page.getByTestId("wa-qr-modal").waitFor();
await page.getByRole("tab", { name: /outro lugar/ }).click();
await page.getByRole("button", { name: "Gerar código" }).click();
const box = page.getByTestId("wa-qr-code");
await box.waitFor();
const r0 = await page.getByTestId("wa-code-restante").innerText();
check(/mais cerca de\s*(1:5\d|2:00)/.test(r0) && r0.includes("estimativa"), `logo depois de gerar mostra o contador (${r0})`);
check(await page.getByTestId("wa-code-vencido").count() === 0, "ainda não aparece o aviso de vencido");

await page.clock.fastForward(60_000);
const r1 = await page.getByTestId("wa-code-restante").innerText();
check(/mais cerca de\s*(0:5\d|1:00)/.test(r1), `1 minuto depois o contador desceu (${r1})`);

await page.clock.fastForward(61_000);
await page.getByTestId("wa-code-vencido").waitFor();
check(await page.getByTestId("wa-code-restante").count() === 0, "passou de 2 minutos: o contador some");
check((await page.getByTestId("wa-code-vencido").innerText()).includes("Gerar outro código"), "avisa que venceu e manda gerar outro código");
await page.screenshot({ path: "../../docs/etapa-34-tracking/imagens/tracking-codigo-vencido.png" });

await page.getByRole("button", { name: "Gerar outro código" }).click();
await page.getByTestId("wa-code-restante").waitFor();
check(await page.getByTestId("wa-code-vencido").count() === 0, "gerar outro código zera o contador e tira o aviso");
check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
console.log("wa-codigo-vence: OK");
