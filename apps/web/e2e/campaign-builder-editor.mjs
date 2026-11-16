/**
 * Fase 35.2 (passo 2) — editor do rascunho: campanha, conjuntos, anúncios, conferência e salvamento automático.
 * Supabase simulado. Nada é criado no Meta.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLIENT = { id: "55555555-5555-4555-8555-555555555555", name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null,
  notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null, excluded_at: null };
const ACCOUNT = { id: "a0000000-0000-4000-8000-000000000001", platform_id: "meta", external_id: "1001", client_id: CLIENT.id, connection_id: null, name: "Excalibur - Principal",
  currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", raw_status: "account_status=1", status_reason: null, business_name: "BM Agência", is_prepay: null,
  manager_customer_id: null, is_test_account: null, linked_at: "2026-09-25T00:00:00Z", details_updated_at: "2026-09-25T00:00:00Z", unlinked_at: null, assets: [] };

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ ...CLIENT });
db.adAccounts.push({ ...ACCOUNT });
const draft = { id: "d0000000-0000-4000-8000-000000000001", client_id: CLIENT.id, ad_account_id: ACCOUNT.id, name: "Rascunho do editor", data: {}, version: 1,
  archived_at: null, created_by: null, updated_by: null, created_at: "2026-11-16T10:00:00Z", updated_at: "2026-11-16T10:00:00Z" };
db.builderDrafts.push(draft);

await login(page, `/criar-campanhas/${draft.id}`);
await page.getByRole("heading", { name: "Campanha", exact: true }).waitFor();
const checklist = page.getByTestId("cb-checklist");
check(await checklist.getByText("Escolha o status: Pausada ou Ativa", { exact: false }).isVisible(), "status não vem preenchido e a conferência cobra");
check(await checklist.getByText("Adicione pelo menos um conjunto", { exact: false }).isVisible(), "conferência pede ao menos um conjunto");
check(await page.getByText("Conta: Excalibur - Principal (BRL)").isVisible(), "mostra a conta e a moeda");

// Campanha
await page.getByLabel("Nome da campanha").fill("Black Friday");
await page.getByLabel("Objetivo").selectOption("OUTCOME_TRAFFIC");
await page.getByLabel("Status ao publicar").selectOption("PAUSED");

// Conjunto: meta só aceita as do objetivo
await page.getByRole("button", { name: "Adicionar conjunto" }).click();
const set = page.getByTestId("cb-conjunto").first();
const goals = await set.getByLabel("Meta de otimização").locator("option").allTextContents();
check(goals.includes("Cliques no link") && !goals.includes("Geração de leads (formulário)"), "meta de otimização só oferece o que o objetivo aceita");
await set.getByLabel("Nome do conjunto").fill("Brasil 25-45");
await set.getByLabel("Meta de otimização").selectOption("LINK_CLICKS");
const billing = await set.getByLabel("Cobrança").locator("option").allTextContents();
check(billing.join(",") === "Impressões,Cliques no link", "cobrança acompanha a meta");
await set.getByLabel("Orçamento diário (BRL)").fill("50");
await set.getByLabel("Idade mínima").fill("25");
await set.getByLabel("Idade máxima").fill("45");

// Anúncio
await set.getByRole("button", { name: "Adicionar anúncio" }).click();
const ad = page.getByTestId("cb-anuncio").first();
await ad.getByLabel("Nome do anúncio").fill("Anúncio 1");
await ad.getByLabel("Página do Facebook").fill("123456");
await ad.getByLabel("Texto principal").fill("Oferta imperdível");
await ad.getByLabel("Botão (CTA)").selectOption("SHOP_NOW");
await ad.getByLabel("Link de destino").fill("http://loja.com.br");
check(await checklist.getByText("precisa começar com https://", { exact: false }).isVisible(), "link sem https é cobrado");
await ad.getByLabel("Link de destino").fill("https://loja.com.br");
check(await checklist.getByText("Tudo preenchido", { exact: false }).isVisible(), "tudo preenchido: a conferência fica verde");
check(await checklist.getByText("Nada é criado no Meta", { exact: false }).isVisible(), "avisa que nada é criado no Meta");

// Salvamento automático
await page.waitForFunction(() => document.querySelector('[data-testid="cb-estado"]')?.textContent === "Salvo", null, { timeout: 8000 });
check(db.builderDrafts[0].version > 1, "salvou sozinho (versão subiu)");
const saved = db.builderDrafts[0].data;
check(saved.campaign?.name === "Black Friday" && saved.adSets?.length === 1 && saved.ads?.length === 1, "campanha, conjunto e anúncio ficaram no rascunho");
check(saved.campaign?.status === "PAUSED" && saved.adSets[0].budgetAmount === 50, "status e orçamento guardados");
await page.screenshot({ path: `${SHOTS}/35-2-editor-rascunho.png`, fullPage: true });

// Reabrir traz tudo de volta
await page.reload();
await page.getByLabel("Nome da campanha").waitFor();
check((await page.getByLabel("Nome da campanha").inputValue()) === "Black Friday", "reabrir mostra o que foi salvo");

// Duplicar leva os anúncios
await page.getByTestId("cb-conjunto").first().getByRole("button", { name: "Duplicar" }).click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="cb-conjunto"]').length === 2);
check((await page.getByTestId("cb-anuncio").count()) === 2, "duplicar o conjunto copia os anúncios");

// Categoria especial trava o público
await page.getByLabel("Crédito").check();
check(await page.getByTestId("cb-conjunto").first().getByLabel("Idade mínima").isDisabled(), "categoria especial trava a idade");
check(await checklist.getByText("categoria especial", { exact: false }).first().isVisible(), "conferência avisa da categoria especial");
await page.getByLabel("Crédito").uncheck();

// Segredo
await page.getByTestId("cb-avancado").locator("summary").click();
await page.getByLabel("JSON avançado").fill("{ quebrado");
check(await checklist.getByText("JSON válido", { exact: false }).isVisible(), "JSON avançado inválido é cobrado");
check((await page.getByRole("button", { name: /^Validar|^Simular|^Publicar/ }).count()) === 0, "não há botão de validar/publicar ainda (nada de botão de mentira)");

check(errors.length === 0, "sem erros no navegador");
await browser.close();

// Gestor sem permissão: só leitura
{
  const { browser: b2, page: p2 } = await launch();
  const db2 = await mockSupabase(p2, { role: "gestor" });
  db2.clients.push({ ...CLIENT });
  db2.adAccounts.push({ ...ACCOUNT });
  db2.builderDrafts.push({ ...draft });
  await login(p2, `/criar-campanhas/${draft.id}`);
  await p2.getByText("não tem permissão para editar", { exact: false }).waitFor();
  check(await p2.getByLabel("Nome da campanha").isDisabled(), "sem permissão, os campos ficam travados");
  check((await p2.getByRole("button", { name: "Salvar agora" }).count()) === 0, "sem permissão, não há 'Salvar agora'");
  await b2.close();
}
console.log("OK: campaign-builder-editor");
