/** Teste de navegador da 43.3 (A) — grupos do menu recolhíveis, com padrão por papel. Supabase SIMULADO. */
import { check, launch, login, mockSupabase } from "./support.mjs";

async function sistemaVisivel(page) {
  return page.getByRole("navigation", { name: "Menu principal" }).first().getByRole("link", { name: "Sincronização" }).isVisible();
}
// Gestor: Sistema começa recolhido, mas nada é retirado
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "gestor" });
  await login(page, "/");
  const nav = page.getByRole("navigation", { name: "Menu principal" }).first();
  await nav.getByRole("link", { name: "Clientes" }).waitFor();
  const toggle = nav.locator('[data-testid="nav-group-toggle"][data-group="Sistema"]');
  check(await toggle.getAttribute("aria-expanded") === "false" && !(await sistemaVisivel(page)), "gestor: grupo Sistema começa recolhido");
  const grupos = (await nav.locator('[data-testid="nav-group-toggle"]').allInnerTexts()).map((g) => g.trim().toLowerCase());
  check(JSON.stringify(grupos) === JSON.stringify(["visão geral", "anúncios", "análise", "sistema"]), `ordem dos grupos intacta (${grupos.join(", ")})`);
  await toggle.click();
  check(await sistemaVisivel(page), "abrir mostra Sincronização e Logs");
  await page.reload();
  await nav.getByRole("link", { name: "Clientes" }).waitFor();
  check(await sistemaVisivel(page), "a escolha da pessoa é lembrada depois de recarregar");
  await toggle.click();
  check(!(await sistemaVisivel(page)), "fechar de novo esconde");
  // o grupo da tela aberta nunca fica escondido
  await page.goto(page.url().replace(/\/$/, "") + "/sincronizacao");
  await nav.getByRole("link", { name: "Sincronização" }).waitFor();
  check(await sistemaVisivel(page), "na tela de Sincronização o grupo Sistema aparece aberto");
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}
// Admin: tudo aberto
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "admin" });
  await login(page, "/");
  const nav = page.getByRole("navigation", { name: "Menu principal" }).first();
  await nav.getByRole("link", { name: "Clientes" }).waitFor();
  check(await sistemaVisivel(page), "administrador: tudo aberto");
  await browser.close();
}
console.log("OK: menu-grupos");
