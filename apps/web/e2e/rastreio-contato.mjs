/**
 * Teste de navegador — T5.35 (etapa 3): ficha de rastreio do contato.
 * O modal do contato mostra de onde ele veio: canal, método, confiança, dados do anúncio, campanha/conjunto,
 * o clique to WhatsApp (técnico) e o que já foi ao Meta. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004501";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.whatsappClicks.push({ id: 7, container_id: "t-cont", code: "K7Q2M9", clicked_at: new Date().toISOString(), status: "clicado", sales: 0, test: false,
    touch: { channel: "meta", evidence: "confirmada", paid: true, utm_campaign: "Atacado Outubro", ad_campaign_id: "120", ad_ad_id: "8891", ad_adset_id: "4412",
      landing_url: "https://www.instagram.com/p/DbY3q4w4rPK/", utm_source: "instagram", utm_medium: "paid_social", fbclid: "AbCdEf123", reason: "IDs do anúncio do Meta na URL." } });
  db.whatsappConnections.push({ id: "c-oficial", container_id: "t-cont", client_id: CLI, phone_number_id: "109876543210", waba_id: "1748673976314638", enabled: true,
    last_webhook_at: new Date().toISOString(), last_error_at: null, last_error_message: null, mode: "manual", display_phone: null, verified_name: "Loja Atacado" });
  db.whatsappConversations.push({ id: 3, container_id: "t-cont", client_id: CLI, origin: "anuncio_whatsapp", ctwa_clid: "Af1R8WKLQdveMB_wPqaLEf226JUb", ad_id: "8891",
    click_code: "K7Q2M9", messages: 2, first_message_at: new Date().toISOString(), last_message_at: new Date().toISOString() });
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/contatos");
  await page.getByLabel("Código da mensagem ou telefone").fill("ref. k7q-2m9");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByTestId("contact-modal").waitFor();
  await page.getByTestId("contact-rastreio").waitFor();

  const txt = await page.getByTestId("contact-rastreio").innerText();
  check(txt.includes("Rastreio do contato"), "o contato mostra a ficha de rastreio");
  check(txt.includes("Meta Ads"), "a ficha mostra o canal de captura (Meta Ads)");
  check(txt.includes("WhatsApp (API oficial)"), "a ficha mostra o método (WhatsApp pela API oficial)");
  check(txt.includes("Confirmada"), "a ficha mostra a confiança (Confirmada)");
  check(txt.includes("Atacado Outubro"), "a ficha mostra a campanha do clique");
  check(txt.includes("8891") && txt.includes("4412"), "a ficha mostra o ID do anúncio e do conjunto");
  check(txt.includes("instagram.com/p/DbY3q4w4rPK"), "a ficha mostra a URL de origem");
  check(txt.includes("Af1R8WKLQdveMB_wPqaLEf226JUb"), "a ficha mostra o ctwa_clid do clique no WhatsApp");
  check(txt.includes("1748673976314638"), "a ficha mostra o waba_id da conta oficial");
  check(txt.includes("IDs do anúncio do Meta na URL"), "a ficha explica como a origem foi identificada");
  check(txt.toUpperCase().includes("UTM_SOURCE") && txt.includes("instagram"), "a ficha mostra os parâmetros capturados");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

console.log("rastreio-contato: OK");
