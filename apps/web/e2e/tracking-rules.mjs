/**
 * Teste de navegador — Tracking T2: regras do site sem Tag Manager (23/10/2026).
 * 1) Tela do CRM: criar regras (formulário com "Tipo de cliente = Lojista", outros como evento personalizado,
 *    compra da página de obrigado sem reenviar ao Meta), validar, publicar, testar endereço, ordem, voltar versão;
 *    visualizador só vê.
 * 2) Script t.js num site fictício recebendo as regras publicadas: lojista vira Lead (e o Pixel dispara Lead),
 *    sacoleiro vira "LeadOutros", compra lida da página com nº do pedido e sem Pixel, compra sem valor não sai,
 *    clique em botão, troca de página sem recarregar.
 * Supabase SIMULADO (support.mjs).
 */
import { createHash } from "node:crypto";
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const CLI = "e0000000-0000-4000-8000-000000004401";
const client = { id: CLI, name: "Loja Atacado", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null };
const container = { id: "t-regras", client_id: CLI, name: "Loja Atacado", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
  status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null };

// ---------------------------------------------------------------------------
// 1) Tela do CRM
// ---------------------------------------------------------------------------
let published = null;
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push(client);
  db.trackingContainers.push({ ...container });
  await login(page, "/tracking");
  await page.getByRole("button", { name: "Regras do site: Loja Atacado" }).click();
  await page.getByTestId("rules-modal").waitFor();
  check((await page.getByTestId("rules-status").innerText()).includes("Nenhuma versão publicada") && await page.getByTestId("rules-publish").isDisabled(),
    "sem regras: nenhuma versão publicada e nada para publicar");

  // Regra 1: formulário, Tipo de cliente = Lojista → Lead
  await page.getByTestId("rule-new").click();
  await page.getByLabel("Nome da regra").fill("Lead lojista");
  await page.getByLabel(/Só quando um campo/).check();
  await page.getByLabel("Nome do campo").fill("Tipo de cliente");
  await page.getByLabel("Respostas que contam").fill("Lojista");
  await page.getByTestId("rule-save").click();
  await page.getByTestId("rules-modal").waitFor();
  // Regra 2: qualquer outro formulário → Lead no CRM, "LeadOutros" no Meta
  await page.getByTestId("rule-new").click();
  await page.getByLabel("Nome da regra").fill("Outros tipos");
  await page.getByLabel("Enviar com outro nome (evento personalizado)").check();
  await page.getByLabel("Nome no Meta").fill("LeadOutros");
  await page.getByTestId("rule-save").click();
  await page.getByTestId("rules-modal").waitFor();
  // Regra 3: página de obrigado → Compra, valor lido da página, sem reenviar ao Meta
  await page.getByTestId("rule-new").click();
  await page.getByLabel("Nome da regra").fill("Compra da loja");
  await page.getByLabel("Quando", { exact: true }).selectOption("pagina");
  await page.getByLabel("Endereço (ou parte dele)").fill("/obrigado");
  await page.getByLabel("Evento", { exact: true }).selectOption("Purchase");
  await page.getByTestId("rule-save").click();
  await page.getByText("Compra precisa de valor").waitFor();
  check(db.trackingRules.length === 2, "compra sem valor: a tela avisa e não salva");
  await page.getByLabel("Valor", { exact: true }).selectOption("pagina");
  await page.getByLabel("Onde está o valor").fill(".total");
  await page.getByLabel(/Nº do pedido vem do parâmetro/).fill("pedido");
  await page.getByLabel("Não enviar ao Meta (só registrar no CRM)").check();
  await page.screenshot({ path: `${SHOTS}/regras-formulario.png`, fullPage: true });
  await page.getByTestId("rule-save").click();
  await page.getByTestId("rules-modal").waitFor();

  const summaries = await page.getByTestId("rule-summary").allInnerTexts();
  check(summaries.length === 3 && summaries[0] === 'Quando enviar qualquer formulário com "Tipo de cliente" = "Lojista" → Lead (vai ao Meta)'
    && summaries[1].includes('vai ao Meta como "LeadOutros"') && summaries[2] === 'Quando o endereço contém "/obrigado" → Compra (não vai ao Meta)',
    `lista das regras com resumo em português (${summaries.join(" | ")})`);
  check((await page.getByTestId("rules-status").innerText()).includes("Mudanças não publicadas"), "aviso de mudanças não publicadas");

  // Publicar
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("rules-publish").click();
  await page.getByText("Versão publicada: 1").waitFor();
  const v1 = db.trackingRuleVersions.find((v) => v.version === 1);
  check(v1.rules.map((r) => r.name).join(",") === "Lead lojista,Outros tipos,Compra da loja" && v1.rules[0].field_values[0] === "Lojista"
    && v1.rules[1].meta_event === "LeadOutros" && v1.rules[2].meta_mode === "nao_enviar" && v1.rules[2].order_param === "pedido",
    "versão 1 publicada na ordem, com as escolhas de cada regra");
  check(await page.getByTestId("rules-publish").isDisabled(), "depois de publicar, nada pendente");
  published = v1.rules;

  // Testar endereço
  await page.getByLabel("Testar endereço (regras de página do rascunho)").fill("https://loja.com.br/obrigado?pedido=9");
  check((await page.getByTestId("rules-test-result").innerText()).includes("Compra da loja"), "testar endereço: mostra a regra de página que dispara");
  await page.getByLabel("Testar endereço (regras de página do rascunho)").fill("https://loja.com.br/contato");
  check((await page.getByTestId("rules-test-result").innerText()).includes("Nenhuma regra"), "testar endereço: nenhuma regra numa página comum");
  await page.screenshot({ path: `${SHOTS}/regras-do-site.png`, fullPage: true });

  // Ordem e desligar → versão 2
  await page.getByRole("button", { name: "Descer Lead lojista" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=rule-row]")[0]?.textContent.includes("Outros tipos"));
  check(true, "mudar a ordem das regras (setas)");
  await page.getByRole("button", { name: "Subir Lead lojista" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=rule-row]")[0]?.textContent.includes("Lead lojista"));
  await page.getByTestId("rule-row").filter({ hasText: "Compra da loja" }).getByRole("button", { name: "Desligar" }).click();
  await page.getByTestId("rule-row").filter({ hasText: "Compra da loja" }).getByText("Desligada").waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("rules-publish").click();
  await page.getByText("Versão publicada: 2").waitFor();
  check(db.trackingRuleVersions.find((v) => v.version === 2).rules.length === 2, "regra desligada fica fora da versão 2");

  // Voltar para a versão 1 → versão 3
  await page.getByText("Versões publicadas").click();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("rule-versions").getByRole("listitem").filter({ hasText: "Versão 1 ·" }).getByRole("button", { name: /Voltar para esta/ }).click();
  await page.getByText("Versão publicada: 3").waitFor();
  const v3 = db.trackingRuleVersions.find((v) => v.version === 3);
  check(v3.restored_from === 1 && v3.rules.length === 3 && db.trackingRules.filter((r) => r.archived_at).length === 3,
    "voltar versão: versão 3 = versão 1, regras antigas arquivadas (não apagadas)");
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Regras do site: Loja Atacado" }).waitFor();
  check((await page.getByRole("button", { name: "Regras do site: Loja Atacado" }).innerText()).includes("versão 3"), "card do site mostra a versão no ar");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Visualizador: vê as regras, não cria nem publica
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  db.clients.push(client);
  db.trackingContainers.push({ ...container, rules_version: 1 });
  db.trackingRules.push({ ...published[0], container_id: container.id, client_id: CLI, position: 0, enabled: true, archived_at: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" });
  db.trackingRuleVersions.push({ container_id: container.id, version: 1, rules: [published[0]], rules_count: 1, restored_from: null, published_at: "2026-10-02T00:00:00Z" });
  await login(page, "/tracking");
  await page.getByRole("button", { name: "Regras do site: Loja Atacado" }).click();
  await page.getByTestId("rule-row").waitFor();
  check(await page.getByTestId("rule-new").count() === 0 && await page.getByTestId("rules-publish").count() === 0
    && await page.getByRole("button", { name: /Arquivar/ }).count() === 0, "visualizador só vê (sem criar, arquivar ou publicar)");
  check(errors.length === 0, "sem erros no navegador (visualizador)");
  await browser.close();
}

// ---------------------------------------------------------------------------
// 2) Script t.js com as regras publicadas
// ---------------------------------------------------------------------------
const KEY = "bf_0123456789abcdef01234567";
const SITE = "https://www.site-teste.example";
const ENDPOINT = "https://coletor.teste.example/track";
const SCRIPT_URL = "https://cdn.teste.example/t.js";
const SCRIPT = await (await fetch(`${BASE}/t.js`)).text();
const RULES = [
  ...published,
  { id: "r-agendar", name: "Agendar", kind: "clique", match_op: "contem", click_by: "texto", match_text: "Agendar visita", event_name: "Schedule", meta_mode: "mesmo", value_mode: "nenhum" },
];
const FBQ = "<script>window.__fb = []; window.fbq = function () { window.__fb.push([].slice.call(arguments)); };</script>";
const html = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Site</title>${FBQ}
<script async src="${SCRIPT_URL}" data-key="${KEY}" data-endpoint="${ENDPOINT}" data-pixel="123456789"></script></head><body>${body}</body></html>`;
const FORM_SELECT = `<form id="contato" onsubmit="event.preventDefault()">
  <label for="em">E-mail</label><input id="em" type="email" name="email">
  <label for="tc">Tipo de cliente</label><select id="tc" name="form_fields[tipo]"><option value="">Escolha</option><option>Lojista</option><option>Sacoleiro</option><option>Cliente final</option></select>
  <button>Enviar</button></form>`;
const FORM_RADIO = `<form onsubmit="event.preventDefault()"><div class="grupo"><label>Tipo de cliente *</label>
  <span><input type="radio" name="t" id="r1" value="l"><label for="r1">Lojísta</label></span>
  <span><input type="radio" name="t" id="r2" value="s"><label for="r2">Sacoleiro</label></span></div>
  <input type="tel" name="telefone" aria-label="WhatsApp"><button>Quero revender</button></form>`;

async function site(page, sent, markup, rules = RULES) {
  await page.route(`${SITE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: markup }));
  await page.route(SCRIPT_URL, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: SCRIPT }));
  await page.route(`${ENDPOINT}**`, (route) => route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ v: 3, r: rules }) })
    : route.fulfill({ status: 204 }));
  page.on("request", (r) => { if (r.url().startsWith(ENDPOINT) && r.method() === "POST") sent.push(JSON.parse(r.postData())); });
}
const waitFor = async (page, fn, ms = 4000) => {
  for (let i = 0; i < ms / 100 && !fn(); i++) await page.waitForTimeout(100);
  return fn();
};
const rulesLoaded = (page) => page.waitForFunction(() => performance.getEntriesByType("resource").some((e) => e.name.includes("/track?k=")));

