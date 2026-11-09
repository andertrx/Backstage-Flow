/**
 * Teste de navegador — Tema escuro (53.4): botão sol/lua, escolha salva, telas legíveis. Supabase SIMULADO.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ id: "e0000000-0000-4000-8000-000000005301", name: "Loja Atacado", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
await login(page, "/");
await page.getByRole("heading", { name: /^Olá/ }).waitFor();
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
const t0 = await theme(); check(t0 === "light", `começa no tema claro (${t0})`);
await page.getByTestId("theme-toggle").click();
await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
check(true, "o botão liga o tema escuro");
await page.waitForTimeout(900);
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check(bg === "rgb(11, 11, 13)", `fundo escuro (${bg})`);
await page.screenshot({ path: `${SHOTS}/tema-escuro-dashboard.png` });
await page.reload();
await page.getByRole("heading", { name: /^Olá/ }).waitFor();
check(await theme() === "dark", "a escolha continua depois de recarregar");
for (const [path, shot] of [["/tracking", "tema-escuro-tracking"], ["/clientes", "tema-escuro-clientes"], ["/operacoes/clientes", "tema-escuro-onboarding"]]) {
  await page.goto(page.url().split("/").slice(0, 3).join("/") + path);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/${shot}.png` });
}
await page.getByTestId("theme-toggle").click();
await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
check(true, "o botão volta ao tema claro");
check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
console.log("tema-escuro: OK");
