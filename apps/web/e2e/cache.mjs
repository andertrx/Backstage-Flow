/**
 * Teste de navegador da Etapa 24 — Cache.
 * Regra: sincronizada há < 10 min = recente (usa o guardado); > 90 min ou nunca =
 * desatualizada (ao abrir a página, busca SÓ essas nas APIs).
 */
import { BASE, check, launch, login, mockSupabase } from "./support.mjs";

const M = 1_000_000;
const EXC = "e0000000-0000-4000-8000-000000000001";
const id = (n) => `a0000000-0000-4000-8000-00000000090${n}`;
const minAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.connections.push({ id: "c-meta", platform_id: "meta", label: "BM", status: "ativa", external_user_id: "su1", external_user_name: "Sistema", last_checked_at: minAgo(1), last_error: null, created_at: minAgo(100) });
  const acc = (n, name) => ({ id: id(n), platform_id: "meta", external_id: `90${n}`, client_id: EXC, name, currency: "BRL", status: "ativa", connection_id: "c-meta", unlinked_at: null, assets: [] });
  db.adAccounts.push(acc(1, "Conta Recente"), acc(2, "Conta Em Dia"), acc(3, "Conta Atrasada"), acc(4, "Conta Nova"));
  db.syncState[id(1)] = { status: "sucesso", last_success_at: minAgo(5) };
  db.syncState[id(2)] = { status: "sucesso", last_success_at: minAgo(40) };
  db.syncState[id(3)] = { status: "sucesso", last_success_at: minAgo(200) };
  // Conta Nova: nunca sincronizada.
  db.snapshots[id(1)] = { captured_at: minAgo(3), available_micros: 500 * M, available_basis: "meta_spend_cap", issues: [] };
  db.snapshots[id(2)] = { captured_at: minAgo(120), available_micros: 800 * M, available_basis: "meta_spend_cap", issues: [] };
  db.fundingApi[id(2)] = { available_micros: 700 * M, available_basis: "meta_spend_cap", issues: [] };
}

const freshness = (page) => page.getByTestId("data-freshness");

// ---------------------------------------------------------------- administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();

  // Abrir o Dashboard: só as desatualizadas vão para a API
  await page.waitForFunction(() => document.querySelector("[data-testid=data-freshness]")?.textContent?.startsWith("Dados atualizados"), null, { timeout: 8000 }).catch(() => {});
  check(db.syncCalls.length === 1, `abrir a página pede UMA sincronização (${db.syncCalls.length})`);
  const call = db.syncCalls[0] ?? {};
  check(call.onlyStale === true && JSON.stringify([...call.adAccountIds].sort()) === JSON.stringify([id(3), id(4)].sort()),
    `só a atrasada (3 h) e a nunca sincronizada; a recente e a em dia usam o que está guardado (${JSON.stringify(call)})`);
  const text = (await freshness(page).innerText()).replace(/\s+/g, " ");
  check(text.startsWith("Dados atualizados há 40 minutos (conta mais antiga)"), `depois, a tela diz de quando são os dados (${text})`);

  // Recarregar: tudo em dia, nenhuma chamada nova às APIs
  await page.reload();
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  await freshness(page).waitFor();
  await page.waitForTimeout(800);
  check(db.syncCalls.length === 1, "recarregar com dados em dia não chama as APIs de novo");

  // Filtro de cliente/conta: o aviso segue o filtro
  await page.goto(`${BASE}/?cliente=${EXC}&conta=${id(1)}`);
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  await page.waitForFunction(() => document.querySelector("[data-testid=data-freshness]")?.textContent?.includes("minutos."), null, { timeout: 5000 }).catch(() => {});
  const one = (await freshness(page).innerText()).replace(/\s+/g, " ");
  check(one.startsWith("Dados atualizados há 5 minutos.") && !one.includes("conta mais antiga"), `com uma conta filtrada, mostra a idade dela (${one})`);

  // "Sincronizar agora": tudo recente → nenhuma chamada às plataformas
  await page.goto(`${BASE}/sincronizacao`);
  await page.getByRole("heading", { name: "Sincronização", level: 1 }).waitFor();
  for (const n of [1, 2, 3, 4]) db.syncState[id(n)] = { ...db.syncState[id(n)], last_success_at: minAgo(2) };
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await page.getByText(/Todas as 4 contas já estavam atualizadas \(sincronizadas há menos de 10 minutos\): usamos os dados guardados, sem chamar as APIs\./).waitFor();
  check(db.syncRuns.filter((r) => r.trigger === "manual").length === 2, "Sincronizar agora com tudo recente: nenhuma sincronização nova (só as 2 da abertura)");

  // "Verificar status e saldo": fotografia de 3 min é reaproveitada; a de 2 h é consultada
  await page.goto(`${BASE}/contas`);
  await page.getByRole("heading", { name: "Saúde das contas" }).waitFor();
  await page.getByTestId("health-row").first().waitFor();
  await page.getByRole("button", { name: "Verificar status e saldo" }).click();
  const ok = page.getByText(/contas verificadas:/);
  await ok.waitFor();
  const msg = (await ok.innerText()).replace(/\s+/g, " ");
  check(/4 contas verificadas: 3 consultadas agora no Meta\/Google e 1 já tinha saldo de menos de 10 minutos \(usamos o que estava guardado\)\./.test(msg), `saldo: o que é recente não é consultado de novo (${msg})`);

  // Lista de contas da BM: guardada por 5 minutos, com "Atualizar lista"
  await page.goto(`${BASE}/configuracoes/integracoes`);
  await page.getByRole("button", { name: "Ver contas desta conexão" }).click();
  const dialog = page.getByRole("dialog", { name: /Contas desta conexão/ });
  await dialog.getByTestId("list-freshness").waitFor();
  const lists = () => db.adAccountCalls.filter((c) => c.action === "list_available").length;
  check(lists() === 1 && (await dialog.getByTestId("list-freshness").innerText()).includes("Lista buscada agora mesmo"), "lista de contas buscada uma vez, com a hora");
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Ver contas desta conexão" }).click();
  await dialog.getByTestId("list-freshness").waitFor();
  await page.waitForTimeout(500);
  check(lists() === 1, "reabrir em seguida usa a lista guardada (sem nova chamada à API)");
  await dialog.getByRole("button", { name: "Atualizar lista" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=list-freshness] .animate-spin"), null, { timeout: 5000 });
  check(lists() === 2, "\"Atualizar lista\" busca de novo quando a pessoa pede");

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- visualizador (não sincroniza) e cliente (não vê)
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  await freshness(page).waitFor();
  await page.waitForTimeout(600);
  const t = (await freshness(page).innerText()).replace(/\s+/g, " ");
  check(db.syncCalls.length === 0 && t.includes("2 contas estão com dados antigos") && t.includes("a atualização automática está atrasada"),
    `visualizador: não dispara sincronização; vê o aviso (${t})`);
  check(errors.length === 0, `visualizador: sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "cliente" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  await page.waitForTimeout(800);
  check(await freshness(page).count() === 0 && db.syncCalls.length === 0 && !db.rpcCalls.some((c) => c.fn === "sync_overview"),
    "cliente: sem aviso técnico e sem nenhuma chamada de sincronização");
  check(errors.length === 0, `cliente: sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

console.log("Cache: tudo certo.");
