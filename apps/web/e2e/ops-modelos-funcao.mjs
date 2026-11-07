/** Teste de navegador da 43.3 (fase 2) — modelos de função na equipe da Central. Supabase SIMULADO. */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
await login(page, "/operacoes/equipe");
await page.getByTestId("ops-team").getByText("Maria Gestora").first().waitFor();
await page.getByRole("button", { name: "Editar Maria Gestora na Central" }).click();
const dialog = page.getByRole("dialog", { name: /Maria Gestora na Central/ });
await dialog.getByLabel("Setor principal").selectOption({ label: "Comercial" });
const box = (nome) => dialog.getByTestId("member-permissions").getByLabel(nome);
const sel = dialog.getByLabel("Modelo de função:");
const opts = await sel.locator("option").allInnerTexts();
check(opts.includes("Gestor de tráfego") && opts.includes("Operação") && opts.includes("Comercial") && !opts.includes("Administrador"), "modelos oferecidos (administrador fica de fora: é o papel do usuário)");

await sel.selectOption({ label: "Comercial" });
check(await box("Comercial: leads e conversão em cliente").isChecked() && await box("Acessar a Central de Operações").isChecked(), "Comercial marca leads e acesso");
check(!(await box("Envios semanais: configurar mensagens para grupos e ver o histórico").isChecked()), "Comercial não marca Envios semanais");
check(!(await box("Arquivar ou excluir tarefas").isChecked()), "nenhum modelo marca arquivar tarefas");
await sel.selectOption({ label: "Gestor de tráfego" });
check(await box("Envios semanais: configurar mensagens para grupos e ver o histórico").isChecked() && !(await box("Comercial: leads e conversão em cliente").isChecked()), "Gestor de tráfego troca o conjunto inteiro (envios sim, leads não)");
await page.screenshot({ path: `${SHOTS}/ops-modelos-funcao.png` });
await box("Ver o dashboard operacional").uncheck(); // ajuste fino à mão continua possível
await dialog.getByRole("button", { name: "Salvar" }).click();
await dialog.waitFor({ state: "detached" });
const call = db.rpcCalls.filter((c) => c.fn === "ops_member_save").at(-1);
check(call && call.p_permissions.includes("ops.envios") && !call.p_permissions.includes("ops.dashboard.view") && !call.p_permissions.includes("ops.commercial"), "salva exatamente o que ficou marcado");
check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();

// Papéis e permissões mostra os 4 modelos
{
  const { browser: b2, page: p2 } = await launch();
  await mockSupabase(p2, { role: "admin" });
  await login(p2, "/configuracoes/permissoes");
  await p2.getByTestId("role-templates").waitFor();
  check(await p2.getByTestId("role-template").count() === 4, "tela Papéis e permissões lista os 4 modelos");
  await b2.close();
}
console.log("OK: ops-modelos-funcao");
