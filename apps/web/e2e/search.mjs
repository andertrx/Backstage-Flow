/**
 * Teste de navegador da Etapa 22 — Busca global.
 * Supabase SIMULADO (support.mjs); a regra real (acentos, IDs, permissões) é
 * testada no banco em supabase/tests/etapa22_search.sql.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const OUT = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000a01";
const GOOGLE = "a0000000-0000-4000-8000-000000000a02";
const C1 = "d0000000-0000-4000-8000-0000000000c1";
const C3 = "d0000000-0000-4000-8000-0000000000c3";
const G1 = "f0000000-0000-4000-8000-0000000000a1";

function seed(db) {
  const client = (id, name, company = null) => ({ id, name, company, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness", "Academia Excalibur Ltda"), client(OUT, "Loja Centro"));
  db.adAccounts.push(
    { id: META, platform_id: "meta", external_id: "1001", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] },
    { id: GOOGLE, platform_id: "google", external_id: "1234567890", client_id: EXC, name: "Excalibur Google", currency: "BRL", status: "ativa", unlinked_at: null, assets: [] },
  );
  db.campaigns.push(
    { id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Excalibur Leads Setembro", objective: "OUTCOME_LEADS", status: "ativa" },
    { id: C3, ad_account_id: GOOGLE, client_id: EXC, platform_id: "google", external_id: "c3", name: "Pesquisa Marca", objective: "SEARCH", status: "pausada" },
  );
  db.adGroups.push({ id: G1, campaign_id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "g1", name: "Público Frio", status: "ativa", optimization_goal: "LEAD_GENERATION" });
  db.ads.push({ id: "b0000000-0000-4000-8000-0000000000b1", ad_group_id: G1, campaign_id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "ad1", name: "Imagem Promoção", status: "ativa", creative_type: "IMAGE", review_status: "APPROVED", thumbnail_url: null });
}

const dialog = (page) => page.getByRole("dialog", { name: "Busca global" });
const input = (page) => dialog(page).getByRole("combobox", { name: "O que você procura?" });
const results = (page) => dialog(page).getByTestId("search-result");
async function type(page, text) {
  await input(page).fill(text);
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Busca global"] .animate-spin'),
    null, { timeout: 5000 },
  ).catch(() => {});
}
async function open(page) {
  await page.getByRole("button", { name: "Busca global", exact: true }).waitFor();
  await page.keyboard.press("Control+K");
  await dialog(page).waitFor();
}

// ---------------------------------------------------------------- administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { level: 1 }).first().waitFor();

  const button = page.getByRole("button", { name: "Busca global", exact: true });
  await button.waitFor({ timeout: 5000 }).catch(() => {});
  check(await button.isVisible(), "botão de busca no topo de todas as páginas");
  await open(page);
  check(await input(page).evaluate((el) => el === document.activeElement), "Ctrl+K abre a busca com o cursor no campo");
  await input(page).fill("e");
  check((await dialog(page).innerText()).includes("Digite pelo menos 2 letras"), "com 1 letra, explica que precisa de pelo menos 2");

  // Exemplo da etapa: "Excalibur"
  await type(page, "Excalibur");
  await results(page).first().waitFor();
  const kinds = await dialog(page).getByTestId("search-group").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  check(JSON.stringify(kinds) === JSON.stringify(["cliente", "conta", "campanha"]), `"Excalibur" acha cliente, contas e campanha, nessa ordem (${kinds.join(", ")})`);
  const text = await dialog(page).innerText();
  check(text.includes("Excalibur Meta") && text.includes("Excalibur Google") && text.includes("Meta Ads · Excalibur Fitness · ID 1001"), "contas Meta e Google com plataforma, cliente e ID");
  const shortcuts = await dialog(page).getByTestId("search-shortcuts").innerText();
  check(["Dashboard", "Meta Ads", "Google Ads", "Campanhas", "Relatórios"].every((s) => shortcuts.includes(s)), "atalhos do cliente: Dashboard, Meta Ads, Google Ads, Campanhas e Relatórios");
  check(!text.includes("Loja Centro"), "não mostra o que não combina");
  await page.screenshot({ path: `${SHOTS}/220-busca-excalibur.png` });

  // Teclado: primeira opção = cliente → Enter abre a ficha
  check(await dialog(page).locator('[role=option][aria-selected=true]').first().innerText().then((t) => t.includes("Excalibur Fitness")), "primeiro resultado já vem selecionado");
  await input(page).press("Enter");
  await page.waitForURL(`**/clientes/${EXC}`);
  check(await dialog(page).count() === 0, "Enter abre o cliente e fecha a busca");

  // Setas: desce até o atalho "Meta Ads" do cliente
  await open(page);
  await type(page, "excalibur");
  await results(page).first().waitFor();
  await input(page).press("ArrowDown");
  await input(page).press("ArrowDown");
  check((await dialog(page).locator('[role=option][aria-selected=true]').innerText()) === "Meta Ads", "setas do teclado andam pelas opções");
  await input(page).press("Enter");
  await page.waitForURL((u) => u.pathname === "/meta-ads" && u.searchParams.get("cliente") === EXC);
  check(true, "atalho Meta Ads abre a página já filtrada no cliente");

  // Atalho Relatórios (mouse)
  await open(page);
  await type(page, "excalibur");
  await dialog(page).getByRole("option", { name: "Relatórios" }).click();
  await page.waitForURL((u) => u.pathname === "/relatorios" && u.searchParams.get("cliente") === EXC);
  await page.getByRole("heading", { name: "Relatórios", level: 1 }).waitFor();
  check(true, "atalho Relatórios abre os relatórios do cliente");

  // Conta Google → página do Google Ads filtrada na conta
  await open(page);
  await type(page, "excalibur google");
  await results(page).filter({ hasText: "Excalibur Google" }).click();
  await page.waitForURL((u) => u.pathname === "/google-ads" && u.searchParams.get("conta") === GOOGLE);
  check(true, "conta leva à página da plataforma filtrada na conta");

  // Campanha
  await page.keyboard.press("/");
  await dialog(page).waitFor();
  check(true, "a tecla / também abre a busca");
  await type(page, "leads setembro");
  await results(page).filter({ hasText: "Excalibur Leads Setembro" }).click();
  await page.waitForURL(`**/campanhas/${C1}`);
  check(true, "campanha abre a página da campanha");

  // Sem acento, ID da plataforma, status e nada encontrado
  await open(page);
  await type(page, "promocao");
  await results(page).first().waitFor();
  check((await results(page).first().innerText()).includes("Imagem Promoção"), "\"promocao\" (sem acento) acha o anúncio \"Imagem Promoção\"");
  check((await dialog(page).innerText()).includes("Excalibur Leads Setembro"), "anúncio mostra de qual campanha é");
  await type(page, "1234567890");
  await results(page).first().waitFor();
  check((await results(page).first().innerText()).includes("Excalibur Google"), "ID da conta no Google acha a conta");
  await type(page, "pesquisa marca");
  await results(page).first().waitFor();
  check((await results(page).first().innerText()).includes("Pausada"), "campanha pausada mostra o status");
  await type(page, "xyzw");
  await dialog(page).getByTestId("search-empty").waitFor();
  check((await dialog(page).getByTestId("search-empty").innerText()).includes("Nada encontrado"), "sem resultado mostra aviso claro");
  const calls = db.rpcCalls.filter((c) => c.fn === "global_search").map((c) => c.p_query);
  check(!calls.includes("e") && !calls.includes("x"), `não pergunta ao banco com 1 letra nem a cada tecla (${calls.length} buscas)`);
  await page.keyboard.press("Escape");
  await dialog(page).waitFor({ state: "detached" });
  check(true, "Esc fecha a busca");

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await button.click();
  await type(page, "excalibur");
  await results(page).first().waitFor();
  const o = await page.evaluate(() => {
    const box = document.querySelector('[aria-label="Busca global"]').getBoundingClientRect();
    return { right: Math.round(box.right), vw: window.innerWidth, sw: document.documentElement.scrollWidth };
  });
  check(o.right <= o.vw && o.sw <= o.vw, `no celular a busca cabe na tela ${JSON.stringify(o)}`);
  await page.screenshot({ path: `${SHOTS}/221-busca-celular.png` });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- visualizador e cliente
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await open(page);
  await type(page, "excalibur");
  await results(page).first().waitFor();
  const shortcuts = await dialog(page).getByTestId("search-shortcuts").innerText();
  check(!shortcuts.includes("Relatórios") && shortcuts.includes("Campanhas"), "visualizador não recebe atalho de Relatórios (não pode gerar)");
  check(errors.length === 0, `visualizador: sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "cliente" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.getByText("Ander Rodrigues").first().waitFor();
  check(await page.getByRole("button", { name: "Busca global", exact: true }).count() === 0, "perfil cliente não vê a busca");
  await page.keyboard.press("Control+K");
  await page.waitForTimeout(300);
  check(await dialog(page).count() === 0, "perfil cliente: Ctrl+K não abre nada");
  check(!db.rpcCalls.some((c) => c.fn === "global_search"), "perfil cliente: busca nunca é pedida ao banco");
  check(errors.length === 0, `cliente: sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

console.log("Busca global: tudo certo.");
