/**
 * Teste de navegador da Etapa 27 — Modo demonstração.
 * Aqui NÃO há Supabase simulado pelo teste: a própria demonstração responde no
 * navegador. O teste confere que nenhuma chamada sai para a internet.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

// 1) No login real existe o convite para a demonstração, e o sistema real não mostra a faixa
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "admin" });
  await page.goto(`${BASE}/login`);
  const link = page.getByRole("link", { name: "Ver demonstração com dados fictícios" });
  await link.waitFor();
  check((await link.getAttribute("href")) === "/demo", "login: link para a demonstração");
  check(await page.getByTestId("demo-banner").count() === 0, "sistema real: sem faixa de demonstração");
  await login(page, "/");
  await page.getByRole("heading", { name: /Olá/ }).waitFor();
  check(await page.getByTestId("demo-banner").count() === 0 && !(await page.title()).includes("DEMONSTRAÇÃO"), "sistema real logado: nada de demonstração");
  await browser.close();
}

// 2) Demonstração: tudo local, claramente identificado
{
  const { browser, page, errors } = await launch();
  const external = [];
  page.on("request", (r) => { if (!r.url().startsWith(BASE)) external.push(r.url()); });
  await page.goto(`${BASE}/demo`);
  const banner = page.getByTestId("demo-banner");
  await banner.waitFor({ timeout: 15000 });
  check(clean(await banner.innerText()).includes("MODO DEMONSTRAÇÃO"), "faixa MODO DEMONSTRAÇÃO visível");
  check(clean(await banner.innerText()).includes("Nada aqui é real"), "faixa avisa que os dados não são reais");
  await page.getByRole("heading", { name: /Olá/ }).waitFor();
  check(new URL(page.url()).pathname === "/", "entra direto no Dashboard, sem pedir senha");
  check((await page.title()).startsWith("[DEMONSTRAÇÃO]"), "título da aba marcado como demonstração");
  await page.getByRole("group", { name: "Investimento", exact: true }).waitFor();
  check(/R\$\s?[\d.]+,\d{2}/.test(clean(await page.getByRole("group", { name: "Investimento", exact: true }).innerText())), "dashboard com números fictícios");
  check(await page.getByRole("tab", { name: "USD" }).count() === 1, "moedas separadas (BRL e USD), sem conversão");
  await page.screenshot({ path: `${SHOTS}/270-demo-dashboard.png` });

  // Outras telas funcionam com os dados fictícios
  await page.getByRole("link", { name: "Clientes" }).first().click();
  await page.getByRole("heading", { name: "Clientes", level: 1 }).waitFor();
  await page.getByText("Academia Movimento (Demo)").first().waitFor();
  const body = await page.locator("main").innerText();
  check((body.match(/\(Demo\)/g) ?? []).length >= 4, "clientes fictícios, todos com (Demo) no nome");
  check(await banner.isVisible(), "faixa continua visível em outras telas");

  await page.getByRole("link", { name: "Campanhas" }).first().click();
  await page.getByRole("heading", { name: "Campanhas", level: 1 }).waitFor();
  await page.getByText("Matrículas - Leads").first().waitFor();
  check(true, "campanhas fictícias na tabela");
  await page.screenshot({ path: `${SHOTS}/271-demo-campanhas.png` });

  await page.getByRole("link", { name: "Alertas" }).first().click();
  await page.getByRole("heading", { name: "Alertas", level: 1 }).waitFor();
  await page.getByText("o limite de gastos foi atingido").first().waitFor();
  check(true, "alertas fictícios");

  // Continua na demonstração ao recarregar (só nesta aba)
  await page.reload();
  await banner.waitFor();
  check(true, "recarregar a página continua na demonstração");

  check(external.length === 0, `nenhuma chamada saiu do navegador (${external.length}): ${external.slice(0, 3).join(", ")}`);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sb-")));
  check(stored.length === 0, "a demonstração não mexe no login real guardado no navegador");

  // Sair da demonstração volta ao login real, sem faixa
  await banner.getByRole("button", { name: "Sair da demonstração" }).click();
  await page.waitForURL("**/login");
  await page.getByRole("button", { name: "Entrar" }).waitFor();
  check(await page.getByTestId("demo-banner").count() === 0, "ao sair: volta ao login real, sem faixa");
  check(errors.length === 0, "nenhum erro no navegador: " + errors.join(" | "));
  await browser.close();
}

console.log("\nTodos os testes do modo demonstração passaram.");
