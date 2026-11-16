/**
 * Teste de navegador — T5.38: cartão "WhatsApp do cliente" na ficha do Onboarding (onde o Account Manager trabalha).
 * Mostra para quem pode conectar; sem número cadastrado, explica o que fazer; com número, conecta por QR Code. Supabase e servidor SIMULADOS.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const AURORA = "c1000000-0000-4000-8000-000000000001";
const SEM_NUMERO = "c1000000-0000-4000-8000-000000000002";
const now = new Date().toISOString();
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-20T12:00:00Z", updated_at: "", created_by: null });

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.opsClientStages.find((s) => s.id === "contrato_pago").active = false;
db.clients.push(client(AURORA, "Loja Aurora"), client(SEM_NUMERO, "Padaria Sem Número"));
db.opsClientOps[AURORA] = { stage_id: "onboarding_pendente", am_user_id: null, started_at: now, stage_since: now, version: 1 };
db.opsClientOps[SEM_NUMERO] = { stage_id: "onboarding_pendente", am_user_id: null, started_at: now, stage_since: now, version: 1 };
db.trackingContainers.push({ id: "t-aurora", client_id: AURORA, name: "aurora.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["aurora.com.br"],
  status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
db.whatsappConnections.push({ id: "c0000000-0000-4000-8000-0000000000bb", container_id: "t-aurora", client_id: AURORA, phone_number_id: "551199998888", waba_id: null,
  enabled: false, last_webhook_at: null, last_error_at: null, last_error_message: null, mode: "nao_oficial", display_phone: "551199998888", verified_name: null,
  has_inbound_key: true, inbound_key_hint: "abcd", instance_name: null, gateway_state: null });

await page.setViewportSize({ width: 1700, height: 950 });
await login(page, "/onboarding");
const col = page.locator("[data-testid=ops-kanban-column][data-status=onboarding_pendente]");

// Cliente com número cadastrado: o cartão aparece e conecta por QR Code
await col.locator("[data-testid=ops-kanban-card]").filter({ hasText: "Loja Aurora" }).getByTestId("ops-client-card").click();
const drawer = page.getByTestId("ops-client-drawer");
const card = drawer.getByTestId("ops-onb-whatsapp");
await card.waitFor();
check(await card.getByText("WhatsApp do cliente").isVisible(), "a ficha do onboarding mostra o cartão do WhatsApp do cliente");
await card.getByRole("button", { name: "Conectar por QR Code" }).click();
await card.getByTestId("wa-qr-box").waitFor();
check((await card.getByTestId("wa-qr-box").innerText()).includes("551199998888"), "o QR é do número cadastrado do cliente");
await card.getByText("Conectado", { exact: true }).waitFor({ timeout: 15000 });
check(db.whatsappConnections[0].enabled === true && db.whatsappConnections[0].gateway_state === "conectado", "ao conectar, liga sozinho");
check((await card.innerText()).includes("não oficial"), "avisa do risco do caminho não oficial");
await card.screenshot({ path: `${SHOTS}/t538-ficha-whatsapp.png` });

// Cliente sem número: explica o que fazer (o AM não cadastra número)
await page.goto(new URL("/onboarding", page.url()).href);
await col.locator("[data-testid=ops-kanban-card]").filter({ hasText: "Padaria Sem Número" }).getByTestId("ops-client-card").click();
const card2 = page.getByTestId("ops-client-drawer").getByTestId("ops-onb-whatsapp");
await card2.waitFor();
check((await card2.innerText()).includes("Peça ao administrador ou ao gestor para cadastrar o número"), "sem número, explica quem cadastra");
check((await card2.getByRole("button", { name: "Conectar por QR Code" }).count()) === 0, "sem número, não há botão de conectar");

check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();
console.log("OK: wa-qr-ficha");
