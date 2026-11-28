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
check(await checklist.getByText("Validar não cria nada", { exact: false }).isVisible(), "avisa que validar não cria nada");

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
check((await page.getByRole("button", { name: /^Simular/ }).count()) === 0, "não há botão de simular (nada de botão de mentira)");

// Fase A: públicos da conta (lidos do Meta) e Validar com o Meta (só a campanha, sem criar nada)
const firstSet = page.getByTestId("cb-conjunto").first();
await firstSet.getByTestId("cb-publicos").waitFor();
check((await firstSet.getByTestId("cb-publicos").getByText("Clientes que compraram").count()) === 1, "mostra os públicos da conta devolvidos pelo Meta");
await firstSet.getByTestId("cb-publicos").getByLabel(/Clientes que compraram/).check();
await page.getByRole("button", { name: "Validar com o Meta" }).click();
await page.getByTestId("cb-validou-ok").waitFor();
check(db.metaBuilder.calls.some((c) => c.action === "validate" && c.draftId === draft.id), "Validar manda o rascunho para o servidor (que pergunta ao Meta)");
check(db.builderDrafts[0].data.adSets[0].audienceIds.includes("9001"), "o público escolhido foi salvo no rascunho antes de validar");
db.metaBuilder.validation = { ok: false, message: "Objetivo inválido: escolha outro.", code: 100, subcode: 1, permission: false };
await page.getByRole("button", { name: "Validar com o Meta" }).click();
await page.getByTestId("cb-validou-erro").waitFor();
check((await page.getByTestId("cb-validou-erro").innerText()).includes("Objetivo inválido"), "recusa do Meta aparece com o motivo dele");
db.metaBuilder.validation = { ok: false, message: "(#200) Requires ads_management", code: 200, subcode: null, permission: true };
await page.getByRole("button", { name: "Validar com o Meta" }).click();
await page.getByText("não tem permissão para criar campanhas", { exact: false }).waitFor();
check(true, "token sem permissão de criar é explicado");

// Fase B: Publicar (tudo pausado). Bloqueios claros antes de poder clicar.
const publicar = page.getByRole("button", { name: /Publicar no Meta/ });
check(await publicar.isDisabled(), "Publicar fica travado enquanto há pendências");
const bloqueios = await page.getByTestId("cb-publicar-bloqueios").innerText();
check(bloqueios.includes("modo avançado") && bloqueios.includes("imagem"), "explica o que falta: modo avançado e endereço da imagem");
await page.getByLabel("JSON avançado").fill("");
// Anúncio 1: imagem escolhida no Google Drive (navega até a subpasta e escolhe)
await page.getByTestId("cb-drive-escolher").first().click();
const picker = page.getByTestId("drive-picker");
await picker.getByLabel("Link da pasta do Drive").fill("https://drive.google.com/drive/folders/pastaRaiz1234567");
await picker.getByRole("button", { name: "Abrir pasta" }).click();
await picker.getByRole("button", { name: "Black Friday" }).first().click();
await picker.getByTestId("drive-imagem").first().waitFor();
check((await picker.getByTestId("drive-imagem").count()) === 2, "mostra as imagens JPG/PNG da subpasta");
check((await picker.getByTestId("drive-video").count()) === 1, "mostra também o vídeo MP4 da subpasta");
await picker.getByTestId("drive-imagem").first().click();
await picker.getByRole("button", { name: "Usar esta imagem" }).click();
await page.getByTestId("cb-drive-arquivo").first().waitFor();
check((await page.getByTestId("cb-drive-arquivo").first().innerText()).includes("ADS-01.png"), "o anúncio guarda a imagem escolhida do Drive");
// Anúncio 2: endereço da imagem (alternativa)
await page.getByLabel("ou o endereço da imagem").fill("https://loja.com.br/imagem.jpg");
await page.waitForFunction(() => !document.querySelector('[data-testid="cb-publicar-bloqueios"]'));
check(await publicar.isEnabled(), "sem pendências, o Publicar libera");
// Fase J.1: Controle total — tudo desligado por padrão
const ctl = page.getByTestId("cb-controle");
check(!(await ctl.getByTestId("cb-ctl-melhorias").locator("input").isChecked()) && !(await ctl.getByTestId("cb-ctl-multi").locator("input").isChecked()) && !(await ctl.getByTestId("cb-ctl-posicionamentos").locator("input").isChecked()), "Controle total: melhorias, vários anunciantes e posicionamentos automáticos vêm desligados");
await ctl.getByRole("button", { name: "Usar sugestão" }).click();
await page.waitForTimeout(1500);
check((db.builderDrafts[0].data.campaign.control?.urlTags ?? "").startsWith("utm_source=meta"), "UTM sugerida é salva no rascunho");
db.metaBuilder.forcedOn = ["inline_comment"]; // o Meta "teima" e liga uma melhoria: a tela tem que mostrar
await publicar.click();
const textoConfirma = await page.getByTestId("confirm-dialog").innerText().catch(() => "");
check(textoConfirma.includes("PAUSADO") && textoConfirma.includes("2 conjunto(s)"), "1ª confirmação mostra o resumo exato e que sai pausado");
await page.getByTestId("confirm-ok").click();
await page.getByTestId("confirm-ok").waitFor();
await page.getByTestId("confirm-ok").click();
await page.getByTestId("cb-publicacao-status").waitFor();
check((await page.getByTestId("cb-publicacao-status").innerText()).includes("Publicada"), "mostra que foi publicada (pausada)");
check(db.metaBuilder.calls.filter((c) => c.action === "publish").length === 1, "chamou o servidor uma única vez");
check(db.builderDrafts[0].data.ads.some((x) => x.driveFileId === "imagemUm1234567" && x.driveFileName === "ADS-01.png"), "o rascunho guarda o arquivo do Drive (id e nome)");
check((await page.getByTestId("cb-publicacao").getByText("confirmado no Meta").count()) >= 5, "cada objeto aparece confirmado pelo Meta");
check(await page.getByRole("link", { name: /Abrir no Gerenciador/ }).isVisible(), "link para o Gerenciador de Anúncios");
check((await page.getByTestId("cb-automacoes-ligadas").first().innerText()).includes("Comentários em destaque"), "leitura de volta: mostra a melhoria que o Meta deixou ligada, em português");
check((await page.getByTestId("cb-automacoes-ok").count()) >= 2, "leitura de volta: conjuntos aparecem com público e posicionamentos como escolhidos");
check((await page.getByRole("button", { name: /Publicar no Meta/ }).count()) === 0, "depois de publicada, não há como publicar de novo por engano");


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
