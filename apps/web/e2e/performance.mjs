/**
 * Teste de navegador da Etapa 30 — Performance.
 * Supabase SIMULADO (support.mjs). Conta as chamadas ao servidor em cada tela:
 * nenhuma chamada repetida, cache ao voltar para uma tela e, ao trocar o
 * período, só o que depende do período é buscado de novo.
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const { browser, page, errors } = await launch();
await mockSupabase(page, { role: "admin" });

let calls = [];
page.on("request", (r) => {
  if (r.url().includes("/rest/v1/") || r.url().includes("/functions/v1/")) calls.push(`${r.method()} ${r.url().replace(/^.*\.co/, "")} ${r.postData() ?? ""}`);
});
const rpc = (name) => calls.filter((c) => c.includes(`/rpc/${name} `)).length;
async function step(fn) {
  calls = [];
  await fn();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  const seen = new Map();
  for (const c of calls) seen.set(c, (seen.get(c) ?? 0) + 1);
  return { total: calls.length, repeated: [...seen].filter(([, n]) => n > 1).map(([c]) => c.slice(0, 90)) };
}

await login(page, "/");
await page.getByRole("heading", { name: /Olá/ }).waitFor();

// 1) Dashboard aberto do zero: cada informação é buscada uma única vez
const first = await step(async () => { await page.reload(); await page.getByRole("heading", { name: /Olá/ }).waitFor(); });
check(first.repeated.length === 0, `Dashboard: nenhuma chamada repetida (${first.repeated.join(" | ")})`);
// Etapa 36.6: +1 chamada para o sino da Central (contagem de não lidas), só para quem está na Central.
check(first.total <= 11, `Dashboard: poucas chamadas ao abrir (${first.total})`);
check(rpc("dashboard_summary") === 2, "resumo: período atual + período de comparação (2 chamadas)");

// 2) Trocar o período: só o que depende do período (resumo x2 + gráfico)
const period = await step(() => page.getByLabel("Período").selectOption("last_30_days"));
check(period.total === 3 && rpc("dashboard_summary") === 2 && rpc("dashboard_timeseries") === 1,
  `trocar período busca só resumo e gráfico (${period.total} chamadas)`);
check(rpc("account_balances") === 0 && !calls.some((c) => c.includes("/clients?")), "trocar período não busca de novo clientes nem saldos");

// 3) Ir e voltar: a tela anterior vem do cache, sem chamar o servidor
await step(() => page.getByRole("link", { name: "Campanhas" }).first().click());
await page.getByRole("heading", { name: "Campanhas", level: 1 }).waitFor();
// Tabela de campanhas é paginada (nunca pede tudo de uma vez)
const tableCall = calls.find((c) => c.includes("/rpc/campaign_table "));
const limit = tableCall ? JSON.parse(tableCall.slice(tableCall.indexOf("{"))).p_limit : null;
check(limit != null && limit <= 200, `tabela de campanhas paginada (${limit} por página)`);
const back = await step(async () => {
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await page.getByRole("heading", { name: /Olá/ }).waitFor();
});
check(back.total === 0, `voltar ao Dashboard usa o cache (${back.total} chamadas)`);

// 4) Telas de plataforma e visão executiva também sem repetição
for (const [label, path] of [["Meta Ads", "/meta-ads"], ["Visão executiva", "/executivo"]]) {
  const r = await step(async () => {
    await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
  });
  check(r.repeated.length === 0, `${label}: nenhuma chamada repetida (${r.total} chamadas)`);
}

check(errors.length === 0, "nenhum erro no navegador: " + errors.join(" | "));
await browser.close();
console.log("\nTodos os testes de performance passaram.");
