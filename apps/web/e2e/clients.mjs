/**
 * Teste de navegador da Etapa 2 — Clientes.
 * Supabase SIMULADO (support.mjs). Como rodar: npm run e2e -w @backstage/web
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  await login(page, "/clientes");
  await page.getByText("Nenhum cliente cadastrado ainda.").waitFor();
  check(true, "lista vazia mostra orientação");

  // Cadastro com validações
  await page.getByRole("button", { name: "Novo cliente" }).click();
  const form = page.getByRole("dialog", { name: "Novo cliente" });
  await form.getByRole("button", { name: "Cadastrar cliente" }).click();
  await form.getByText("Informe o nome do cliente.").waitFor();
  check(true, "nome é obrigatório");

  await form.getByLabel("Nome do cliente *").fill("Excalibur Fitness");
  await form.getByLabel("Empresa (razão social)").fill("Excalibur Academia Ltda");
  await form.getByLabel("CNPJ (opcional)").fill("11.222.333/0001-82");
  await form.getByRole("button", { name: "Cadastrar cliente" }).click();
  await form.getByText("CNPJ inválido. Confira os números.").waitFor();
  check(true, "CNPJ com dígito errado é recusado");

  await form.getByLabel("CNPJ (opcional)").fill("11.222.333/0001-81");
  await form.getByLabel("Responsável").fill("João Silva");
  await form.getByLabel("Telefone").fill("(45) 99999-8888");
  await form.getByLabel("E-mail").fill("Contato@Excalibur.com.br");
  await form.getByLabel("Observações").fill("Academia em Cafelândia.");
  await page.screenshot({ path: `${SHOTS}/10-cliente-form.png` });
  await form.getByRole("button", { name: "Cadastrar cliente" }).click();
  await page.waitForURL(/\/clientes\/[0-9a-f-]{36}$/);
  check(true, "após cadastrar abre a página do cliente");

  const saved = db.clients[0];
  check(
    saved.cnpj === "11222333000181" && saved.phone === "5545999998888" && saved.email === "contato@excalibur.com.br" && saved.timezone === "America/Sao_Paulo",
    "dados gravados já normalizados (CNPJ, telefone, e-mail, fuso)",
  );

  await page.getByRole("heading", { name: "Excalibur Fitness" }).waitFor();
  await page.getByText("11.222.333/0001-81").waitFor();
  await page.getByText("+55 (45) 99999-8888").waitFor();
  check(true, "detalhe mostra CNPJ e telefone formatados");
  await page.getByRole("heading", { name: "Contas Meta Ads" }).waitFor();
  check(await page.getByText("Nenhuma conta vinculada.").first().isVisible(), "seção de contas Meta vazia, sem dados inventados");
  check(await page.getByText("A conexão com a plataforma será construída na Etapa 4.").isVisible(), "seção de contas Google sem dados inventados");

  // Equipe com acesso
  await page.getByLabel("Usuário para liberar").selectOption({ label: "Maria Gestora — Gestor" });
  await page.getByRole("button", { name: "Liberar acesso" }).click();
  await page.getByText("gestor@agencia.com").waitFor();
  check(db.access.length === 1 && db.access[0].user_id === "22222222-2222-2222-2222-222222222222", "admin libera acesso a um gestor");
  await page.screenshot({ path: `${SHOTS}/11-cliente-detalhe.png`, fullPage: true });
  await page.getByRole("button", { name: "Remover acesso de gestor@agencia.com" }).click();
  await page.getByText("Nenhum usuário (além dos administradores) tem acesso a este cliente.").waitFor();
  check(db.access.length === 0, "admin remove acesso");

  // Edição
  await page.getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar cliente" });
  await edit.getByLabel("Status").selectOption("pausado");
  await edit.getByRole("button", { name: "Salvar" }).click();
  await edit.waitFor({ state: "detached" });
  await page.getByText("Pausado", { exact: true }).first().waitFor();
  check(db.clients[0].status === "pausado", "edição muda o status");

  // Lista, filtros e busca
  await page.getByRole("link", { name: "Clientes" }).first().click();
  await page.getByText("Nenhum cliente encontrado com esses filtros.").waitFor();
  check(true, "filtro padrão 'Ativo' esconde cliente pausado");
  await page.getByRole("tab", { name: /Todos/ }).click();
  await page.getByLabel("Buscar cliente").fill("excalíbur");
  await page.getByRole("cell", { name: /Excalibur Fitness/ }).waitFor();
  check(true, "busca ignora acentos e maiúsculas");
  await page.screenshot({ path: `${SHOTS}/12-clientes-lista.png` });

  // CNPJ duplicado → mensagem amigável vinda do banco
  await page.getByRole("button", { name: "Novo cliente" }).click();
  const dup = page.getByRole("dialog", { name: "Novo cliente" });
  await dup.getByLabel("Nome do cliente *").fill("Outra Academia");
  await dup.getByLabel("CNPJ (opcional)").fill("11222333000181");
  await dup.getByRole("button", { name: "Cadastrar cliente" }).click();
  await dup.getByText("Já existe um cliente com este CNPJ.").waitFor();
  check(true, "CNPJ duplicado mostra mensagem amigável");
  await dup.getByRole("button", { name: "Cancelar" }).click();

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${SHOTS}/13-clientes-celular.png` });

  check(errors.length === 0, "nenhum erro de JavaScript (admin): " + errors.join(" | "));
  await browser.close();
}

// ------------------------------------------------------------ visualizador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  db.clients.push({
    id: "44444444-4444-4444-4444-444444444444", name: "Cliente Liberado", company: null, cnpj: null, owner_name: null,
    phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false,
    created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null,
  });
  await login(page, "/clientes");
  await page.getByRole("cell", { name: /Cliente Liberado/ }).waitFor();
  check(!(await page.getByRole("button", { name: "Novo cliente" }).isVisible()), "visualizador não vê 'Novo cliente'");
  await page.getByRole("cell", { name: /Cliente Liberado/ }).click();
  await page.getByRole("heading", { name: "Cliente Liberado" }).waitFor();
  check(!(await page.getByRole("button", { name: "Editar" }).isVisible()), "visualizador não vê 'Editar'");
  check(!(await page.getByText("Equipe com acesso").isVisible()), "visualizador não vê a equipe com acesso");
  check(errors.length === 0, "nenhum erro de JavaScript (visualizador): " + errors.join(" | "));
  await browser.close();
}

// ------------------------------------------------------------ usuário do tipo cliente
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "cliente" });
  await login(page, "/clientes");
  await page.getByText("Olá, Ander!").waitFor();
  check(!page.url().includes("/clientes"), "papel cliente não acessa a área interna de Clientes");
  await browser.close();
}

console.log("CLIENTES OK");
