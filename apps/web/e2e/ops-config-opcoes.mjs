/**
 * Teste de navegador T5.29 — Configurações da Central: ordem por arrastar (sem setas), desativadas por último e
 * botão Excluir (só o que ninguém usa; o que o sistema usa por nome não tem o botão). Supabase SIMULADO.
 */
import { BASE, check, launch, login, mockSupabase } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
// "Em Revisão" desativado e um status só nosso, sem uso, e outro em uso por uma tarefa
db.opsStatuses.find((s) => s.id === "em_revisao").active = false;
db.opsStatuses.push({ id: "meu_status", name: "Meu status", color: "#3B82F6", category: "andamento", position: 9, active: true });
db.opsStatuses.push({ id: "status_usado", name: "Status usado", color: "#3B82F6", category: "andamento", position: 10, active: true });
db.opsTasks.push({ id: "t-uso", status_id: "status_usado", sector_id: db.opsSectors[0].id, title: "x", people: [] });
await login(page, "/operacoes/configuracoes?ver=estrutura");
await page.getByTestId("ops-statuses").waitFor();
const list = page.getByTestId("ops-status-list");
await list.waitFor();

check(await page.getByRole("button", { name: /^Subir |^Descer / }).count() === 0, "nenhuma setinha de subir/descer");
check(await list.locator("[data-sortable-item]").count() >= 7, "as opções ativas têm alça para arrastar");
const badges = await list.locator("[data-testid=ops-status-row]").evaluateAll((rows) => rows.map((r) => r.textContent.includes("Desativado")));
check(badges.lastIndexOf(false) < badges.indexOf(true), `desativados ficam por último (${badges.map((b) => (b ? "D" : "A")).join("")})`);
check(await list.locator("[data-sortable-fixed]").count() === 1, "a opção desativada não tem alça (não arrasta)");

// arrastar "Cancelado" para cima de "Não Iniciado"
{
  const handle0 = list.getByLabel("Arrastar Cancelado", { exact: true });
  await handle0.scrollIntoViewIfNeeded();
  const handle = await handle0.boundingBox();
  const target = await list.locator("[data-sortable-item=nao_iniciado]").boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 6, { steps: 4 });
  await page.mouse.move(handle.x + handle.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}
await page.waitForFunction(() => document.querySelector("[data-testid=ops-status-list] [data-sortable-item]")?.getAttribute("data-sortable-item") === "cancelado");
check(db.opsStatuses.find((s) => s.id === "cancelado").position === 1, "arrastar grava a nova ordem");
check(db.opsStatuses.find((s) => s.id === "em_revisao").position > db.opsStatuses.find((s) => s.id === "status_usado").position, "a ordem dos desativados fica depois das ativas");

// excluir
check(await page.getByRole("button", { name: "Excluir Finalizado" }).count() === 0, "opção que o sistema usa por nome não tem Excluir");
await page.getByRole("button", { name: "Excluir Status usado" }).click();
await page.getByTestId("config-excluir-modal").getByRole("button", { name: "Sim, excluir" }).click();
await page.getByTestId("config-excluir-modal").getByText("está em uso").waitFor();
check(db.opsStatuses.some((s) => s.id === "status_usado"), "opção em uso não é excluída e explica por quê");
await page.getByTestId("config-excluir-modal").getByRole("button", { name: "Cancelar" }).click();

await page.getByRole("button", { name: "Excluir Meu status" }).click();
await page.getByTestId("config-excluir-modal").getByRole("button", { name: "Sim, excluir" }).click();
await page.getByRole("button", { name: "Excluir Meu status" }).waitFor({ state: "detached" });
check(!db.opsStatuses.some((s) => s.id === "meu_status"), "opção sem uso é excluída");

// tipos de atividade e outras listas ganharam ordem e exclusão
for (const id of ["ops-activity-types", "ops-meeting-categories", "ops-client-stages", "ops-onboarding-templates"]) {
  await page.getByTestId(id).waitFor();
  check(await page.getByTestId(id).getByRole("button", { name: /^Subir |^Descer / }).count() === 0, `${id}: sem setinhas`);
}
check(await page.getByTestId("ops-activity-types").locator("[data-sortable-item]").count() > 0, "tipos de atividade podem ser arrastados");
await page.getByRole("button", { name: "Excluir Entrega" }).click();
await page.getByTestId("config-excluir-modal").getByRole("button", { name: "Sim, excluir" }).click();
await page.getByRole("button", { name: "Excluir Entrega" }).waitFor({ state: "detached" });
check(!db.opsActivityTypes.some((t) => t.id === "entrega"), "tipo de atividade sem uso é excluído");
// Comercial → Configurações: colunas do funil e motivos de perda
await page.goto(`${BASE}/comercial?ver=config`);
await page.getByTestId("ops-lead-stages").waitFor();
await page.getByTestId("ops-loss-reasons").waitFor();
check(await page.getByTestId("ops-lead-stages").getByRole("button", { name: /^Subir |^Descer / }).count() === 0
  && await page.getByTestId("ops-lead-stages").locator("[data-sortable-item]").count() > 0, "colunas do funil: arrastar, sem setinhas");
check(await page.getByRole("button", { name: "Excluir Perdido" }).count() === 0 && await page.getByTestId("ops-loss-reasons").locator("[data-sortable-item]").count() > 0, "motivos de perda arrastam; 'Perdido' não tem Excluir");
check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
await browser.close();
console.log("Configurações da Central (T5.29): tudo certo.");
