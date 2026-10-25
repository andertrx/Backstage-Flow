/**
 * Teste de navegador — Tracking T3.1: Contatos (no lugar da planilha) e papel Vendedor (23/10/2026).
 * 1) Vendedor do cliente, no celular: abre direto nos Contatos, sem menu; só vê o cliente liberado;
 *    busca o código "ref." do WhatsApp → contato com a origem do anúncio; marca Lojista (vai ao Meta 1 vez);
 *    registra venda com valor; telefone cifrado no aparelho; não arquiva; não abre outras telas.
 * 2) Admin: atalho no Tracking, configura perfis/etapas, arquiva contato.
 * Supabase SIMULADO (support.mjs).
 */
import { createHash } from "node:crypto";
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const CLI = "e0000000-0000-4000-8000-000000004501";
const OUTRO = "e0000000-0000-4000-8000-000000004502";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db) {
  db.clients.push(client(CLI, "Loja Atacado"), client(OUTRO, "Outra Loja"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.whatsappClicks.push({ id: 7, container_id: "t-cont", code: "K7Q2M9", clicked_at: new Date().toISOString(), status: "clicado", sales: 0, test: false,
    touch: { channel: "meta", evidence: "confirmada", paid: true, utm_campaign: "Atacado Outubro", ad_campaign_id: "120", reason: "IDs do anúncio do Meta na URL." } });
}

{
  const { browser, page, errors } = await launch();
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await mockSupabase(page, { role: "vendedor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: CLI, created_at: "" });
  await login(page, "/");
  await page.getByRole("heading", { name: "Contatos" }).waitFor();
  check(new URL(page.url()).pathname === "/contatos", "vendedor entra direto nos Contatos");
  const menu = await page.getByRole("navigation").first().getByRole("link").count().catch(() => 0);
  check(menu === 0, `vendedor não tem itens de menu (${menu})`);
  check(await page.getByRole("button", { name: "Abrir menu" }).count() === 0, "no celular, sem botão de menu vazio");
  check(await page.getByLabel("Cliente", { exact: true }).count() === 0, "só um cliente liberado: nem aparece a escolha");

  // Código da mensagem → contato com a origem do anúncio
  await page.getByLabel("Código da mensagem ou telefone").fill("ref. k7q-2m9");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByTestId("contact-modal").waitFor();
  const modal = page.getByTestId("contact-modal");
  const info = await modal.innerText();
  check(info.includes("WhatsApp (ref. K7Q2M9)") && info.includes("Meta Ads") && info.includes("Atacado Outubro"), "código do WhatsApp → contato com a origem e a campanha");

  await modal.getByRole("button", { name: /^Lojista/ }).click();
  await page.getByTestId("contact-message").waitFor();
  check((await page.getByTestId("contact-message").innerText()).includes("Perfil Lojista salvo"), "marcar Lojista mostra o que aconteceu");
  check(db.contactQueue.filter((q) => q.event_name === "LeadLojista").length === 1, "Lojista preparado para o Meta como LeadLojista");
  await modal.getByRole("button", { name: /^Sacoleiro/ }).click();
  await page.waitForFunction(() => document.querySelector("[aria-pressed=true]")?.textContent?.startsWith("Sacoleiro"));
  await modal.getByRole("button", { name: /^Lojista/ }).click();
  await page.waitForFunction(() => document.querySelector("[aria-label=Perfil] [aria-pressed=true]")?.textContent?.startsWith("Lojista"));
  check(db.contactQueue.filter((q) => q.event_name === "LeadLojista").length === 1, "marcar Lojista de novo não manda outra vez");

  // Venda
  await modal.getByRole("button", { name: /^Venda/ }).click();
  await page.getByTestId("sale-form").waitFor();
  check(await page.getByTestId("sale-confirm").isDisabled(), "venda sem valor: botão travado");
  await page.getByTestId("sale-form").getByLabel("Valor").fill("1.297,50");
  await page.getByTestId("sale-form").getByLabel("Nº do pedido (opcional)").fill("P-88");
  await page.screenshot({ path: `${SHOTS}/contatos-venda.png`, fullPage: true });
  await page.getByTestId("sale-confirm").click();
  await page.getByText("Venda registrada.").waitFor();
  const buy = db.contactQueue.find((q) => q.event_name === "Purchase");
  check(buy && buy.value === 1297.5 && buy.currency === "BRL", "venda: compra com valor e moeda para o Meta");
  const hist = await page.getByTestId("contact-history").innerText();
  check(hist.includes("Venda: R$") && hist.includes("pedido P-88") && hist.includes("Contato criado") && hist.includes("evento para o Meta: LeadLojista"),
    "histórico mostra criação, perfil e venda");
  check(await modal.getByRole("button", { name: /Arquivar/ }).count() === 0, "vendedor não arquiva");
  await page.getByRole("button", { name: "Fechar janela" }).click();

  // Telefone: cifrado no aparelho
  await page.getByLabel("Código da mensagem ou telefone").fill("(45) 99999-8888");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByTestId("contact-create-phone").click();
  await page.getByTestId("contact-modal").waitFor();
  const manual = db.contacts.find((k) => k.origin === "manual");
  check(manual && manual.ph_hash === sha("5545999998888"), "telefone vira só o código cifrado (SHA-256) antes de sair do aparelho");
  check(!JSON.stringify(db.contacts).includes("99999"), "o número legível nunca chega ao servidor");
  await page.getByRole("button", { name: "Fechar janela" }).click();
  check(await page.getByTestId("contact-row").count() === 2, "lista com os 2 contatos");
  await page.screenshot({ path: `${SHOTS}/contatos-vendedor.png`, fullPage: true });

  // Outras telas: volta para os Contatos
  await page.goto(`${BASE}/tracking`);
  await page.getByRole("heading", { name: "Contatos" }).waitFor();
  check(new URL(page.url()).pathname === "/contatos", "vendedor tentando abrir o Tracking volta para os Contatos");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Admin: atalho no Tracking, perfis/etapas e arquivar
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking");
  await page.getByRole("link", { name: "Contatos" }).click();
  await page.getByRole("heading", { name: "Contatos" }).waitFor();
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Loja Atacado" });
  await page.getByLabel("Código da mensagem ou telefone").fill("K7Q2M9");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByTestId("contact-modal").waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("contact-modal").getByRole("button", { name: /Arquivar/ }).click();
  await page.getByTestId("contact-row").first().getByText("Arquivado").waitFor();
  check(db.contacts[0].archived_at && db.contactHistory.some((h) => h.kind === "arquivado"), "admin arquiva (fica no histórico, não apaga)");

  await page.getByRole("button", { name: "Perfis e etapas" }).click();
  await page.getByTestId("contacts-setup").waitFor();
  await page.getByLabel("Evento no Meta: Sacoleiro").fill("Lead Sacoleiro");
  await page.getByTestId("setup-profile").filter({ has: page.getByLabel("Nome: Sacoleiro") }).getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Evento no Meta: só letras").waitFor();
  check(true, "nome de evento inválido é recusado na tela");
  await page.getByLabel("Evento no Meta: Sacoleiro").fill("LeadSacoleiro");
  await page.getByTestId("setup-profile").filter({ has: page.getByLabel("Nome: Sacoleiro") }).getByRole("button", { name: "Salvar" }).click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  check(db.contactProfiles.find((p) => p.client_id === CLI && p.name === "Sacoleiro").meta_event === "LeadSacoleiro", "perfil Sacoleiro passa a ir ao Meta");
  await page.screenshot({ path: `${SHOTS}/contatos-perfis-etapas.png`, fullPage: true });
  check(errors.length === 0, `sem erros no navegador (admin) ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Visualizador: vê, não marca
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: CLI, created_at: "" });
  db.contacts.push({ id: 201, client_id: CLI, origin: "manual", ph_hash: sha("x"), em_hash: null, wa_click_id: null, ref_code: null, container_id: "t-cont",
    stage_id: `st-${CLI.slice(-4)}-0`, profile_id: null, meta_sent: [], sales: 0, created_at: "2026-10-20T00:00:00Z", last_change_at: "2026-10-20T00:00:00Z", archived_at: null });
  await login(page, "/contatos");
  await page.getByTestId("contact-row").click();
  await page.getByTestId("contact-modal").waitFor();
  check(await page.getByTestId("contact-modal").getByRole("button", { name: /^Lojista/ }).isDisabled(), "visualizador vê o contato, mas não marca");
  check(await page.getByRole("button", { name: "Perfis e etapas" }).count() === 0, "visualizador não configura perfis e etapas");
  await browser.close();
}

console.log("Contatos (T3.1): tudo certo.");
