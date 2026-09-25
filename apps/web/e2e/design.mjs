/**
 * Teste de navegador da Etapa 21 — Design.
 * Menu lateral (ordem, grupos, recolher), título da aba, atalho de teclado,
 * cabeçalho e todas as páginas do menu cabendo no celular sem rolagem lateral.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const MENU = ["Dashboard", "Clientes", "Contas", "Meta Ads", "Google Ads", "Campanhas", "Relatórios", "Alertas", "Sincronização", "Logs", "Configurações"];
const PAGES = [
  ["/", "Dashboard"], ["/clientes", "Clientes"], ["/contas", "Contas"], ["/meta-ads", "Meta Ads"], ["/google-ads", "Google Ads"],
  ["/campanhas", "Campanhas"], ["/relatorios", "Relatórios"], ["/alertas", "Alertas"], ["/sincronizacao", "Sincronização"],
  ["/logs", "Logs"], ["/configuracoes/usuarios", "Configurações"],
];
const sidebar = (page) => page.getByTestId("sidebar");
const nav = (page) => sidebar(page).getByRole("navigation", { name: "Menu principal" });

const { browser, page, errors } = await launch();
await mockSupabase(page, { role: "admin" });
await login(page, "/");
await nav(page).waitFor();

// Menu: ordem exata e grupos
const links = await nav(page).getByRole("link").allInnerTexts();
check(JSON.stringify(links.map((l) => l.replace(/\d+\+?$/, "").trim())) === JSON.stringify(MENU), `menu na ordem pedida: ${links.join(", ")}`);
const menuText = await nav(page).innerText();
check(["VISÃO GERAL", "ANÚNCIOS", "ANÁLISE", "SISTEMA"].every((g) => menuText.toUpperCase().includes(g)), "menu separado em 4 grupos");
check(await nav(page).locator('a[aria-current="page"]').innerText() === "Dashboard", "item da página atual destacado");

// Título da aba e cabeçalho
await page.waitForFunction(() => document.title === "Dashboard · Backstage Flow");
check(true, "título da aba: Dashboard · Backstage Flow");
await nav(page).getByRole("link", { name: "Clientes" }).click();
await page.getByRole("heading", { name: "Clientes", level: 1 }).waitFor();
await page.waitForFunction(() => document.title === "Clientes · Backstage Flow");
check(await page.getByTestId("header-section").innerText() === "Clientes", "título muda ao trocar de página e o cabeçalho mostra a seção");
await page.screenshot({ path: `${SHOTS}/210-design-clientes.png` });

// Atalho "Pular para o conteúdo" (teclado), logo ao abrir a página
await page.reload();
await page.getByRole("heading", { name: "Clientes", level: 1 }).waitFor();
await page.keyboard.press("Tab");
const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
check(await skip.evaluate((el) => el === document.activeElement), "primeiro Tab mostra \"Pular para o conteúdo\"");
await page.keyboard.press("Enter");
check(await page.evaluate(() => document.activeElement?.id === "conteudo"), "Enter leva o foco para o conteúdo");

// Recolher o menu (e lembrar depois de recarregar)
await page.getByRole("button", { name: "Recolher menu" }).click();
check(await sidebar(page).getAttribute("data-collapsed") === "true", "menu recolhe");
await page.waitForFunction(() => document.querySelector("[data-testid=sidebar]").getBoundingClientRect().width <= 80, null, { timeout: 3000 }).catch(() => {});
const width = await sidebar(page).evaluate((el) => el.getBoundingClientRect().width);
check(width <= 80, `menu recolhido fica estreito (${Math.round(width)}px)`);
check(await nav(page).getByRole("link", { name: "Logs" }).count() === 1, "recolhido, os itens continuam com nome (leitor de tela e dica)");
await page.screenshot({ path: `${SHOTS}/211-design-menu-recolhido.png` });
await page.reload();
await nav(page).waitFor();
check(await sidebar(page).getAttribute("data-collapsed") === "true", "menu continua recolhido depois de recarregar");
await page.getByRole("button", { name: "Expandir menu" }).click();
check(await sidebar(page).getAttribute("data-collapsed") === "false", "menu expande de novo");

// Cada página do menu: abre e cabe no celular
await page.setViewportSize({ width: 390, height: 844 });
const tooWide = [];
for (const [path, label] of PAGES) {
  await page.goto(`${BASE}${path}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  if (o.sw > o.vw) tooWide.push(`${label} (${o.sw}px)`);
}
check(tooWide.length === 0, `todas as ${PAGES.length} páginas do menu cabem no celular ${tooWide.join(", ")}`);
await page.goto(`${BASE}/`);
await page.getByRole("heading", { level: 1 }).first().waitFor();
check(await sidebar(page).isHidden(), "no celular o menu fixo some");
await page.getByRole("button", { name: "Abrir menu" }).click();
const drawer = page.getByRole("dialog", { name: "Menu" });
await drawer.waitFor();
check(await drawer.getByRole("link").count() === MENU.length, "gaveta do celular com o menu completo");
await page.screenshot({ path: `${SHOTS}/212-design-celular-menu.png` });
await page.keyboard.press("Escape");
await drawer.waitFor({ state: "detached" });
check(true, "Esc fecha a gaveta do menu");
await page.screenshot({ path: `${SHOTS}/213-design-celular-dashboard.png`, fullPage: true });

// Desktop grande
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/`);
await page.getByRole("heading", { level: 1 }).first().waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/214-design-dashboard.png` });
const font = await page.evaluate(() => document.fonts.check('16px "Inter Variable"'));
check(font, "fonte Inter carregada (sem depender de site externo)");

check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();
console.log("Design: tudo certo.");
