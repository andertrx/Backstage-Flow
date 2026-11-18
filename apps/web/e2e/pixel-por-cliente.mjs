/**
 * Teste de navegador — Pixel do Meta por cliente (Tracking → Configurações → "Clientes: site e/ou WhatsApp"):
 * a coluna "Pixel do Meta" mostra "Sem pixel" / "Ligado", o botão "Ligar pixel de X" abre a configuração (mesmo para cliente só-WhatsApp)
 * e o aviso do "Marcar venda" lembra quando o cliente não tem pixel. Servidor e Supabase SIMULADOS.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000000501";
const { browser, page, errors } = await launch();
await page.setViewportSize({ width: 1440, height: 900 });
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ id: CLI, name: "Acollar", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
db.trackingContainers.push({ id: "t-acollar", client_id: CLI, kind: "whatsapp", name: "WhatsApp (sem site)", public_key: "bf_" + "1".repeat(24), allowed_domains: [],
  status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });

await login(page, "/tracking?secao=config");
const lista = page.getByTestId("cli-site-whatsapp");
await lista.waitFor();
const linha = lista.getByTestId("cli-site-whatsapp-row").filter({ hasText: "Acollar" });
check((await lista.innerText()).toLowerCase().includes("pixel do meta"), "a lista tem a coluna Pixel do Meta");
check((await linha.getByTestId("cli-pixel-coluna").innerText()).includes("Sem pixel"), "cliente só-WhatsApp aparece como Sem pixel");

// Liga o pixel do cliente (mesmo sem site): abre a configuração do Meta
await linha.getByRole("button", { name: "Ligar pixel de Acollar" }).click();
const modal = page.getByRole("dialog");
await modal.waitFor();
check((await modal.innerText()).includes("API de Conversões"), "abre a configuração do pixel do cliente");
await modal.getByLabel(/ID do Pixel/).fill("123456789012345");
await modal.getByLabel(/Token da API de Conversões/).fill("EAAtokendeteste");
await modal.getByText("Enviar eventos ao Meta").click();
await modal.getByRole("button", { name: /^Salvar/ }).click();
await modal.getByText(/envio ao Meta está ligado/).waitFor();
await page.screenshot({ path: `${SHOTS}/pixel-por-cliente-modal.png` });
await modal.getByRole("button", { name: /Fechar/ }).first().click();

const col = linha.getByTestId("cli-pixel-coluna");
await col.getByText(/Ligado/).waitFor();
check((await col.innerText()).includes("···2345"), "depois de salvar, a lista mostra Pixel ligado (final 2345)");
check(await linha.getByRole("button", { name: "Configurar pixel de Acollar" }).count() === 1, "o botão vira Configurar (ícone)");
check(db.trackingDestinations.length === 1 && db.trackingDestinations[0].container_id === "t-acollar", "o pixel ficou no recipiente do cliente");
await page.screenshot({ path: `${SHOTS}/pixel-por-cliente-lista.png`, fullPage: false });

// Celular: a coluna vira uma linha "Pixel" no cartão do cliente
await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await lista.waitFor();
const cartao = lista.getByTestId("cli-site-whatsapp-row").filter({ hasText: "Acollar" });
check(await cartao.getByTestId("cli-pixel-coluna").isVisible(), "celular: o pixel aparece no cartão do cliente");
const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(sobra <= 1, `celular: sem rolagem para o lado (${sobra}px)`);

check(errors.length === 0, "sem erros no navegador: " + errors.join(" | "));
await browser.close();
console.log("pixel-por-cliente: tudo certo");
