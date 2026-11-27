/**
 * Teste de navegador (27/11/2026) — abertura da marca: aparece no primeiro acesso da sessão, dá para pular,
 * some sozinha, não volta ao recarregar, e NÃO aparece em navegador automatizado (movimento desligado).
 * A tela de login nova (painel da marca + formulário) continua entrando normalmente.
 */
import { chromium } from "playwright";
import { BASE, check } from "./support.mjs";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];

// 1) Automatizado (padrão): sem abertura
{
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "Entrar" }).waitFor();
  check((await page.getByTestId("splash").count()) === 0, "navegador automatizado: sem tela de abertura");
  check((await page.getByText("Nos bastidores, o resultado").count()) >= 1, "login: painel da marca com a frase");
  await page.close();
}

// 2) Como uma pessoa: abertura aparece, pula, não volta
{
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 820 } })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); });
  await page.goto(`${BASE}/login`);
  await page.getByTestId("splash").waitFor();
  check(true, "primeiro acesso: a abertura aparece");
  await page.getByRole("button", { name: /PULAR/ }).click();
  await page.getByTestId("splash").waitFor({ state: "detached", timeout: 3000 });
  check(true, "PULAR fecha a abertura");
  await page.reload();
  await page.getByRole("button", { name: "Entrar" }).waitFor();
  check((await page.getByTestId("splash").count()) === 0, "recarregar na mesma sessão: não volta");
  await page.close();
}
// 3) Abertura sozinha termina
{
  const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); });
  await page.goto(`${BASE}/login`);
  await page.getByTestId("splash").waitFor();
  await page.getByTestId("splash").waitFor({ state: "detached", timeout: 6000 });
  check(true, "sem clicar, a abertura termina sozinha em poucos segundos");
  check(await page.getByTestId("auth-logo").isVisible(), "celular: logo no topo do formulário (painel escuro escondido)");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, "celular: sem rolagem horizontal");
  await page.close();
}
check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
console.log("splash: OK");
