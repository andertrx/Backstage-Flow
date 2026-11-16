/**
 * Fase 35.1 — "Conferir permissões" do token do Meta (só leitura). Supabase e Meta SIMULADOS.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.connections.push({ id: "c0000000-0000-4000-8000-000000000001", platform_id: "meta", label: "Backstage Flow - By STG", status: "ativa",
  external_user_id: "1", external_user_name: "Backstage Flow - By STG", last_checked_at: "2026-11-16T03:00:00Z", last_error: null, created_at: "2026-11-16T03:00:00Z" });

await login(page, "/configuracoes/integracoes");
await page.getByText("Backstage Flow - By STG", { exact: true }).waitFor();
await page.getByRole("button", { name: "Conferir permissões" }).click();
const panel = page.getByTestId("meta-permissions");
await panel.waitFor();
check(await panel.getByText("não tem tudo para criar campanhas", { exact: false }).isVisible(), "só leitura: avisa que falta permissão para criar");
check(await panel.locator("li").getByText("ads_management", { exact: true }).isVisible(), "lista a permissão ads_management");
check((await panel.getByText("Não concedida").count()) === 4, "4 permissões aparecem como não concedidas");
check((await panel.getByText("Concedida", { exact: true }).count()) === 2, "2 permissões concedidas (ads_read e business_management)");
await page.screenshot({ path: `${SHOTS}/35-1-permissoes-somente-leitura.png`, fullPage: true });

db.metaPermissionsGranted = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement", "instagram_basic"];
await page.getByRole("button", { name: "Conferir permissões" }).click();
await panel.getByText("todas as permissões para criar campanhas", { exact: false }).waitFor();
check(true, "com tudo concedido: diz que pode criar, sem publicar nada");

check(errors.length === 0, "sem erros no navegador");
await browser.close();
console.log("OK: meta-permissoes");
