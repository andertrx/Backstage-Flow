/**
 * Teste de navegador da Etapa 8 — Saúde das contas.
 * Supabase SIMULADO (support.mjs).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const id = (n) => `a0000000-0000-4000-8000-00000000080${n}`;
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();

function seed(db) {
  const client = (cid, name) => ({ id: cid, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  db.connections.push(
    { id: "c-meta", platform_id: "meta", label: "BM", status: "ativa", last_error: null },
    { id: "c-google", platform_id: "google", label: "MCC", status: "erro", last_error: "A autorização do Google expirou. Conecte o Google Ads novamente." },
  );
  const acc = (n, platform_id, external_id, client_id, name, currency, status, connection_id) =>
    ({ id: id(n), platform_id, external_id, client_id, name, currency, status, connection_id, unlinked_at: null });
  db.adAccounts.push(
    acc(1, "meta", "811", EXC, "Excalibur Principal", "BRL", "ativa", "c-meta"),
    acc(2, "meta", "812", EXC, "Excalibur Remarketing", "BRL", "pagamento_pendente", "c-meta"),
    acc(3, "google", "1234567890", EXC, "Excalibur Pesquisa", "BRL", "ativa", "c-google"),
    acc(4, "google", "4445556667", LOJA, "Loja US", "USD", "restrita", "c-google"),
    acc(5, "meta", "815", LOJA, "Loja Nova", "BRL", "ativa", "c-meta"),
    acc(6, "meta", "816", LOJA, "Loja Antiga", "BRL", "encerrada", "c-meta"),
  );
  for (const n of [1, 2, 3, 6]) db.syncState[id(n)] = { status: "sucesso", last_success_at: hoursAgo(2) };
  db.snapshots[id(1)] = { captured_at: hoursAgo(1), available_micros: 900 * M, available_basis: "meta_spend_cap", issues: [] };
  db.snapshots[id(2)] = { captured_at: hoursAgo(1), issues: ["pagamento_pendente"] };
  for (const n of [1, 2, 4, 5, 6]) db.fundingApi[id(n)] = { ...(db.snapshots[id(n)] ?? { issues: [] }) };
  db.fundingApi[id(5)] = { issues: [], available_micros: 300 * M, available_basis: "meta_spend_cap" };
  db.fundingErrors[id(3)] = "A autorização do Google expirou. Conecte o Google Ads novamente.";
}

const rowNames = (page) => page.getByTestId("health-row").locator("td:nth-child(3) a").allInnerTexts();
const row = (page, name) => page.getByTestId("health-row").filter({ hasText: name });
const clean = (s) => s.replace(/ /g, " ");

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("link", { name: "Contas" }).click();
  await page.getByRole("heading", { name: "Saúde das contas" }).waitFor();
  await page.getByTestId("health-row").first().waitFor();
  check(page.url().endsWith("/contas"), "menu Contas abre a Saúde das contas (não é mais 'em construção')");

  const names = await rowNames(page);
  check(names.length === 6, "todas as contas aparecem");
  check(JSON.stringify(names) === JSON.stringify(["Loja Antiga", "Excalibur Remarketing", "Loja US", "Excalibur Pesquisa", "Loja Nova", "Excalibur Principal"]),
    "ordem: piores primeiro (desativada → pagamento → restrita → erro → atenção → ativa)");

  const statusOf = async (name) => clean(await row(page, name).locator("td:nth-child(4)").innerText());
  check((await statusOf("Loja Antiga")).startsWith("Desativada") && (await statusOf("Loja Antiga")).includes("Conta encerrada"), "encerrada → Desativada, com motivo");
  check((await statusOf("Excalibur Remarketing")).startsWith("Pagamento pendente"), "Pagamento pendente");
  check((await statusOf("Loja US")).startsWith("Restrita") && (await statusOf("Loja US")).includes("Ainda não sincronizada."), "Restrita, com todos os motivos");
  check((await statusOf("Excalibur Pesquisa")).startsWith("Erro de sincronização") && (await statusOf("Excalibur Pesquisa")).includes("autorização do Google expirou"),
    "conexão com erro → Erro de sincronização, com a mensagem");
  check((await statusOf("Loja Nova")).startsWith("Atenção") && (await statusOf("Loja Nova")).includes("Ainda não sincronizada."), "nunca sincronizada → Atenção");
  check((await statusOf("Excalibur Principal")).trim() === "Ativa", "tudo certo → Ativa, sem motivos");

  const principal = clean(await row(page, "Excalibur Principal").innerText());
  check(principal.includes("R$ 900,00") && principal.includes("verificado há 1 hora") && principal.includes("act_811"), "saldo, quando foi verificado e ID no formato da plataforma");
  check(principal.includes("há 2 horas"), "última sincronização com tempo relativo");
  const nova = clean(await row(page, "Loja Nova").innerText());
  check(nova.includes("Saldo não verificado") && nova.includes("Nunca"), "conta nova: sem saldo inventado e 'Nunca' sincronizada");
  check(clean(await row(page, "Excalibur Remarketing").innerText()).includes("Informação não disponível pela API."), "saldo que a API não informa aparece assim");
  check(clean(await row(page, "Excalibur Pesquisa").innerText()).includes("123-456-7890"), "Customer ID do Google formatado");

  const chips = clean(await page.getByRole("group", { name: "Filtrar por status" }).innerText());
  check(["Desativada 1", "Pagamento pendente 1", "Restrita 1", "Erro de sincronização 1", "Atenção 1", "Ativa 1"].every((c) => chips.includes(c)), "atalhos mostram quantas contas há em cada status");
  await page.screenshot({ path: `${SHOTS}/80-saude-contas.png`, fullPage: true });

  await page.getByRole("button", { name: /Erro de sincronização/ }).click();
  check(JSON.stringify(await rowNames(page)) === JSON.stringify(["Excalibur Pesquisa"]), "clicar no atalho filtra pelo status");
  check(await page.getByRole("button", { name: /Erro de sincronização/ }).getAttribute("aria-pressed") === "true", "atalho marcado como ativo (acessível)");
  await page.getByRole("button", { name: /Erro de sincronização/ }).click();
  check((await rowNames(page)).length === 6, "clicar de novo remove o filtro");

  await page.getByLabel("Buscar conta").fill("123-456");
  check(JSON.stringify(await rowNames(page)) === JSON.stringify(["Excalibur Pesquisa"]), "busca pelo ID no formato do Google");
  await page.getByLabel("Buscar conta").fill("");
  await page.getByLabel("Cliente").selectOption({ label: "Loja Internacional" });
  check((await rowNames(page)).length === 3, "filtro por cliente");
  await page.getByLabel("Plataforma").selectOption("google");
  check(JSON.stringify(await rowNames(page)) === JSON.stringify(["Loja US"]), "filtro por plataforma");
  await page.getByLabel("Buscar conta").fill("não existe");
  await page.getByText("Nenhuma conta encontrada com esses filtros.").waitFor();
  check(true, "aviso quando o filtro não encontra nada");
  await page.getByLabel("Buscar conta").fill("");
  await page.getByLabel("Cliente").selectOption("");
  await page.getByLabel("Plataforma").selectOption("");

  // Verificar status e saldo (uma falha não esconde as outras)
  await page.getByRole("button", { name: "Verificar status e saldo" }).click();
  await page.getByText("Excalibur Pesquisa:").waitFor();
  check(db.adAccountCalls.at(-1).action === "refresh_balance" && db.adAccountCalls.at(-1).adAccountIds.length === 6, "verifica todas as contas da lista");
  check(clean(await page.getByRole("alert").innerText()).includes("autorização do Google expirou"), "erro de uma conta aparece com o motivo");
  await row(page, "Loja Nova").getByText("R$ 300,00").waitFor();
  check(true, "lista atualiza com o saldo novo");

  // Link para o cliente
  await row(page, "Excalibur Principal").getByRole("link", { name: "Excalibur Principal" }).click();
  await page.waitForURL(`**/clientes/${EXC}`);
  check(true, "nome da conta leva à página do cliente");

  // Celular: cartões em vez de tabela
  await page.goto(`${BASE}/contas`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("listitem").filter({ hasText: "Loja Antiga" }).waitFor();
  check(!(await page.getByRole("table").isVisible()), "no celular a tabela vira cartões");
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular não há rolagem para o lado");
  await page.screenshot({ path: `${SHOTS}/81-saude-contas-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ------------------------------------------------------------ visualizador e banco vazio
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/contas");
  await page.getByTestId("health-row").first().waitFor();
  check(await page.getByRole("button", { name: "Verificar status e saldo" }).count() === 0, "visualizador vê a saúde, mas não dispara verificações");
  check(errors.length === 0, "sem erros no navegador (visualizador)");
  await browser.close();
}
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "admin" });
  await login(page, "/contas");
  await page.getByText("Nenhuma conta de anúncio vinculada ainda.").waitFor();
  check(true, "sem contas: orientação clara");
  check(errors.length === 0, "sem erros no navegador (vazio)");
  await browser.close();
}

console.log(`\nSaúde das contas: tudo certo (${BASE}).`);
