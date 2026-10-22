/**
 * Teste de navegador — Política de Privacidade e Termos de Serviço (22/10/2026):
 * páginas públicas (sem login), exigidas pelo Google na tela de autorização, com links na tela de entrada.
 */
import { BASE, check, launch, mockSupabase, SHOTS } from "./support.mjs";

const { browser, page, errors } = await launch();
await mockSupabase(page, { role: "admin" });

await page.goto(`${BASE}/privacidade`);
await page.getByRole("heading", { name: "Política de Privacidade" }).waitFor();
check(page.url().endsWith("/privacidade"), "política abre sem login (não manda para a entrada)");
const privacy = await page.getByTestId("legal-page").innerText();
check(privacy.includes("Uso Limitado") && privacy.includes("Política de Dados do Usuário dos Serviços de API do Google"), "política: declaração de Uso Limitado do Google");
check(privacy.includes("SHA-256") && privacy.includes("myaccount.google.com/permissions"), "política: hash dos contatos e como revogar o acesso");
await page.screenshot({ path: `${SHOTS}/legal-privacidade.png`, fullPage: true });

await page.getByRole("link", { name: "Termos de Serviço" }).click();
await page.getByRole("heading", { name: "Termos de Serviço" }).waitFor();
check(page.url().endsWith("/termos"), "termos abrem sem login");

await page.goto(`${BASE}/login`);
const links = page.getByTestId("legal-links");
await links.waitFor();
check(await links.getByRole("link", { name: "Política de Privacidade" }).getAttribute("href") === "/privacidade", "entrada: link da Política de Privacidade");
check(await links.getByRole("link", { name: "Termos de Serviço" }).getAttribute("href") === "/termos", "entrada: link dos Termos de Serviço");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/privacidade`);
await page.getByRole("heading", { name: "Política de Privacidade" }).waitFor();
check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular não há rolagem para o lado");
check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();
console.log(`Política de Privacidade e Termos: tudo certo (${BASE}).`);
