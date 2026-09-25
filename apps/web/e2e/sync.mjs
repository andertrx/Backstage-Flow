/**
 * Teste de navegador da Etapa 16 — Sincronização.
 * Supabase SIMULADO (support.mjs): a função "sync" simulada grava o log e o estado.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const CON = "c0000000-0000-4000-8000-000000000001";
const META = "a0000000-0000-4000-8000-000000001601";
const GOOGLE = "a0000000-0000-4000-8000-000000001602";
const US = "a0000000-0000-4000-8000-000000001603";
const TEST = "a0000000-0000-4000-8000-000000001604";
const NOCON = "a0000000-0000-4000-8000-000000001605";

const at = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const account = (id, platform_id, external_id, client_id, name, currency, extra = {}) =>
    ({ id, platform_id, external_id, client_id, name, currency, status: "ativa", unlinked_at: null, connection_id: CON, is_test_account: false, ...extra });
  db.adAccounts.push(
    account(META, "meta", "611", EXC, "Excalibur Meta", "BRL"),
    account(GOOGLE, "google", "1234567890", EXC, "Excalibur Google", "BRL"),
    account(US, "meta", "613", LOJA, "Loja US", "USD"),
    account(TEST, "google", "5556667778", LOJA, "Conta de Teste", "BRL", { is_test_account: true }),
    account(NOCON, "meta", "615", LOJA, "Loja Antiga", "BRL", { connection_id: null }),
  );
  const tokenError = "O token do Google expirou. Conecte novamente em Configurações → Integrações.";
  db.syncState[META] = { status: "sucesso", last_attempt_at: at(-21), last_success_at: at(-20), next_run_at: at(40) };
  db.syncState[GOOGLE] = { status: "erro", last_attempt_at: at(-11), last_success_at: at(-180), next_run_at: at(19), last_error_message: tokenError };
  db.syncRuns.push(
    { id: 1, ad_account_id: META, client_id: EXC, platform_id: "meta", trigger: "agendada", status: "sucesso", started_at: at(-21), finished_at: at(-20), duration_ms: 65_000, records_updated: 1312, error_message: null },
    { id: 2, ad_account_id: GOOGLE, client_id: EXC, platform_id: "google", trigger: "agendada", status: "erro", started_at: at(-11), finished_at: at(-10), duration_ms: 2_000, records_updated: 0, error_message: tokenError },
  );
  db.syncOutcome[GOOGLE] = { status: "erro", records: 0, durationMs: 1500, error: tokenError };
  db.syncOutcome[US] = { status: "sucesso", records: 845, durationMs: 12_400 };
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const account = (page, name) => page.getByTestId("sync-account").filter({ hasText: name });
const stateOf = async (page, name) => clean(await account(page, name).getByTestId("sync-state").innerText());
async function waitState(page, name, text) {
  await account(page, name).getByTestId("sync-state").getByText(text, { exact: true }).waitFor({ timeout: 5000 }).catch(() => {});
  return stateOf(page, name);
}
async function logRows(page, n) {
  await page.waitForFunction((k) => document.querySelectorAll("[data-testid=sync-log-row]").length === k, n, { timeout: 5000 }).catch(() => {});
  return page.getByTestId("sync-log-row").count();
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  // Entra direto na Sincronização (o Dashboard atualizaria sozinho as contas desatualizadas — Etapa 24).
  await login(page, "/sincronizacao");
  await page.getByRole("heading", { name: "Sincronização", level: 1 }).waitFor();
  await page.getByTestId("sync-account").first().waitFor();
  check(await page.getByTestId("sync-account").count() === 5, "lista as 5 contas vinculadas");

  // Resumo do topo
  const summary = async (id) => clean(await page.getByTestId(id).innerText());
  check((await summary("summary-last")).includes("há 10 minutos") && (await summary("summary-last")).includes("Erro"), `última sincronização: há 10 minutos, com erro (${await summary("summary-last")})`);
  check((await summary("summary-next")).includes("Na fila"), `próxima: conta nunca sincronizada fica na fila (${await summary("summary-next")})`);
  check((await summary("summary-success")).includes("1 de 3") && (await summary("summary-errors")).endsWith("1"), "contas com sucesso (1 de 3 agendadas) e com erro (1)");

  // Cada conta
  check(await stateOf(page, "Excalibur Meta") === "Sucesso", "conta com sucesso");
  const metaInfo = clean(await account(page, "Excalibur Meta").getByTestId("sync-account-meta").innerText());
  check(metaInfo.includes("Última tentativa há 21 minutos") && metaInfo.includes("Último sucesso há 20 minutos"), `última tentativa e último sucesso (${metaInfo})`);
  check(/Próxima em (39|40) minutos/.test(metaInfo), `próxima sincronização da conta (${metaInfo})`);
  check(metaInfo.includes("Registros atualizados 1.312") && metaInfo.includes("Duração 1 min 5 s"), "registros atualizados e duração");
  check(await stateOf(page, "Excalibur Google") === "Erro", "conta com erro");
  check(clean(await account(page, "Excalibur Google").getByTestId("sync-error").innerText()).includes("O token do Google expirou"), "mostra o erro em português simples");
  check(await stateOf(page, "Loja US") === "Aguardando a primeira", "conta nova aguardando a primeira");
  check(await stateOf(page, "Conta de Teste") === "Conta de teste" && clean(await account(page, "Conta de Teste").innerText()).includes("Não agendada"), "conta de teste não é agendada");
  check(await stateOf(page, "Loja Antiga") === "Sem conexão" && await account(page, "Loja Antiga").getByRole("button").count() === 0, "conta sem conexão: aviso e sem botão");

  // Log
  check(await logRows(page, 2) === 2, "histórico com 2 sincronizações");
  const firstRow = clean(await page.getByTestId("sync-log-row").first().innerText());
  check(firstRow.includes("Excalibur Google") && firstRow.includes("Automática") && firstRow.includes("Erro") && firstRow.includes("O token do Google expirou"), `linha do log (${firstRow})`);
  await page.screenshot({ path: `${SHOTS}/160-sincronizacao.png`, fullPage: true });

  // Sincronizar UMA conta
  await account(page, "Loja US").getByRole("button", { name: "Sincronizar" }).click();
  await page.getByText(/1 conta sincronizada · 1 com sucesso · 845 registros atualizados\./).waitFor();
  check(JSON.stringify(db.syncCalls[0]) === JSON.stringify({ action: "run", adAccountIds: [US] }), "botão da conta pede só aquela conta");
  check(await waitState(page, "Loja US", "Sucesso") === "Sucesso", "a conta passa para Sucesso");
  check(await logRows(page, 3) === 3, "a sincronização manual entra no histórico");
  const usRow = clean(await page.getByTestId("sync-log-row").first().innerText());
  check(usRow.includes("Loja US") && usRow.includes("Manual") && usRow.includes("845") && usRow.includes("12 s"), `log: manual, registros e duração (${usRow})`);

  // Sincronizar TODAS
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  // Cache (Etapa 24): a Loja US acabou de ser sincronizada → usa o que está guardado, sem chamar a API.
  await page.getByText(/3 contas sincronizadas · 2 com sucesso · 1 com erro/).waitFor();
  check(JSON.stringify(db.syncCalls[1]) === JSON.stringify({ action: "run" }), "Sincronizar agora pede todas as contas visíveis");
  check((await page.getByText(/1 conta já estava atualizada \(sincronizada há menos de 10 minutos\): usamos os dados guardados/).count()) === 1,
    "cache: a conta sincronizada há pouco não vai para a API de novo, e a tela avisa");
  check(await logRows(page, 6) === 6, "3 novas linhas no histórico (a recente não gera nova chamada)");
  await page.waitForFunction(() => /em (29|30) minutos/.test(document.querySelector("[data-testid=summary-next]")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  check(/em (29|30) minutos/.test(await summary("summary-next")), `próxima: a conta com erro tenta de novo em 30 minutos (${await summary("summary-next")})`);
  check((await summary("summary-last")).includes("agora mesmo"), "última sincronização: agora mesmo");
  await page.screenshot({ path: `${SHOTS}/161-sincronizacao-depois.png`, fullPage: true });

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check(overflow.sw <= overflow.vw, `no celular a página cabe na tela ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/162-sincronizacao-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Visualizador: vê, mas não sincroniza
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/sincronizacao");
  await page.getByTestId("sync-account").first().waitFor();
  check(await page.getByRole("button", { name: /Sincronizar/ }).count() === 0, "visualizador não vê botões de sincronizar");
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}

{
  // Nenhuma conta vinculada: explica o que fazer
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "admin" });
  await login(page, "/sincronizacao");
  await page.getByTestId("sync-empty").waitFor();
  const text = clean(await page.getByTestId("sync-empty").innerText());
  check(text.includes("Nenhuma conta de anúncio vinculada ainda.") && text.includes("Ir para Configurações → Integrações"), "sem contas: orienta a conectar");
  check(await page.getByRole("button", { name: "Sincronizar agora" }).isDisabled(), "sem contas: botão desativado");
  check(clean(await page.getByTestId("summary-last").innerText()).includes("Ainda não houve") && clean(await page.getByTestId("summary-next").innerText()).includes("Nenhuma conta"), "sem contas: resumo não inventa datas");
  check(await page.getByTestId("sync-log-empty").count() === 1, "sem contas: histórico vazio");
  await browser.close();
}

{
  // Perfil cliente não acessa
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "cliente" });
  seed(db);
  await login(page, "/sincronizacao");
  await page.waitForTimeout(1500);
  check(!(await page.getByRole("heading", { name: "Sincronização", level: 1 }).count()), "perfil cliente não acessa a sincronização");
  await browser.close();
}

console.log("Sincronização: tudo certo.");
