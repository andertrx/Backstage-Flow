/**
 * Teste de navegador — Tracking T5.5: lista "pronto para cliente" (aba Saúde), 08/11/2026.
 * Site novo (sem nada) mostra o que falta; depois de chegar evento, lead, Pixel e envio aceito, fica "Pronto para o cliente".
 * Supabase SIMULADO (support.mjs).
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000005501";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push(client(CLI, "Loja Atacado"));
db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
  status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });

await login(page, "/tracking?aba=site&sub=saude");
const site = page.getByTestId("readiness-site");
await site.waitFor();
const state = (id) => site.locator(`[data-item="${id}"]`).getAttribute("data-state");
check((await site.innerText()).includes("Faltam itens"), "site novo: faltam itens");
check((await state("codigo")) === "fail" && (await state("pixel")) === "fail" && (await state("envio")) === "na" && (await state("lead")) === "warn" && (await state("whatsapp")) === "na",
  "site novo: sem código, sem Pixel, sem lead; envio e WhatsApp não se aplicam");
check((await site.locator('[data-item="codigo"]').innerText()).includes("Nenhum evento recebido"), "explica o que fazer (colar o código)");

// Chegam visitas, lead, Pixel e envio aceito
db.trackingTouchpoints.push({ id: 1, container_id: "t-cont", occurred_at: ago(30), channel: "meta", paid: true, evidence: "confirmada", reason: "IDs do anúncio do Meta na URL.",
  utm_source: "facebook", utm_campaign: "Black Friday", ad_campaign_id: "120", source_normalized: "meta" });
db.trackingEvents.push({ event_id: "evt-pv-0001", container_id: "t-cont", event_name: "PageView", occurred_at: ago(30), page_path: "/", test: false, touchpoint_id: 1, session_id: "s1", visitor_id: "v1", custom_data: {} });
db.trackingEvents.push({ event_id: "evt-lead-0001", container_id: "t-cont", event_name: "Lead", occurred_at: ago(20), page_path: "/obrigado", test: false, touchpoint_id: null, session_id: "s1", visitor_id: "v1", custom_data: {} });
db.trackingLeads.push({ id: 7, container_id: "t-cont", client_id: CLI, first_event_name: "Lead", first_converted_at: ago(20), last_converted_at: ago(20), conversions: 1, purchases: 0, test: false,
  first_touch: { channel: "meta", evidence: "confirmada", paid: true, utm_campaign: "Black Friday" }, last_touch: null, has_email: true, has_phone: false, journey_events: 2 });
db.trackingDestinations.push({ id: "d1", container_id: "t-cont", client_id: CLI, pixel_id: "123456789012345", enabled: true, test_event_code: null, send_events: ["Lead"],
  last_success_at: ago(10), last_error_at: null, last_error_message: null, sent_24h: 2, errors_24h: 0, pending: 0 });
db.capiTokens["d1"] = "x";
await page.reload();
await site.waitFor();
await page.waitForFunction(() => document.querySelector('[data-item="codigo"]')?.getAttribute("data-state") === "ok");
check((await state("codigo")) === "ok" && (await state("pixel")) === "ok" && (await state("envio")) === "ok", "com evento, Pixel e envio aceito: itens certos");
const summary = (await site.innerText()).includes("Pronto para o cliente") || (await site.innerText()).includes("Quase pronto");
check(summary, "o resumo do site aparece");
await page.screenshot({ path: `${SHOTS}/tracking-saude.png`, fullPage: true });
check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
console.log("\nTracking Saúde (T5.5): tudo certo.");
