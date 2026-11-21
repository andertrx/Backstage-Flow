/**
 * Fase 35.2 (passo 1) — Campaign Builder: menu, permissões por pessoa e rascunhos. Supabase simulado. Nada é criado no Meta.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLIENT = { id: "55555555-5555-4555-8555-555555555555", name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null, phone: null, email: null,
  notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null, excluded_at: null };
const ACCOUNT = { id: "a0000000-0000-4000-8000-000000000001", platform_id: "meta", external_id: "1001", client_id: CLIENT.id, connection_id: null, name: "Excalibur - Principal",
  currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", raw_status: "account_status=1", status_reason: null, business_name: "BM Agência", is_prepay: null,
  manager_customer_id: null, is_test_account: null, linked_at: "2026-09-25T00:00:00Z", details_updated_at: "2026-09-25T00:00:00Z", unlinked_at: null, assets: [] };
const GESTORA = "22222222-2222-2222-2222-222222222222";

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push({ ...CLIENT });
  db.adAccounts.push({ ...ACCOUNT });

  await login(page, "/criar-campanhas");
  await page.getByRole("heading", { name: "Criar campanhas", exact: true }).waitFor();
  const menu = page.getByRole("link", { name: "Criar", exact: true });
  check(await menu.isVisible(), "item de menu 'Criar' aparece para o administrador");
  check(await page.getByText("Nenhum rascunho ainda.").isVisible(), "começa sem rascunhos");
  check(await page.getByText("Nada é criado no Meta por aqui", { exact: false }).isVisible(), "diz claramente que nada é criado no Meta");

  // Novo rascunho
  await page.getByRole("button", { name: "Novo rascunho" }).click();
  const dlg = page.getByRole("dialog", { name: "Novo rascunho de campanha" });
  const create = dlg.getByRole("button", { name: "Criar rascunho" });
  check(await create.isDisabled(), "criar fica desligado sem nome e conta");
  await dlg.getByLabel("Nome do rascunho").fill("Black Friday — Cadastros");
  await dlg.getByLabel("Conta de anúncio (Meta)").selectOption({ label: "Excalibur Fitness — Excalibur - Principal" });
  await create.click();
  await page.waitForURL("**/criar/campanhas/*");
  await page.getByRole("heading", { name: "Campanha", exact: true }).waitFor();
  check(true, "criar o rascunho abre o editor");
  await page.getByRole("link", { name: "Rascunhos" }).click();
  await page.getByTestId("builder-rascunhos").getByText("Black Friday — Cadastros").waitFor();
  check(true, "rascunho criado aparece na lista");
  check(db.builderDrafts.length === 1 && db.builderDrafts[0].version === 1, "rascunho guardado só no CRM (versão 1)");
  check(await page.getByText("Excalibur Fitness · Excalibur - Principal", { exact: false }).isVisible(), "mostra cliente e conta");

  // Token no nome é recusado
  await page.getByRole("button", { name: "Novo rascunho" }).click();
  await dlg.getByLabel("Nome do rascunho").fill("token: EAABwzLixnjYBAKZCZB1234567890abcdef");
  await dlg.getByLabel("Conta de anúncio (Meta)").selectOption({ label: "Excalibur Fitness — Excalibur - Principal" });
  await dlg.getByRole("button", { name: "Criar rascunho" }).click();
  await dlg.getByText("senha, token ou chave", { exact: false }).waitFor();
  check(db.builderDrafts.length === 1, "nome com token é recusado e nada é gravado");
  await dlg.getByRole("button", { name: "Cancelar" }).click();

  // Quem pode o quê
  const people = page.getByTestId("builder-pessoas");
  await people.getByText("Maria Gestora").waitFor();
  await people.getByLabel("Maria Gestora: publicar").click();
  await page.waitForTimeout(500);
  check(await people.getByLabel("Maria Gestora: editar").isChecked(), "publicar liga 'editar' junto (regra do banco)");
  check(db.builderPerms[GESTORA]?.publicar === true && db.builderPerms[GESTORA]?.editar === true, "permissão salva por pessoa");
  await people.getByLabel("Maria Gestora: editar").click();
  await page.waitForTimeout(500);
  check(db.builderPerms[GESTORA]?.publicar === false && db.builderPerms[GESTORA]?.criar === false, "desligar 'editar' desliga criar e publicar");
  await page.screenshot({ path: `${SHOTS}/35-2-criar-campanhas-admin.png`, fullPage: true });

  // Arquivar não apaga
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Arquivar Black Friday — Cadastros" }).click();
  await page.getByText("Nenhum rascunho ainda.").waitFor();
  check(db.builderDrafts.length === 1 && db.builderDrafts[0].archived_at, "arquivar tira da lista mas guarda o rascunho");

  check(errors.length === 0, "sem erros no navegador");
  await browser.close();
}

// ------------------------------------------------------------ gestor sem permissão
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  db.clients.push({ ...CLIENT });
  db.adAccounts.push({ ...ACCOUNT });
  await login(page, "/criar-campanhas");
  await page.getByRole("heading", { name: "Criar campanhas", exact: true }).waitFor();
  check(await page.getByText("ainda não tem permissão para criar", { exact: false }).isVisible(), "gestor sem permissão vê o aviso");
  check((await page.getByRole("button", { name: "Novo rascunho" }).count()) === 0, "gestor sem permissão não vê 'Novo rascunho'");
  check((await page.getByTestId("builder-pessoas").count()) === 0, "gestor não vê 'Quem pode o quê'");
  check(errors.length === 0, "sem erros no navegador (gestor)");
  await browser.close();
}

// ------------------------------------------------------------ papéis sem acesso
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "visualizador" });
  await login(page, "/");
  check((await page.getByRole("link", { name: "Criar", exact: true }).count()) === 0, "visualizador não vê o item no menu");
  await browser.close();
}
console.log("OK: campaign-builder");
