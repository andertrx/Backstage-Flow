/** Teste de navegador (21/11/2026) — Configurações unificada: abas por permissão e endereços antigos que continuam funcionando. Supabase SIMULADO. */
import { check, launch, login, mockSupabase } from "./support.mjs";

// Lê as abas esperando a tela se firmar (o menu e as permissões carregam em momentos diferentes).
const abas = async (page, esperado) => {
  let r = [];
  for (let i = 0; i < 40; i++) {
    r = (await page.getByRole("navigation", { name: "Configurações" }).getByRole("link").allInnerTexts()).map((t) => t.trim());
    if (esperado && JSON.stringify(r) === JSON.stringify(esperado)) break;
    await page.waitForTimeout(150);
  }
  return r;
};

{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "admin" });
  await login(page, "/");
  await page.getByRole("navigation", { name: "Menu principal" }).first().getByRole("link", { name: "Configurações", exact: true }).click();
  await page.waitForURL("**/configuracoes/usuarios");
  await page.getByRole("navigation", { name: "Configurações" }).getByRole("link", { name: "Central", exact: true }).waitFor();
  check(JSON.stringify(await abas(page, ["Usuários", "Integrações", "Papéis e permissões", "Central", "Sincronização", "Logs"])) === JSON.stringify(["Usuários", "Integrações", "Papéis e permissões", "Central", "Sincronização", "Logs"]), "admin: seis abas em Configurações");
  await page.getByRole("navigation", { name: "Configurações" }).getByRole("link", { name: "Logs" }).click();
  await page.getByRole("heading", { name: "Logs", level: 1 }).waitFor();
  const menu = await page.getByRole("navigation", { name: "Menu principal" }).first().innerText();
  check(!/Sincronização|Logs|Configurações da Central/.test(menu), "o menu lateral não repete Sincronização, Logs nem Configurações da Central");
  // endereços antigos continuam abrindo (e mantêm ?filtros)
  await page.goto(page.url().replace(/\/configuracoes\/.*$/, "/logs?aba=erros"));
  await page.waitForURL("**/configuracoes/logs?aba=erros");
  check(true, "/logs → /configuracoes/logs, mantendo ?aba=erros");
  await page.goto(page.url().replace(/\/configuracoes\/.*$/, "/sincronizacao"));
  await page.waitForURL("**/configuracoes/sincronizacao");
  await page.getByRole("heading", { name: "Sincronização", level: 1 }).waitFor();
  check(true, "/sincronizacao → aba Sincronização");
  await page.goto(page.url().replace(/\/configuracoes\/.*$/, "/config-central?ver=equipe"));
  await page.waitForURL("**/configuracoes/central?ver=equipe");
  check(true, "/config-central → aba Central, mantendo ?ver=equipe");
  check(errors.length === 0, `admin: sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "gestor" });
  await login(page, "/configuracoes");
  await page.waitForURL("**/configuracoes/sincronizacao");
  await page.getByRole("navigation", { name: "Configurações" }).getByRole("link", { name: "Logs" }).waitFor();
  check(JSON.stringify(await abas(page, ["Sincronização", "Logs"])) === JSON.stringify(["Sincronização", "Logs"]), "gestor: só Sincronização e Logs");
  await page.goto(page.url().replace(/\/configuracoes\/.*$/, "/configuracoes/usuarios"));
  await page.waitForURL((u) => u.pathname === "/");
  check(true, "gestor não abre Usuários (volta ao início)");
  check(errors.length === 0, `gestor: sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "equipe" });
  await login(page, "/configuracoes");
  await page.waitForURL((u) => u.pathname === "/" || u.pathname.startsWith("/operacoes") || u.pathname === "/vendas-sugeridas", { timeout: 8000 });
  check(!new URL(page.url()).pathname.startsWith("/configuracoes"), "equipe não entra em Configurações");
  await browser.close();
}
console.log("OK: settings-unificada");
