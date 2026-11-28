/**
 * Fase J.5 — Modelos de campanha: copiar campanha do Meta, salvar como modelo e usar o modelo em outra conta.
 * Supabase e Meta simulados. Nada é criado no Meta.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLIENT = { id: "55555555-5555-4555-8555-555555555555", name: "Vonks", company: null, cnpj: null, owner_name: null, phone: null, email: null,
  notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null, excluded_at: null };
const CLIENT2 = { ...CLIENT, id: "66666666-6666-4666-8666-666666666666", name: "Acelera Atacado" };
const acc = (id, client, name) => ({ id, platform_id: "meta", external_id: id.slice(-6), client_id: client, connection_id: null, name, currency: "BRL", timezone: "America/Sao_Paulo",
  status: "ativa", raw_status: "account_status=1", status_reason: null, business_name: "BM", is_prepay: null, manager_customer_id: null, is_test_account: null,
  linked_at: "2026-09-25T00:00:00Z", details_updated_at: "2026-09-25T00:00:00Z", unlinked_at: null, assets: [] });
const A1 = acc("a0000000-0000-4000-8000-000000000001", CLIENT.id, "CA - Vonks");
const A2 = acc("a0000000-0000-4000-8000-000000000002", CLIENT2.id, "CA - Acelera");

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ ...CLIENT }, { ...CLIENT2 });
db.adAccounts.push(A1, A2);
db.campaigns.push({ id: "c1000000-0000-4000-8000-000000000001", ad_account_id: A1.id, client_id: CLIENT.id, platform_id: "meta", external_id: "120250000000001", name: "STG | CP-7.6 | ENG | WHATS", effective_status: "ACTIVE" });

await login(page, "/criar/campanhas");
const card = page.getByTestId("modelos");
await card.waitFor();
await card.getByText("Nenhum modelo ainda.", { exact: false }).waitFor({ timeout: 5000 });
check(true, "começa sem modelos");

// Copiar campanha do Meta → rascunho + modelo
await page.getByTestId("modelo-copiar-abrir").click();
const dlg = page.getByTestId("modelo-copiar");
await dlg.getByLabel("Conta de anúncio").selectOption(A1.id);
await dlg.getByLabel("Campanha").selectOption("120250000000001");
await dlg.getByRole("button", { name: "Ler campanha no Meta" }).click();
await dlg.getByTestId("modelo-lido").waitFor();
check(await dlg.getByText("1 conjunto(s) · 1 anúncio(s)", { exact: false }).isVisible(), "mostra o resumo da campanha lida");
check(await dlg.getByTestId("modelo-notas").getByText("DESLIGADAS", { exact: false }).isVisible(), "avisa que as melhorias do original não são copiadas");
check(await dlg.getByTestId("modelo-notas").getByText("escolhido de novo no Drive", { exact: false }).isVisible(), "avisa que a mídia precisa ser escolhida de novo");
await page.screenshot({ path: `${SHOTS}/35-15-modelos.png`, fullPage: true });
await dlg.getByRole("checkbox").check();
await dlg.getByTestId("modelo-criar-rascunho").click();
await page.getByLabel("Nome da campanha").waitFor();
check(page.url().includes("/criar/campanhas/"), "abriu o rascunho copiado");
check((await page.getByLabel("Nome da campanha").inputValue()) === "STG | CP-7.6 | ENG | WHATS (cópia)", "rascunho com o nome da campanha (cópia)");
check((await page.getByLabel("Status ao publicar").inputValue()) === "", "status não vem preenchido");
const t = db.builderTemplates[0];
check(t?.source === "meta" && t.data.adSets[0].pageId === "" && t.data.adSets[0].audienceIds.length === 0 && t.data.ads[0].pageId === "", "modelo salvo sem página e públicos da conta");
check(t.data.adSets[0].interests.length === 1 && t.data.ads[0].primaryText === "Revenda moda masculina", "modelo guarda interesses e textos");

// Salvar o rascunho como modelo pelo editor (nome repetido é recusado)
await page.getByTestId("cb-salvar-modelo").click();
const sv = page.getByTestId("modelo-salvar");
await sv.getByLabel("Nome do modelo").fill("STG | CP-7.6 | ENG | WHATS");
await sv.getByRole("button", { name: "Salvar modelo" }).click();
await sv.getByText("Já existe um modelo com esse nome.").waitFor();
check(true, "nome de modelo repetido é recusado");
await sv.getByLabel("Nome do modelo").fill("WhatsApp atacado — padrão");
check(await sv.getByTestId("modelo-notas").getByText("Página e Instagram", { exact: false }).isVisible(), "explica o que fica de fora do modelo");
await sv.getByRole("button", { name: "Salvar modelo" }).click();
await page.waitForFunction(() => !document.querySelector('[data-testid="modelo-salvar"]'));
check(db.builderTemplates.length === 2 && db.builderTemplates[1].source === "rascunho", "salvou o rascunho como modelo");

// Usar o modelo em OUTRA conta
await page.getByRole("link", { name: "Rascunhos" }).click();
await card.getByTestId("modelo").first().waitFor();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="modelo"]').length === 2, null, { timeout: 5000 });
check(true, "lista mostra os 2 modelos");
await card.getByRole("button", { name: "Usar STG | CP-7.6 | ENG | WHATS" }).click();
const use = page.getByTestId("modelo-usar");
await use.getByLabel("Conta de anúncio").selectOption(A2.id);
await use.getByRole("button", { name: "Criar rascunho" }).click();
await page.getByLabel("Nome da campanha").waitFor();
const novo = db.builderDrafts.find((d) => d.ad_account_id === A2.id);
check(novo && novo.data.campaign.objective === "OUTCOME_ENGAGEMENT" && novo.data.adSets[0].pageId === "", "rascunho na outra conta, com a estrutura e sem a página da conta original");

// Arquivar e desfazer
await page.getByRole("link", { name: "Rascunhos" }).click();
await card.getByRole("button", { name: "Arquivar WhatsApp atacado — padrão" }).click();
await page.getByTestId("confirm-ok").click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="modelo"]').length === 1);
check(db.builderTemplates[1].archived_at !== null, "arquivou sem apagar");
await page.getByRole("button", { name: "Desfazer" }).click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="modelo"]').length === 2);
check(db.builderTemplates[1].archived_at === null, "desfazer traz o modelo de volta");

check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();
console.log("campaign-builder-modelos: ok");
