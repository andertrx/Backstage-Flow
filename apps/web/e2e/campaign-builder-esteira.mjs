/**
 * Fase J.2 — Esteira de criativos: subir criativos num conjunto que já existe.
 * Supabase e Meta simulados. Nada é criado no Meta de verdade.
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
db.campaigns.push({ id: "c1000000-0000-4000-8000-000000000001", ad_account_id: ACCOUNT.id, client_id: CLIENT.id, platform_id: "meta", external_id: "120250000000001", name: "STG | CP-7.6 | ENG | WHATS | ATACADO", effective_status: "ACTIVE" });
db.adGroups.push({ id: "g1000000-0000-4000-8000-000000000001", campaign_id: "c1000000-0000-4000-8000-000000000001", ad_account_id: ACCOUNT.id, client_id: CLIENT.id, platform_id: "meta", external_id: "120250174283950625", name: "CJ-03 | SEMELHANTE | NORTE/NORDESTE", effective_status: "ACTIVE" });
db.ads.push({ id: "e1000000-0000-4000-8000-000000000001", ad_group_id: "g1000000-0000-4000-8000-000000000001", campaign_id: "c1000000-0000-4000-8000-000000000001", ad_account_id: ACCOUNT.id, client_id: CLIENT.id, platform_id: "meta", external_id: "120250174283910625", name: "[AD-10] BLACK | 15/11/2026", effective_status: "ACTIVE" });

await login(page, "/criar/campanhas");
await page.getByTestId("cb-subir-criativos").click();
await page.getByLabel("Nome do rascunho").fill("Criativos Black — semana 2");
await page.getByLabel("Conta de anúncio (Meta)").selectOption(ACCOUNT.id);
await page.getByRole("button", { name: "Começar" }).click();
await page.getByRole("heading", { name: "Subir criativos", exact: true }).waitFor();
check(page.url().includes("/criar/esteira/"), "abre o editor da esteira");
check(db.builderDrafts[0].data.kind === "esteira", "o rascunho nasce como esteira");
const checklist = page.getByTestId("es-checklist");
check(await checklist.getByText("Escolha o conjunto", { exact: false }).first().isVisible(), "conferência pede o conjunto");

// 1. Onde: conjunto que já existe; o CRM lê o destino e avisa das automações do conjunto sem mexer nele.
await page.getByLabel("Conjunto que vai receber os criativos").selectOption("120250174283950625");
await page.getByTestId("es-conjunto").waitFor();
check(await page.getByTestId("es-conjunto").getByText("WhatsApp").isVisible(), "mostra o destino do conjunto (WhatsApp)");
check(await page.getByTestId("es-conjunto-automacoes").isVisible(), "avisa que o conjunto tem Advantage+ e posicionamentos automáticos");

// 2. Textos do anúncio-modelo
await page.getByLabel("Anúncio-modelo (opcional)").selectOption("120250174283910625");
await page.getByRole("button", { name: "Copiar textos" }).click();
await page.waitForFunction(() => document.querySelector('[aria-label="Texto principal 3"]')?.value?.includes("Lojista"));
check((await page.getByTestId("es-padrao-titulos").getByRole("textbox").count()) === 3, "copiou 3 títulos do anúncio-modelo");
check(await page.getByTestId("es-controle").getByRole("checkbox").first().isChecked() === false, "melhorias automáticas vêm desligadas");

// 3. Drive: pares pelo formato real do arquivo
await page.getByLabel("Link da pasta do Drive").fill("https://drive.google.com/drive/folders/esteira123456");
await page.getByRole("button", { name: "Ler pasta" }).click();
const props = page.getByTestId("es-propostas");
await props.waitFor();
check((await props.getByRole("listitem").count()) === 3, "3 criativos propostos (1 par, 1 vídeo sozinho, 1 imagem)");
check(await props.getByText("Feed + vertical").isVisible(), "juntou OFERTA-01 vertical + 4:5");
await page.getByTestId("es-adicionar").click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="es-criativo"]').length === 3);
const first = page.getByTestId("es-criativo").first();
check((await first.getByLabel("Nome do anúncio").inputValue()) === "OFERTA-01", "nome do anúncio vem do nome do arquivo");
check(await first.getByTestId("es-midia-vertical").getByText("OFERTA-01_9x16.mp4").isVisible(), "vertical no lugar certo");
check((await first.getByTestId("es-textos").getByRole("textbox").count()) === 3, "cada criativo já vem com os 3 textos padrão");

// Trocar um texto só de um criativo
await page.getByTestId("es-criativo").nth(1).getByRole("textbox", { name: "Texto principal 1" }).fill("Texto só deste criativo");
await page.waitForFunction(() => document.querySelector('[data-testid="es-estado"]')?.textContent === "Salvo", null, { timeout: 8000 });
const saved = db.builderDrafts[0].data;
check(saved.items.length === 3 && saved.items[0].feed.fileId === "vidFeed123456789" && saved.items[0].vertical.fileId === "vidVertical12345", "salvou os pares no rascunho");
check(saved.items[1].bodies[0] === "Texto só deste criativo" && saved.items[0].bodies[0].startsWith("Revenda"), "texto trocado só no criativo escolhido");

// 4. Enviar arquivos e subir
check(await page.getByTestId("es-subir").isDisabled(), "não sobe antes de enviar os arquivos ao Meta");
check(await page.getByTestId("es-bloqueios").getByText("ainda não foram enviados", { exact: false }).isVisible(), "explica que falta enviar os arquivos");
// Vídeo grande (J.4): vai em partes; um erro no meio para o envio e o próximo clique continua de onde parou.
db.metaBuilder.uploadFailOnce = "vidVertical12345";
await page.getByTestId("es-enviar-arquivos").click();
await page.getByText("O Meta recusou uma parte do vídeo.", { exact: false }).waitFor({ timeout: 8000 });
check(await page.getByText("Clique de novo para continuar de onde parou", { exact: false }).isVisible(), "erro no meio do envio explica que dá para continuar");
await page.getByTestId("es-checklist").screenshot({ path: `${SHOTS}/35-16-videos-grandes.png` });
check(db.metaBuilder.uploads.vidVertical12345.sent === 0 && db.metaBuilder.uploads.vidFeed123456789.sent > 0, "o vídeo do Feed terminou; o vertical parou no erro");
await page.getByTestId("es-enviar-arquivos").click();
await page.waitForFunction(() => !document.querySelector('[data-testid="es-enviar-arquivos"]'), null, { timeout: 10000 });
check(db.metaBuilder.uploads.vidFeed123456789.calls === 2, "o vídeo já enviado não foi enviado de novo");
check((db.metaBuilder.prepared ?? []).length === 4, "enviou 4 arquivos (cada um uma vez)");
await page.waitForFunction(() => document.querySelector('[data-testid="es-estado"]')?.textContent === "Salvo", null, { timeout: 8000 });
check(db.builderDrafts[0].data.items[0].vertical.metaVideoId !== "", "guardou o código do vídeo no rascunho");
await page.screenshot({ path: `${SHOTS}/35-13-esteira.png`, fullPage: true });

await page.getByTestId("es-subir").click();
check((await page.getByTestId("confirm-dialog").innerText()).includes("PAUSADO"), "confirmação diz que sai pausado e o conjunto não muda");
await page.getByTestId("confirm-ok").click();
await page.getByTestId("es-publicacao-status").waitFor({ timeout: 8000 });
check((await page.getByTestId("es-publicacao-status").textContent()) === "Criativos criados (pausados)", "subiu tudo pausado");
check((await page.getByTestId("es-publicacao").locator('[data-status="criado"]').count()) === 6, "3 criativos + 3 anúncios criados");
check((await page.getByTestId("es-publicacao").getByTestId("cb-automacoes-ok").count()) === 3, "leitura de volta: nenhuma melhoria ligada nos 3 criativos");
check(db.metaBuilder.esteiraPublished?.[0]?.target?.adSetId === "120250174283950625", "subiu no conjunto escolhido");

// A lista de rascunhos abre o editor certo
await page.getByRole("link", { name: "Rascunhos" }).click();
await page.getByText("Subir criativos", { exact: true }).last().waitFor();
check(await page.getByTestId("builder-rascunhos").getByText("Subir criativos").isVisible(), "lista marca a esteira");

check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();
console.log("campaign-builder-esteira: ok");
