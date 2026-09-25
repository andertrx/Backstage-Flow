/**
 * Teste de navegador da Etapa 20 — Permissões.
 * 1) Tela "Papéis e permissões" (administrador).
 * 2) Matriz: cada perfil tenta abrir cada página; quem não pode volta para o início.
 * A segurança de verdade (banco e servidor) é testada em supabase/tests/etapa20_permissions.sql.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- tela de papéis e permissões
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "admin" });
  await login(page, "/configuracoes/permissoes");
  await page.getByRole("heading", { name: "Papéis e permissões", level: 1 }).waitFor();
  check(await page.getByRole("link", { name: "Papéis e permissões" }).count() === 1, "aba nova nas Configurações");
  check(await page.getByTestId("permission-row").count() === 10, "10 permissões explicadas em português");
  const cell = (perm, role) => page.locator(`[data-testid=permission-row][data-permission="${perm}"] td[data-role=${role}] svg`).getAttribute("aria-label");
  check(await cell("logs.view", "gestor") === "Sim" && await cell("logs.view", "operador") === "Não", "logs: gestor sim, operador não");
  check(await cell("clients.edit", "gestor") === "Sim" && await cell("clients.edit", "operador") === "Não", "editar clientes: gestor sim, operador não");
  check(await cell("sync.run", "operador") === "Sim" && await cell("sync.run", "visualizador") === "Não", "sincronizar: operador sim, visualizador não");
  check(await cell("accounts.connect", "gestor") === "Não" && await cell("accounts.connect", "admin") === "Sim", "conectar plataformas: só administrador");
  const clienteSim = await page.locator('td[data-role=cliente] svg[aria-label="Sim"]').count();
  check(clienteSim === 0, "cliente: nenhuma permissão interna");
  check(clean(await page.getByTestId("scope-row").innerText()).includes("Só a própria empresa, sem informações internas"), "linha de quais clientes cada papel vê");
  check(clean(await page.getByTestId("never-list").innerText()).includes("mudar o próprio papel"), "lista do que ninguém faz pelo site");
  await page.screenshot({ path: `${SHOTS}/200-permissoes.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check(overflow.sw <= overflow.vw, `no celular a página cabe na tela ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/201-permissoes-celular.png`, fullPage: true });
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- matriz: perfil × página
const ROUTES = [
  // [endereço, nome no menu, quem pode]
  ["/clientes", "Clientes", ["admin", "gestor", "operador", "visualizador"]],
  ["/contas", "Contas", ["admin", "gestor", "operador", "visualizador"]],
  ["/meta-ads", "Meta Ads", ["admin", "gestor", "operador", "visualizador"]],
  ["/google-ads", "Google Ads", ["admin", "gestor", "operador", "visualizador"]],
  ["/campanhas", "Campanhas", ["admin", "gestor", "operador", "visualizador"]],
  ["/relatorios", "Relatórios", ["admin", "gestor", "operador"]],
  ["/alertas", "Alertas", ["admin", "gestor", "operador", "visualizador"]],
  ["/sincronizacao", "Sincronização", ["admin", "gestor", "operador", "visualizador"]],
  ["/logs", "Logs", ["admin", "gestor"]],
  ["/configuracoes/usuarios", "Configurações", ["admin"]],
  ["/configuracoes/permissoes", null, ["admin"]],
];

for (const role of ["admin", "gestor", "operador", "visualizador", "cliente"]) {
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role });
  await login(page, "/");
  await page.waitForURL((u) => u.pathname === "/", { timeout: 8000 });
  await page.getByRole("navigation", { name: "Menu principal" }).first().waitFor();
  const menu = await page.getByRole("navigation", { name: "Menu principal" }).first().innerText();
  const wrong = [];
  for (const [path, label, allowed] of ROUTES) {
    const can = allowed.includes(role);
    if (label && menu.includes(label) !== can) wrong.push(`menu ${label}`);
    await page.goto(`${BASE}${path}`);
    // Quem não pode é mandado de volta para o início.
    await page.waitForFunction(([p, c]) => (c ? location.pathname === p : location.pathname === "/"), [path, can], { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(150);
    const at = new URL(page.url()).pathname;
    if (can ? at !== path : at !== "/") wrong.push(`${path} → ${at}`);
  }
  check(wrong.length === 0, `${role}: menu e páginas certos (${ROUTES.filter((r) => r[2].includes(role)).length} de ${ROUTES.length} liberadas)${wrong.length ? " ERRADO: " + wrong.join(", ") : ""}`);
  check(errors.length === 0, `${role}: sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

console.log("Permissões: tudo certo.");
