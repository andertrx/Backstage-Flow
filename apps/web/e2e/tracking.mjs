/**
 * Teste de navegador da Etapa 34.1 — Tracking (tela no CRM + script t.js).
 * Supabase SIMULADO (support.mjs). O script roda num site fictício servido
 * pelo próprio teste; o envio dos eventos é interceptado (nada sai daqui).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

function seedClients(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
}

// ---------------------------------------------------------------------------
// 1) Tela do CRM (admin): criar container, código de instalação, origens
// ---------------------------------------------------------------------------
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seedClients(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();

  const links = await page.getByRole("navigation").first().getByRole("link").allInnerTexts();
  const labels = links.map((t) => t.trim().split("\n")[0]);
  check(labels.indexOf("Tracking") === labels.indexOf("Alertas") + 1, "menu: Tracking logo depois de Alertas");

  await page.getByRole("link", { name: "Tracking" }).first().click();
  await page.getByRole("heading", { name: "Tracking", level: 1 }).waitFor();
  await page.getByTestId("tracking-empty").waitFor();
  check(true, "sem containers: mensagem explicando o que fazer");

  await page.getByRole("button", { name: "Novo container" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo container de tracking" });
  await dialog.getByLabel("Cliente *").selectOption(EXC);
  await dialog.getByLabel("Nome do site *").fill("Loja Excalibur");
  await dialog.getByLabel("Domínios autorizados *").fill("https://www.Excalibur.com.br/loja\nlocalhost");
  await dialog.getByRole("button", { name: "Criar container" }).click();
  await dialog.getByText("Domínio inválido: localhost").waitFor();
  check(db.trackingContainers.length === 0, "domínio inválido: explica e não grava");

  await dialog.getByLabel("Domínios autorizados *").fill("https://www.Excalibur.com.br/loja\nexcalibur.com.br");
  check(await dialog.getByLabel("Modo teste").isChecked(), "container novo nasce em modo teste");
  await dialog.getByRole("button", { name: "Criar container" }).click();
  const install = page.getByRole("dialog", { name: "Instalar no site — Loja Excalibur" });
  await install.waitFor();
  const saved = db.trackingContainers[0];
  check(JSON.stringify(saved.allowed_domains) === JSON.stringify(["www.excalibur.com.br", "excalibur.com.br"]), "domínios gravados limpos (sem https e caminho)");
  check(saved.client_id === EXC && saved.test_mode === true && saved.consent_mode === "nao_exigir" && !("public_key" in db.rpcCalls.find((c) => c.fn === "tracking_containers.insert")), "a chave pública é gerada pelo banco, não pela tela");
  const blocks = await install.getByTestId("copy-block").allInnerTexts();
  check(blocks[0] === `<script async src="https://web-ivory-three-49.vercel.app/t.js" data-key="${saved.public_key}"></script>`, "código de instalação com a chave pública do container");
  check(blocks.some((b) => b.includes("bf_c={{campaign.id}}&bf_s={{adset.id}}&bf_a={{ad.id}}")), "parâmetros de URL do Meta com os IDs do anúncio");
  check(blocks.some((b) => b.startsWith("{lpurl}?utm_source=google")), "modelo de rastreamento do Google Ads");
  check(!blocks.join(" ").match(/service_role|secret|sb_secret|eyJ/), "nenhum segredo no código de instalação");
  await install.screenshot({ path: `${SHOTS}/tracking-instalar.png` });
  await install.getByRole("button", { name: "Fechar", exact: true }).click();

  const card = page.getByTestId("container-card");
  await card.waitFor();
  check((await card.innerText()).includes("Nenhum evento recebido ainda"), "container sem eventos avisa para conferir a instalação");

  // Editar: pausar
  await page.getByRole("button", { name: "Editar Loja Excalibur" }).click();
  const edit = page.getByRole("dialog", { name: "Editar container" });
  check(await edit.getByLabel("Cliente *").isDisabled(), "cliente do container não muda depois de criado");
  await edit.getByLabel("Situação").selectOption("pausado");
  await edit.getByRole("button", { name: "Salvar" }).click();
  await edit.waitFor({ state: "detached" });
  check(db.trackingContainers[0].status === "pausado" && !("client_id" in db.rpcCalls.filter((c) => c.fn === "tracking_containers.update").at(-1)), "edição grava a situação (sem mexer no cliente)");
  await card.getByText("Pausado").waitFor();
  check(true, "card mostra Pausado");

  // Chegam eventos
  const cid = saved.id;
  db.trackingTouchpoints.push(
    { id: 1, container_id: cid, occurred_at: ago(5), channel: "meta", paid: true, evidence: "confirmada", reason: "IDs do anúncio do Meta na URL.", utm_source: "facebook", utm_medium: "paid_social", utm_campaign: "Black Friday", fbclid: "Iw1", gclid: null, ad_campaign_id: "120", landing_url: null },
    { id: 2, container_id: cid, occurred_at: ago(20), channel: "direto", paid: null, evidence: "desconhecida", reason: "Sem parâmetros nem site de origem (acesso direto ou origem perdida).", utm_source: null, utm_medium: null, utm_campaign: null, fbclid: null, gclid: null, ad_campaign_id: null, landing_url: null },
  );
  db.trackingEvents.push(
    { event_id: "e1", container_id: cid, event_name: "PageView", occurred_at: ago(5), page_path: "/", test: true, touchpoint_id: 1, session_id: "s1", visitor_id: "v1" },
    { event_id: "e2", container_id: cid, event_name: "Lead", occurred_at: ago(4), page_path: "/obrigado", test: true, touchpoint_id: null, session_id: "s1", visitor_id: "v1" },
    { event_id: "e3", container_id: cid, event_name: "PageView", occurred_at: ago(20), page_path: "/", test: true, touchpoint_id: 2, session_id: "s2", visitor_id: "v2" },
  );
  await page.reload();
  await page.getByTestId("touchpoint-row").first().waitFor();
  const stats = (await page.getByTestId("tracking-stat").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  check(stats[0] === "Sessões 2" && stats[1] === "Visitantes 2" && stats[2] === "Páginas vistas 2" && stats[3] === "Sessões de anúncio 1" && stats[4] === "Origem desconhecida 1", `resumo do dia (${stats.join(" | ")})`);
  const rows = await page.getByTestId("touchpoint-row").allInnerTexts();
  check(rows[0].includes("Meta Ads") && rows[0].includes("Pago") && rows[0].includes("Confirmada") && rows[0].includes("Black Friday"), "origem Meta confirmada com a campanha");
  check(rows[1].includes("Direto") && rows[1].includes("Não dá para saber") && rows[1].includes("Desconhecida"), "acesso direto aparece como desconhecido (não inventa origem)");
  const evs = await page.getByTestId("event-row").allInnerTexts();
  check(evs.length === 3 && evs[0].includes("Lead") && evs[0].includes("Teste"), "eventos recentes marcados como teste");
  check((await card.innerText()).includes("Último evento recebido"), "card mostra quando chegou o último evento");

  // Testar um link (não grava nada)
  const tester = page.getByLabel("Testar link");
  await tester.getByLabel("URL de destino").fill("https://loja.com.br/?utm_source=facebook&utm_medium=paid_social&bf_c=120&bf_a=121");
  await tester.getByRole("button", { name: "Testar" }).click();
  let result = await page.getByTestId("link-test-result").innerText();
  check(result.includes("Meta Ads") && result.includes("Confirmada") && result.includes("bf_c") === false && result.includes("campaign=120"), "testar link: anúncio do Meta confirmado pelos IDs");
  await tester.getByLabel("URL de destino").fill("https://loja.com.br/?fbclid=abc");
  await tester.getByRole("button", { name: "Testar" }).click();
  result = await page.getByTestId("link-test-result").innerText();
  check(result.includes("Provável") && result.includes("Não dá para saber"), "testar link: fbclid sozinho é só provável");
  await tester.getByLabel("URL de destino").fill("loja.com.br");
  await tester.getByRole("button", { name: "Testar" }).click();
  await tester.getByText("Cole a URL completa").waitFor();
  check(true, "testar link: URL incompleta explica o erro");

  await page.screenshot({ path: `${SHOTS}/tracking.png`, fullPage: true });
  check(errors.length === 0, `sem erros na página${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

// ---------------------------------------------------------------------------
// 2) Permissões: visualizador vê e não configura; cliente não entra
// ---------------------------------------------------------------------------
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seedClients(db);
  db.trackingContainers.push({ id: "t1", client_id: EXC, name: "Loja", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"], status: "ativo", test_mode: false, consent_mode: "nao_exigir", retention_days: 180, created_at: ago(60) });
  await login(page, "/tracking");
  await page.getByRole("heading", { name: "Tracking", level: 1 }).waitFor();
  await page.getByTestId("container-card").waitFor();
  check(await page.getByRole("button", { name: "Novo container" }).count() === 0 && await page.getByRole("button", { name: "Editar Loja" }).count() === 0, "visualizador vê o tracking mas não cria nem edita");
  check(await page.getByRole("button", { name: "Código de instalação: Loja" }).count() === 1, "visualizador pode ver o código de instalação");
  await browser.close();
}
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "cliente" });
  await login(page, "/tracking");
  await page.waitForTimeout(800);
  check(await page.getByRole("heading", { name: "Tracking", level: 1 }).count() === 0, "perfil cliente não acessa o tracking");
  await browser.close();
}

// ---------------------------------------------------------------------------
// 3) Script t.js num site fictício
// ---------------------------------------------------------------------------
const KEY = "bf_0123456789abcdef01234567";
const SITE = "https://www.site-teste.example";
const ENDPOINT = "https://coletor.teste.example/track";
// O t.js publicado pelo site (dist), servido como se viesse de outro domínio (igual à vida real).
const SCRIPT_URL = "https://cdn.teste.example/t.js";
const SCRIPT = await (await fetch(`${BASE}/t.js`)).text();
const html = (extra = "", attrs = "") => `<!doctype html><html><head><title>Site</title>
<script>window.bf = window.bf || function () { (window.bf.q = window.bf.q || []).push(arguments); }; bf("track", "ViewContent", { produto: "plano" });</script>
<script async src="${SCRIPT_URL}" data-key="${KEY}" data-endpoint="${ENDPOINT}"${attrs}></script>${extra}</head><body><h1>Oi</h1></body></html>`;

async function site(page, sent, markup) {
  await page.route(`${SITE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: markup }));
  await page.route(SCRIPT_URL, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: SCRIPT }));
  await page.route(`${ENDPOINT}**`, (route) => route.fulfill({ status: 204 }));
  page.on("request", (r) => {
    if (r.url().startsWith(ENDPOINT) && r.method() === "POST") sent.push(JSON.parse(r.postData()));
  });
}
const waitSent = async (page, sent, n) => {
  for (let i = 0; i < 40 && sent.length < n; i++) await page.waitForTimeout(100);
  return sent.length;
};

{
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html());
  await page.goto(`${SITE}/?utm_source=facebook&utm_medium=paid_social&bf_c=120&fbclid=IwTeste&email=ana@x.com`);
  await waitSent(page, sent, 2);
  const pv = sent.find((b) => b.n === "PageView");
  check(pv && pv.k === KEY && /^[A-Za-z0-9_-]{22}$/.test(pv.v) && /^[A-Za-z0-9_-]{20}$/.test(pv.s) && pv.nt === true, "primeira visita: PageView com visitante, sessão e marca de chegada");
  check(pv.u.includes("bf_c=120") && /^[A-Za-z0-9_.:-]{8,80}$/.test(pv.e) && typeof pv.t === "number", "leva a URL com os parâmetros e um event_id único");
  const vc = sent.find((b) => b.n === "ViewContent");
  check(vc && vc.cd?.produto === "plano" && vc.v === pv.v && vc.s === pv.s && !vc.nt, "evento chamado antes do script carregar não se perde (fila)");
  const cookies = await page.context().cookies(SITE);
  const bft = cookies.find((c) => c.name === "_bft");
  check(bft && bft.value === pv.v && bft.domain.replace(/^\./, "") === "site-teste.example", "cookie do próprio site (_bft) no domínio principal");

  // Recarregar: mesmo visitante, mesma sessão, sem nova chegada
  sent.length = 0;
  await page.reload();
  await waitSent(page, sent, 2);
  const pv2 = sent.find((b) => b.n === "PageView");
  check(pv2.v === pv.v && pv2.s === pv.s && !pv2.nt && pv2.e !== pv.e, "recarregar: mesma sessão, sem contar nova origem, novo event_id");

  // Evento pelo site e troca de página sem recarregar
  sent.length = 0;
  await page.evaluate(() => window.bf("track", "Lead", { formulario: "contato" }));
  await page.evaluate(() => history.pushState({}, "", "/obrigado"));
  await waitSent(page, sent, 2);
  check(sent.some((b) => b.n === "Lead" && b.cd.formulario === "contato"), "bf('track', 'Lead') envia o evento");
  check(sent.some((b) => b.n === "PageView" && b.u.endsWith("/obrigado")), "troca de página sem recarregar conta PageView");
  sent.length = 0;
  await page.evaluate(() => window.bf("track", "1 inválido"));
  await page.waitForTimeout(300);
  check(sent.length === 0, "nome de evento inválido é ignorado");

  // Nova campanha na URL = nova sessão com nova origem
  sent.length = 0;
  await page.goto(`${SITE}/?gclid=G123`);
  await waitSent(page, sent, 2);
  const pv3 = sent.find((b) => b.n === "PageView");
  check(pv3.v === pv.v && pv3.s !== pv.s && pv3.nt === true, "chegou de outro anúncio: mesma pessoa, nova sessão e nova origem");
  check(errors.length === 0, `script não gera erro no site${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}

{
  // Consentimento exigido: nada sai (nem cookie) antes do aceite
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html("", ' data-consent="aguardar"'));
  await page.goto(`${SITE}/`);
  await page.waitForTimeout(800);
  const before = await page.context().cookies(SITE);
  check(sent.length === 0 && !before.some((c) => c.name === "_bft"), "aguardando consentimento: nenhum envio e nenhum cookie");
  await page.evaluate(() => window.bf("consent", true));
  await waitSent(page, sent, 2);
  check(sent.length === 2 && sent.every((b) => b.c === "concedido") && sent.some((b) => b.n === "PageView"), "depois do aceite: envia o que estava na fila, marcado como consentido");
  check(errors.length === 0, "sem erros com consentimento");
  await browser.close();
}

{
  // Chave inválida: o script não faz nada (e não quebra o site)
  const { browser, page, errors } = await launch();
  const sent = [];
  await site(page, sent, html().replace(KEY, "chave-errada"));
  await page.goto(`${SITE}/`);
  await page.waitForTimeout(800);
  check(sent.length === 0 && errors.length === 0 && (await page.getByRole("heading", { name: "Oi" }).count()) === 1, "chave inválida: nada é enviado e o site funciona normal");
  await browser.close();
}

console.log("\nEtapa 34.1 (tracking): todos os testes passaram.");
