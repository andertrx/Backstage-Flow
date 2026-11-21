/** Teste de navegador (21/11/2026) — "Criar": rascunhos de campanha + Criador de Anúncios em abas; endereços antigos redirecionam. Supabase SIMULADO. */
import { BASE, check, launch, login, mockSupabase } from "./support.mjs";

const { browser, page, errors } = await launch();
await mockSupabase(page, { role: "admin" });
await login(page, "/criar-campanhas");
await page.waitForURL("**/criar/campanhas");
const abas = page.getByRole("navigation", { name: "Criar" });
await abas.getByRole("link", { name: "Criador de Anúncios" }).waitFor();
check((await abas.getByRole("link").allInnerTexts()).join("|") === "Criar campanhas|Criador de Anúncios", "duas abas: Criar campanhas e Criador de Anúncios");
const menu = await page.getByRole("navigation", { name: "Menu principal" }).first().innerText();
check(!/Criar campanhas|Criador de Anúncios/.test(menu) && /\bCriar\b/.test(menu), "o menu tem um item só: Criar");
await abas.getByRole("link", { name: "Criador de Anúncios" }).click();
await page.waitForURL("**/criar/anuncios");
await page.getByTestId("ads-builder").waitFor();
check(true, "aba Criador de Anúncios abre a tela de sempre");
await page.goto(`${BASE}/criador-de-anuncios`);
await page.waitForURL("**/criar/anuncios");
check(true, "/criador-de-anuncios antigo leva à aba nova");
await page.goto(`${BASE}/criar`);
await page.waitForURL("**/criar/campanhas");
check(true, "/criar abre os rascunhos");
check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();

{
  const { browser: b2, page: p2 } = await launch();
  await mockSupabase(p2, { role: "visualizador" });
  await login(p2, "/");
  await p2.getByRole("navigation", { name: "Menu principal" }).first().waitFor();
  await p2.goto(`${BASE}/criar`);
  await p2.waitForTimeout(800);
  check(new URL(p2.url()).pathname === "/", "visualizador não entra em Criar");
  await b2.close();
}
console.log("OK: criar-unificado");
