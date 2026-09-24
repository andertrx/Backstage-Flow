/**
 * Teste de navegador da Etapa 3 — conexão com o Meta Ads e vínculo de contas.
 * Supabase e API do Meta SIMULADOS (support.mjs). Nenhum token real é usado.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLIENT = {
  id: "55555555-5555-4555-8555-555555555555", name: "Excalibur Fitness", company: null, cnpj: null, owner_name: null,
  phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false,
  created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null,
};

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push({ ...CLIENT });

  // Vincular antes de conectar → orientação
  await login(page, `/clientes/${CLIENT.id}`);
  await page.getByRole("heading", { name: "Excalibur Fitness" }).waitFor();
  await page.getByRole("region", { name: "Contas Meta Ads" }).getByRole("button", { name: "Vincular conta" }).click();
  await page.getByText("Ainda não há conexão com o Meta Ads.").waitFor();
  check(true, "sem conexão, o vínculo orienta a conectar primeiro");
  await page.getByRole("link", { name: "Conectar agora" }).click();

  // Integrações
  await page.waitForURL("**/configuracoes/integracoes");
  await page.getByRole("heading", { name: "Integrações", exact: true }).waitFor();
  check(await page.getByText("Nenhuma conexão com o Meta ainda.").isVisible(), "tela de integrações começa vazia");
  const tokenField = page.getByLabel("Token do usuário do sistema");
  check((await tokenField.getAttribute("type")) === "password", "campo do token é oculto (tipo senha)");

  await tokenField.fill("token-invalido-qualquer-123456789");
  await page.getByRole("button", { name: "Conectar Meta" }).click();
  await page.getByText("O token do Meta é inválido ou expirou.", { exact: false }).waitFor();
  check(true, "token inválido mostra mensagem amigável");

  await tokenField.fill("EAAB-token-de-teste-1234567890");
  await page.getByRole("button", { name: "Conectar Meta" }).click();
  await page.getByText("Conectado como Backstage Flow (sistema).", { exact: false }).waitFor();
  check((await tokenField.inputValue()) === "", "token some da tela depois de salvo");
  await page.getByText("BM da agência", { exact: true }).waitFor();
  check(true, "conexão aparece na lista (sem mostrar o token)");
  await page.screenshot({ path: `${SHOTS}/20-integracoes-meta.png`, fullPage: true });

  // Vincular conta ao cliente
  await page.getByRole("link", { name: "Clientes" }).first().click();
  await page.getByRole("tab", { name: /Todos/ }).click();
  await page.getByRole("cell", { name: /Excalibur Fitness/ }).click();
  await page.getByRole("region", { name: "Contas Meta Ads" }).getByRole("button", { name: "Vincular conta" }).click();
  const modal = page.getByRole("dialog", { name: "Vincular conta Meta Ads" });
  await modal.getByText("Excalibur - Principal").waitFor();
  check(await modal.getByText("Pagamento pendente").isVisible(), "lista de contas mostra o status vindo do Meta");
  await page.screenshot({ path: `${SHOTS}/21-vincular-conta.png` });
  await modal.getByRole("listitem").filter({ hasText: "Excalibur - Principal" }).getByRole("button", { name: "Vincular" }).click();
  await modal.waitFor({ state: "detached" });
  await page.getByText("ID act_1001", { exact: false }).waitFor();
  check(true, "conta vinculada aparece na página do cliente");
  check(await page.getByText("@excaliburfitness").isVisible(), "Instagram vinculado aparece");
  check(await page.getByText("BM Agência").isVisible(), "Business Manager aparece");
  const linkCall = db.adAccountCalls.find((c) => c.action === "link");
  check(linkCall.clientId === CLIENT.id && linkCall.externalId === "1001", "vínculo envia cliente e conta certos ao servidor");
  await page.screenshot({ path: `${SHOTS}/22-cliente-com-conta-meta.png`, fullPage: true });

  // Já vinculada aparece marcada
  await page.getByRole("region", { name: "Contas Meta Ads" }).getByRole("button", { name: "Vincular conta" }).click();
  await page.getByRole("dialog").getByText("Já vinculada aqui").waitFor();
  check(true, "conta já vinculada não pode ser vinculada de novo");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();

  // Atualizar e desvincular
  await page.getByRole("region", { name: "Contas Meta Ads" }).getByRole("button", { name: "Atualizar" }).click();
  await page.waitForTimeout(200);
  check(db.adAccountCalls.at(-1).action === "refresh", "botão Atualizar chama o servidor");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Desvincular Excalibur - Principal" }).click();
  await page.getByText("Nenhuma conta vinculada.").first().waitFor();
  check(db.adAccounts[0].unlinked_at !== null, "desvincular preserva o registro (só marca a data)");

  check(errors.length === 0, "nenhum erro de JavaScript (admin): " + errors.join(" | "));
  await browser.close();
}

// ------------------------------------------------------------ visualizador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  db.clients.push({ ...CLIENT });
  db.adAccounts.push({
    id: "a0000000-0000-4000-8000-000000009999", platform_id: "meta", external_id: "1001", client_id: CLIENT.id, connection_id: null,
    name: "Excalibur - Principal", currency: "BRL", timezone: null, status: "restrita", raw_status: "account_status=7", status_reason: null,
    business_name: null, is_prepay: null, linked_at: "2026-09-24T12:00:00Z", details_updated_at: null, unlinked_at: null, assets: [],
  });
  await login(page, `/clientes/${CLIENT.id}`);
  await page.getByText("ID act_1001", { exact: false }).waitFor();
  check(await page.getByText("Restrita").isVisible(), "visualizador vê o status da conta");
  check(await page.getByText("Informação não disponível pela API.").first().isVisible(), "campo ausente mostra 'Informação não disponível pela API.'");
  check(!(await page.getByRole("region", { name: "Contas Meta Ads" }).getByRole("button", { name: "Vincular conta" }).isVisible()), "visualizador não vê 'Vincular conta'");
  check(!(await page.getByRole("region", { name: "Contas Meta Ads" }).getByRole("button", { name: "Atualizar" }).isVisible()), "visualizador não vê 'Atualizar'");
  await page.goto(page.url().replace(/\/clientes\/.*/, "/configuracoes/integracoes"));
  await page.getByText("Olá, Ander!").waitFor();
  check(true, "visualizador não acessa Integrações");
  check(errors.length === 0, "nenhum erro de JavaScript (visualizador): " + errors.join(" | "));
  await browser.close();
}

console.log("META OK");
