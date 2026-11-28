/**
 * Fase J.3 — Biblioteca de textos do Criador: pacotes por cliente e uso na esteira.
 * Supabase simulado. Nada é criado no Meta.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLIENT = { id: "55555555-5555-4555-8555-555555555555", name: "Vonks", company: null, cnpj: null, owner_name: null, phone: null, email: null,
  notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null, excluded_at: null };
const ACCOUNT = { id: "a0000000-0000-4000-8000-000000000001", platform_id: "meta", external_id: "1238140437148137", client_id: CLIENT.id, connection_id: null, name: "CA - Vonks",
  currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", raw_status: "account_status=1", status_reason: null, business_name: "BM - Vonks", is_prepay: null,
  manager_customer_id: null, is_test_account: null, linked_at: "2026-09-25T00:00:00Z", details_updated_at: "2026-09-25T00:00:00Z", unlinked_at: null, assets: [] };

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ ...CLIENT });
db.adAccounts.push({ ...ACCOUNT });
db.campaigns.push({ id: "c1000000-0000-4000-8000-000000000001", ad_account_id: ACCOUNT.id, client_id: CLIENT.id, platform_id: "meta", external_id: "120250000000001", name: "CP-7.6 SITE", effective_status: "ACTIVE" });
db.adGroups.push({ id: "g1000000-0000-4000-8000-000000000001", campaign_id: "c1000000-0000-4000-8000-000000000001", ad_account_id: ACCOUNT.id, client_id: CLIENT.id, platform_id: "meta", external_id: "120250174283950625", name: "CJ-01 SITE", effective_status: "ACTIVE" });
db.metaBuilder.adsets = { "120250174283950625": { destinationType: "WEBSITE", advantageAudience: false, placements: "manual" } };
const draft = { id: "d0000000-0000-4000-8000-000000000009", client_id: CLIENT.id, ad_account_id: ACCOUNT.id, name: "Esteira com pacote",
  data: { kind: "esteira" }, version: 1, archived_at: null, created_by: null, updated_by: null, created_at: "2026-11-28T10:00:00Z", updated_at: "2026-11-28T10:00:00Z" };
db.builderDrafts.push(draft);

// 1. Biblioteca na tela inicial do Criador
await login(page, "/criar/campanhas");
const lib = page.getByTestId("biblioteca");
await lib.waitFor();
await lib.getByLabel("Cliente").selectOption(CLIENT.id);
await lib.getByText("Nenhum pacote para este cliente ainda.").waitFor({ timeout: 5000 });
check(true, "começa sem pacotes");
await page.getByTestId("pacote-novo").click();
const form = page.getByTestId("pacote-form");
await form.getByLabel("Nome do pacote").fill("Black — Site");
await form.getByRole("textbox", { name: "Texto principal 1" }).fill("Moda masculina no atacado");
await form.getByRole("textbox", { name: "Texto principal 2" }).fill("Renove seu estoque");
await form.getByRole("textbox", { name: "Título 1" }).fill("Atacado Vonks");
await form.getByLabel("Link (só para conjuntos de site)").fill("http://vonks.com.br");
check(await form.getByText("O link precisa começar com https://.").isVisible(), "link sem https é cobrado antes de salvar");
check(await form.getByRole("button", { name: "Salvar pacote" }).isDisabled(), "não salva com problema");
await form.getByLabel("Link (só para conjuntos de site)").fill("https://vonks.com.br");
await form.getByLabel("Botão (só para conjuntos de site)").selectOption("SHOP_NOW");
await form.getByRole("textbox", { name: "Mensagem de abordagem 1" }).fill("Olá! Vi o anúncio da Black e quero o catálogo.");
await form.getByRole("button", { name: "Salvar pacote" }).click();
await lib.getByTestId("pacote").first().waitFor();
const saved = db.builderCopySets[0];
check(saved?.name === "Black — Site" && saved.bodies.length === 2 && saved.titles.length === 1 && saved.messages.length === 1, "pacote salvo sem os campos vazios");
check(await lib.getByText("2 texto(s) · 1 título(s) · 1 mensagem(ns) de abordagem").isVisible(), "lista mostra o resumo do pacote");
await page.screenshot({ path: `${SHOTS}/35-14-biblioteca.png`, fullPage: true });

// Arquivar e desfazer
await lib.getByRole("button", { name: "Arquivar Black — Site" }).click();
await page.getByTestId("confirm-ok").click();
await lib.getByText("Nenhum pacote para este cliente ainda.").waitFor();
check(db.builderCopySets[0].archived_at !== null, "arquivou (sem apagar)");
await page.getByRole("button", { name: "Desfazer" }).click();
await lib.getByTestId("pacote").first().waitFor();
check(db.builderCopySets[0].archived_at === null, "desfazer traz o pacote de volta");

// 2. Usar o pacote na esteira (conjunto de site: link e botão vêm junto)
await page.goto(`${process.env.E2E_BASE_URL}/criar/esteira/${draft.id}`);
await page.getByRole("heading", { name: "Subir criativos", exact: true }).waitFor();
await page.getByLabel("Conjunto que vai receber os criativos").selectOption("120250174283950625");
await page.getByTestId("es-conjunto").waitFor();
await page.getByLabel("Pacote da biblioteca (opcional)").selectOption({ label: "Black — Site" });
check(await page.getByTestId("pacote-mensagens").getByText("Olá! Vi o anúncio da Black").isVisible(), "mostra as mensagens de abordagem do pacote para copiar");
await page.getByTestId("es-usar-pacote").click();
await page.waitForFunction(() => document.querySelector('[aria-label="Texto principal 2"]')?.value === "Renove seu estoque");
check((await page.getByLabel("Link de destino").inputValue()) === "https://vonks.com.br", "link do pacote vem para conjunto de site");
check((await page.getByLabel("Botão (CTA)").inputValue()) === "SHOP_NOW", "botão do pacote vem para conjunto de site");

// 3. Salvar os textos padrão como pacote novo
await page.getByTestId("es-salvar-pacote").click();
const form2 = page.getByTestId("pacote-form");
check((await form2.getByRole("textbox", { name: "Texto principal 1" }).inputValue()) === "Moda masculina no atacado", "o pacote novo já vem com os textos padrão da esteira");
await form2.getByLabel("Nome do pacote").fill("Black — Site");
await form2.getByRole("button", { name: "Salvar pacote" }).click();
await form2.getByText("Já existe um pacote com esse nome", { exact: false }).waitFor();
check(true, "nome repetido no mesmo cliente é recusado");
await form2.getByLabel("Nome do pacote").fill("Black — Site v2");
await form2.getByRole("button", { name: "Salvar pacote" }).click();
await page.waitForFunction(() => !document.querySelector('[data-testid="pacote-form"]'));
check(db.builderCopySets.length === 2 && db.builderCopySets[1].name === "Black — Site v2", "salvou o pacote novo a partir da esteira");

check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();
console.log("campaign-builder-biblioteca: ok");
