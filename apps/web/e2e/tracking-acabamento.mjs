/**
 * Teste de navegador — T5.35 (etapa 5): acabamento do Tracking.
 *  1) Site e conexão sem uso ganham aviso com a data ("sem uso desde 05/11/2026").
 *  2) O testador de link mostra a campanha, o conjunto e o criativo que o link traz.
 * Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const CLI = "e0000000-0000-4000-8000-000000000002";
const CON = "00000000-0000-4000-8000-0000000000c1";
const CAMP = "00000000-0000-4000-8000-0000000000a1";
const GROUP = "00000000-0000-4000-8000-0000000000b1";
const AD = "00000000-0000-4000-8000-0000000000d1";
const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });

function seed(db) {
  db.clients.push(client(EXC, "Excalibur Fitness"));
  db.clients.push(client(CLI, "Loja Aurora"));
  // Dois sites: um nunca recebeu nada, outro parou há 20 dias.
  db.trackingContainers.push({ id: "t1", client_id: EXC, name: "excalibur.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["excalibur.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.trackingContainers.push({ id: "t2", client_id: CLI, name: "aurora.com.br", public_key: "bf_0123456789abcdef01234568", allowed_domains: ["aurora.com.br"],
    status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
  db.trackingEvents.push({ event_id: "e1", container_id: "t2", event_name: "PageView", occurred_at: dias(20), page_path: "/", test: false, touchpoint_id: null, session_id: "s1", visitor_id: "v1" });

  // Uma conexão de WhatsApp que não recebe mensagem há 20 dias.
  db.whatsappConnections.push({ id: CON, container_id: "t1", phone_number_id: "100000000000009", waba_id: "100000000000010",
    enabled: true, last_webhook_at: dias(20), last_error_at: null, last_error_message: null });

  // O que o link do anúncio traz: campanha, conjunto e criativo.
  db.campaigns.push({ id: CAMP, ad_account_id: "acc1", client_id: EXC, platform_id: "meta", external_id: "120001", name: "Black Friday", status: "ativa" });
  db.adGroups.push({ id: GROUP, campaign_id: CAMP, ad_account_id: "acc1", client_id: EXC, platform_id: "meta", external_id: "130001", name: "Aberto 25-45", status: "ativa" });
  db.ads.push({ id: AD, ad_group_id: GROUP, campaign_id: CAMP, ad_account_id: "acc1", client_id: EXC, platform_id: "meta", external_id: "140001",
    name: "Foto academia", status: "ativa", creative_type: "imagem", thumbnail_url: null });
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/tracking?secao=config");
  const escolher = async (id) => {
    await page.getByTestId("tracking-client").selectOption(id);
    await page.waitForTimeout(400);
  };

  // 1) Site sem uso: um nunca recebeu evento, outro parou há 20 dias.
  await escolher(EXC);
  await page.getByTestId("container-card").first().waitFor();
  const t1 = page.getByTestId("container-card").filter({ hasText: "excalibur.com.br" });
  check((await t1.getByTestId("container-sem-uso").innerText()).includes("Nunca recebeu evento"), "site que nunca recebeu evento: o aviso diz isso");
  check((await t1.getByTestId("container-last-event").innerText()).includes("Nenhum evento recebido ainda"), "site sem evento avisa para conferir a instalação");

  await escolher(CLI);
  const t2 = page.getByTestId("container-card").filter({ hasText: "aurora.com.br" });
  await t2.waitFor();
  const semUso = await t2.getByTestId("container-sem-uso").innerText();
  check(semUso.includes("Sem uso desde"), "site parado há mais de 7 dias: o aviso diz que está sem uso");
  const dataEsperada = new Date(Date.now() - 20 * 86400000).toLocaleDateString("pt-BR");
  check(semUso.includes(dataEsperada), `o aviso diz desde quando (${dataEsperada})`);
  check((await t2.getByTestId("container-last-event").innerText()).includes(dataEsperada), "a linha do último evento também mostra a data");
  await t2.screenshot({ path: `${SHOTS}/tracking-site-sem-uso.png` });

  // 2) Conexão de WhatsApp sem uso.
  await escolher(EXC);
  const conexao = page.getByTestId("wa-connection-row").first();
  await conexao.waitFor();
  check((await conexao.getByTestId("wa-sem-uso").innerText()).includes("Sem uso desde"), "conexão de WhatsApp sem uso: o aviso diz desde quando");

  // 3) O testador de link mostra a campanha, o conjunto e o criativo.
  const tester = page.getByLabel("Testar link");
  await tester.getByLabel("URL de destino").fill("https://excalibur.com.br/?utm_source=facebook&bf_c=120001&bf_s=130001&bf_a=140001");
  await tester.getByRole("button", { name: "Testar" }).click();
  const anuncio = page.getByTestId("link-anuncio");
  await anuncio.waitFor();
  await anuncio.getByText("Black Friday").waitFor();
  const txt = (await anuncio.innerText()).replace(/ /g, " ");
  check(txt.includes("Campanha:") && txt.includes("Black Friday"), "o link mostra a campanha do CRM pelo ID");
  check(txt.includes("Conjunto:") && txt.includes("Aberto 25-45"), "o link mostra o conjunto (ad set) do CRM");
  check(txt.includes("Criativo (anúncio):") && txt.includes("Foto academia"), "o link mostra o criativo (anúncio) do CRM");
  check(txt.includes("imagem"), "o link mostra o tipo do criativo");
  await page.getByLabel("Testar link").screenshot({ path: `${SHOTS}/tracking-link-anuncio.png` });

  // ID que não está no CRM: a tela diz que não está (não inventa nome).
  await tester.getByLabel("URL de destino").fill("https://excalibur.com.br/?bf_c=999999");
  await tester.getByRole("button", { name: "Testar" }).click();
  await page.getByTestId("link-anuncio").waitFor();
  await page.getByTestId("link-anuncio").getByText("não encontrada no CRM").waitFor();
  const txt2 = (await page.getByTestId("link-anuncio").innerText()).replace(/ /g, " ");
  check(txt2.includes("999999") && txt2.includes("não encontrada no CRM"), "ID que não está no CRM: a tela avisa, sem inventar nome");

  await page.screenshot({ path: `${SHOTS}/tracking-acabamento.png`, fullPage: true });
  check(errors.length === 0, `sem erros na página${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

console.log("acabamento: OK");