{
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html(FORM_SELECT));
  await page.goto(`${SITE}/`);
  await rulesLoaded(page);
  await page.getByLabel("E-mail").fill("Ana@Loja.com ");
  await page.getByLabel("Tipo de cliente").selectOption("Lojista");
  sent.length = 0;
  await page.getByRole("button", { name: "Enviar" }).click();
  await waitFor(page, () => sent.some((b) => b.n === "Lead"));
  const lead = sent.find((b) => b.n === "Lead");
  check(lead && lead.cd.resposta === "Lojista" && !lead.cd.bf_meta && lead.cd.bf_regra === "Lead lojista" && lead.ud?.em === sha("ana@loja.com"),
    "formulário com Lojista → Lead, com a resposta e o e-mail só em hash");
  const fb1 = await page.evaluate(() => window.__fb.filter((c) => c[0] === "track" || c[0] === "trackCustom"));
  check(fb1.some((c) => c[0] === "track" && c[1] === "Lead" && c[3]?.eventID === lead.e && !("bf_regra" in c[2])), "Pixel do navegador: Lead com o mesmo event_id (sem os campos internos)");

  await page.getByLabel("Tipo de cliente").selectOption("Sacoleiro");
  sent.length = 0;
  await page.getByRole("button", { name: "Enviar" }).click();
  await waitFor(page, () => sent.some((b) => b.n === "Lead"));
  const other = sent.find((b) => b.n === "Lead");
  check(other && other.cd.bf_meta === "LeadOutros" && !other.cd.resposta, "sacoleiro → Lead no CRM marcado para ir ao Meta como LeadOutros");
  const fb2 = await page.evaluate(() => window.__fb.filter((c) => c[0] === "trackCustom"));
  check(fb2.some((c) => c[1] === "LeadOutros"), "Pixel do navegador: LeadOutros como evento personalizado (não treina o Lead)");

  // Clique em botão pelo texto (duplo clique conta uma vez)
  await page.evaluate(() => { const b = document.createElement("button"); b.textContent = "Agendar visita"; document.body.appendChild(b); });
  sent.length = 0;
  await page.getByRole("button", { name: "Agendar visita" }).dblclick();
  await waitFor(page, () => sent.some((b) => b.n === "Schedule"));
  await page.waitForTimeout(300);
  check(sent.filter((b) => b.n === "Schedule").length === 1, "clique no botão \"Agendar visita\" → Agendamento (duplo clique conta 1)");

  // Troca de página sem recarregar → regra de página
  sent.length = 0;
  await page.evaluate(() => {
    const t = document.createElement("div"); t.className = "total"; t.textContent = "Total: R$ 1.234,56"; document.body.appendChild(t);
    history.pushState({}, "", "/obrigado?pedido=A77");
  });
  await waitFor(page, () => sent.some((b) => b.n === "Purchase"));
  const buy = sent.find((b) => b.n === "Purchase");
  check(buy && buy.cd.value === 1234.56 && buy.cd.currency === "BRL" && buy.cd.transaction_id === "A77" && buy.cd.bf_meta === "nao_enviar",
    "página de obrigado → Compra com valor lido da página e nº do pedido, marcada para não ir ao Meta");
  const fb3 = await page.evaluate(() => window.__fb.filter((c) => c[1] === "Purchase"));
  check(fb3.length === 0, "compra \"não enviar\": o Pixel do navegador também não dispara");
  check(errors.length === 0, `sem erros no navegador (site) ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Rádio com rótulo do grupo e acento diferente; telefone em hash
  const { browser, page } = await launch();
  const sent = [];
  await site(page, sent, html(FORM_RADIO));
  await page.goto(`${SITE}/`);
  await rulesLoaded(page);
  await page.getByLabel("WhatsApp").fill("(45) 99999-8888");
  await page.getByLabel("Lojísta").check();
  sent.length = 0;
  await page.getByRole("button", { name: "Quero revender" }).click();
  await waitFor(page, () => sent.some((b) => b.n === "Lead"));
  const lead = sent.find((b) => b.n === "Lead");
  check(lead && lead.cd.resposta === "Lojista" && lead.ud?.ph === sha("5545999998888"), "rádio \"Lojísta\" no grupo \"Tipo de cliente *\" → Lead lojista (telefone em hash)");
  await browser.close();
}

{
  // Página de obrigado sem o valor na página: compra não sai (nada inventado)
  const { browser, page } = await launch();
  const sent = [];
  await site(page, sent, html("<h1>Obrigado!</h1>"));
  await page.goto(`${SITE}/obrigado?pedido=B1`);
  await rulesLoaded(page);
  await waitFor(page, () => sent.some((b) => b.n === "PageView"));
  await page.waitForTimeout(800);
  check(!sent.some((b) => b.n === "Purchase"), "compra sem valor encontrado na página não é enviada");
  await browser.close();
}

{
  // Sem regras publicadas: formulário sem a opção automática continua sem captura (comportamento antigo)
  const { browser, page } = await launch();
  const sent = [];
  await site(page, sent, html(FORM_SELECT), []);
  await page.goto(`${SITE}/`);
  await rulesLoaded(page);
  await page.getByLabel("E-mail").fill("ana@x.com");
  await page.getByLabel("Tipo de cliente").selectOption("Lojista");
  sent.length = 0;
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForTimeout(600);
  check(sent.length === 0, "sem regras publicadas, nada muda no site");
  await browser.close();
}

console.log("Tracking T2 (regras sem Tag Manager): tudo certo.");
