/**
 * Criador de campanhas — opções iguais às do Meta (28/11/2026): metas por objetivo, "Onde as pessoas continuam"
 * (WhatsApp, Messenger, Direct) e formulário no anúncio. Supabase simulado; nada é criado no Meta.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLIENT = { id: "55555555-5555-4555-8555-555555555555", name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null,
  notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null, excluded_at: null };
const ACCOUNT = { id: "a0000000-0000-4000-8000-000000000001", platform_id: "meta", external_id: "1001", client_id: CLIENT.id, connection_id: null, name: "Excalibur - Principal",
  currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", raw_status: "account_status=1", status_reason: null, business_name: "BM Agência", is_prepay: null,
  manager_customer_id: null, is_test_account: null, linked_at: "2026-09-25T00:00:00Z", details_updated_at: "2026-09-25T00:00:00Z", unlinked_at: null, assets: [] };

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ ...CLIENT });
db.adAccounts.push({ ...ACCOUNT });
const draft = { id: "d0000000-0000-4000-8000-000000000002", client_id: CLIENT.id, ad_account_id: ACCOUNT.id, name: "Destinos", data: {}, version: 1,
  archived_at: null, created_by: null, updated_by: null, created_at: "2026-11-28T10:00:00Z", updated_at: "2026-11-28T10:00:00Z" };
db.builderDrafts.push(draft);

await login(page, `/criar-campanhas/${draft.id}`);
await page.getByLabel("Nome da campanha").fill("Conversas");
await page.getByLabel("Objetivo").selectOption("OUTCOME_TRAFFIC");
const metas = await page.getByRole("button", { name: "Adicionar conjunto" }).click().then(() => page.getByTestId("cb-conjunto").first().getByLabel("Meta de otimização").locator("option").allTextContents());
const tem = (t) => metas.some((m) => m.startsWith(t));
check(tem("Cliques no link") && tem("Conversas (mensagens)") && tem("Visitas ao perfil"), "Tráfego mostra as metas do Meta (inclui Conversas e Visitas ao perfil)");
check(metas.some((m) => m.includes("Visitas ao perfil") && m.includes("ainda não publica")), "meta que o Publicar ainda não monta vem marcada");
check(!tem("Geração de leads"), "Geração de leads não aparece em Tráfego (o Meta não oferece)");

const set = page.getByTestId("cb-conjunto").first();
await set.getByLabel("Meta de otimização").selectOption("CONVERSATIONS");
const destinos = await set.getByLabel("Onde as pessoas continuam").locator("option").allTextContents();
check(destinos.join(",") === "Escolha...,WhatsApp,Messenger,Direct do Instagram", "Conversas oferece WhatsApp, Messenger e Direct");
check((await set.getByLabel("Onde as pessoas continuam").inputValue()) === "WHATSAPP", "o destino padrão já vem escolhido (WhatsApp)");

await set.getByRole("button", { name: "Adicionar anúncio" }).click();
const ad = page.getByTestId("cb-anuncio").first();
await ad.getByTestId("cb-destino-mensagem").waitFor();
check((await ad.getByLabel("Link de destino").count()) === 0 && (await ad.getByLabel("Botão (CTA)").count()) === 0, "destino de mensagem: sem link e sem botão para preencher");

// Em Cadastros, Conversas só aceita WhatsApp; Geração de leads usa o formulário no anúncio
await page.getByLabel("Objetivo").selectOption("OUTCOME_LEADS");
await set.getByLabel("Meta de otimização").selectOption("CONVERSATIONS");
const soWhats = await set.getByLabel("Onde as pessoas continuam").locator("option").allTextContents();
check(soWhats.join(",") === "Escolha...,WhatsApp", "em Cadastros, Conversas só aceita destinos com WhatsApp");
await set.getByLabel("Meta de otimização").selectOption("LEAD_GENERATION");
await ad.getByLabel("ID do formulário de cadastro").fill("12a3456789012");
check((await ad.getByLabel("ID do formulário de cadastro").inputValue()) === "123456789012", "o ID do formulário aceita só números");
check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
console.log("criador-destinos: OK");
