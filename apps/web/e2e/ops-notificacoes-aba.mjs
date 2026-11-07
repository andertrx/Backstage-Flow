/** Teste de navegador — aba "Notificações" na Central (cartão "Aviso no computador e no celular" + preferências). Supabase SIMULADO. */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const { browser, page, errors } = await launch();
await mockSupabase(page, { role: "admin" });
await login(page, "/operacoes/minhas-tarefas");
await page.getByRole("navigation", { name: "Menu principal" }).first().getByRole("link", { name: "Notificações" }).click();
await page.waitForURL("**/notificacoes");
const card = page.getByTestId("ops-push-card");
await card.waitFor();
check((await card.innerText()).includes("Aviso no computador e no celular"), "a aba abre o cartão de aviso no aparelho");
check(await card.getByTestId("ops-push-state").count() === 1, "mostra o estado deste aparelho (ativar/enviar teste)");
await page.screenshot({ path: `${SHOTS}/ops-notificacoes-aba.png` });
check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();
console.log("OK: ops-notificacoes-aba");
