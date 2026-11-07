/** Teste de navegador da 43.6 — Comercial e Envios semanais com menu próprio, links antigos que continuam valendo. Supabase SIMULADO. */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
await login(page, "/operacoes/minhas-tarefas");
const menu = page.getByRole("navigation", { name: "Menu principal" }).first();
await menu.getByRole("link", { name: "Envios semanais" }).waitFor();
const labels = (await menu.getByRole("link").allInnerTexts()).map((t) => t.trim().split("\n")[0]);
const i = labels.indexOf("Central de Operações");
check(labels[i + 1] === "Comercial" && labels[i + 2] === "Envios semanais", `no menu: Central de Operações, Comercial e Envios semanais, nessa ordem (${labels.slice(i, i + 3).join(", ")})`);
await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link", { name: "Tarefas", exact: true }).waitFor();
const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
check(!tabs.includes("Comercial") && !tabs.includes("Envios semanais"), `a Central não tem mais as abas Comercial e Envios (${tabs.join(", ")})`);
await page.screenshot({ path: `${SHOTS}/ops-separados-menu.png` });

await menu.getByRole("link", { name: "Comercial" }).click();
await page.waitForURL("**/comercial");
await page.getByTestId("ops-standalone").waitFor();
check(await page.getByRole("heading", { name: /^Comercial/, level: 1 }).count() === 1, "Comercial abre com o próprio título");
check(await menu.getByRole("link", { name: "Comercial" }).getAttribute("aria-current") === "page" && await menu.getByRole("link", { name: "Central de Operações" }).getAttribute("aria-current") === null, "só o item Comercial fica marcado no menu");
await menu.getByRole("link", { name: "Envios semanais" }).click();
await page.waitForURL("**/envios");
await page.getByRole("heading", { name: /^Envios semanais/, level: 1 }).waitFor({ state: "attached" });
check(await page.getByRole("heading", { name: /^Envios semanais/, level: 1 }).count() === 1, "Envios semanais abre com o próprio título");
await page.screenshot({ path: `${SHOTS}/ops-separados-envios.png` });

// links antigos (e-mail, aviso, histórico, Claude) continuam valendo e guardam filtros
await page.goto(`${BASE}/operacoes/comercial?ver=config`);
await page.waitForURL("**/comercial?ver=config");
check(true, "/operacoes/comercial?ver=config leva a /comercial?ver=config");
await page.goto(`${BASE}/operacoes/envios`);
await page.waitForURL("**/envios");
check(true, "/operacoes/envios leva a /envios");

// busca da Central ainda abre lead pelo link antigo
check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();

// quem só tem a Central (sem Comercial nem Envios) não vê os dois itens
{
  const { browser: b2, page: p2 } = await launch();
  await mockSupabase(p2, { role: "gestor" });
  await login(p2, "/");
  const m2 = p2.getByRole("navigation", { name: "Menu principal" }).first();
  await m2.getByRole("link", { name: "Clientes" }).waitFor();
  check(await m2.getByRole("link", { name: "Comercial" }).count() === 0 && await m2.getByRole("link", { name: "Envios semanais" }).count() === 0, "gestor sem a permissão de cada um: não vê Comercial nem Envios semanais");
  await b2.close();
}
console.log("OK: ops-separados");
