/**
 * Teste de navegador — Tracking T5.2b: lead por webhook de um formulário de outro sistema (Responde App).
 * Admin cria o endereço de lead ligado a um site (chave aparece uma vez), recebe o 1º aviso de teste (só os nomes dos campos),
 * usa a sugestão do mapeamento (contato + origem da campanha), salva, liga e vê o registro. Endereços de venda e de lead ficam separados.
 * Operador e visualizador não configuram. Supabase SIMULADO (support.mjs).
 */
import { check, launch, login, mockSupabase } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004701";
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
function seed(db, consent = "nao_exigir") {
  db.clients.push(client(CLI, "Loja Atacado"));
  db.trackingContainers.push({ id: "t-cont", client_id: CLI, name: "loja.com.br", public_key: "bf_0123456789abcdef01234567", allowed_domains: ["loja.com.br"],
    status: "ativo", test_mode: false, consent_mode: consent, retention_days: 180, created_at: "2026-10-01T00:00:00Z", rules_version: null });
}

{
  const { browser, page, errors } = await launch();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/contatos?cliente=${CLI}`);
  await page.getByRole("button", { name: "Formulários de outros sistemas" }).click();
  const modal = page.getByTestId("lead-forms");
  await modal.waitFor();
  await modal.getByText("Nenhum formulário de outro sistema").waitFor();
  check(await modal.getByRole("button", { name: "Criar endereço" }).isDisabled(), "sem nome, o botão criar fica travado");
  await modal.getByLabel("Nome do formulário").fill("Formulário do Responde App");
  await modal.getByRole("button", { name: "Criar endereço" }).click();
  await page.getByTestId("lead-key").waitFor();
  const w = db.salesWebhooks[0];
  check(w && w.purpose === "lead" && w.container_id === "t-cont" && w.test_mode && /^[0-9a-f]{48}$/.test(w.key), "endereço de lead novo: finalidade lead, ligado ao site, em modo teste, com chave");
  const txt = await modal.getByTestId("lead-webhook").innerText();
  check(txt.includes(`/functions/v1/lead-webhook?w=${w.id}`) && txt.includes(`&k=${w.key}`) && txt.includes("loja.com.br"), "mostra o endereço de lead (não o de venda) e o site");
  check(txt.includes("parâmetros de URL") && txt.includes("sem origem"), "explica que sem os parâmetros de URL o lead entra sem origem");
  check(await modal.getByRole("button", { name: "Salvar mapeamento" }).isDisabled(), "sem telefone ou e-mail, não salva o mapeamento");
  await page.getByRole("button", { name: "Fechar janela" }).click();

  // Lista de vendas não mostra o endereço de lead
  await page.getByRole("button", { name: "Sistemas de venda" }).click();
  const sales = page.getByTestId("sales-systems");
  await sales.waitFor();
  check(await sales.getByText("Nenhum sistema de venda").count() === 1 && await page.getByTestId("sales-webhook").count() === 0, "o endereço de lead não aparece em Sistemas de venda");
  await page.getByRole("button", { name: "Fechar janela" }).click();

  // O servidor recebeu o 1º aviso (modo teste): só os nomes dos campos
  Object.assign(w, { last_keys: ["respondent.name", "respondent.whatsapp", "respondent.email", "url_params.utm_source", "url_params.utm_campaign", "url_params.fbclid", "url_params.bf_c"],
    last_received_at: new Date().toISOString(), last_result: "teste" });
  db.salesLog.push({ id: 1, webhook_id: w.id, client_id: CLI, received_at: new Date().toISOString(), result: "teste", reason: "Modo teste: conferido e não registrado. Origem lida: utm_source, bf_c.",
    order_id: null, value_micros: null, currency: null, contact_found: null });
  await page.getByRole("button", { name: "Formulários de outros sistemas" }).click();
  await modal.waitFor();
  check(await page.getByTestId("lead-key").count() === 0 && (await modal.innerText()).includes(`••••${w.key_hint}`), "reaberto: a chave não aparece mais");
  const log = (await page.getByTestId("lead-log-row").first().innerText()).replace(/\s/g, " ");
  check(log.includes("Teste") && log.includes("Origem lida: utm_source, bf_c"), "registro mostra o teste e a origem lida");

  await modal.getByRole("button", { name: "Sugerir pelos campos recebidos" }).click();
  check(await modal.getByLabel("Telefone").inputValue() === "respondent.whatsapp" && await modal.getByLabel("E-mail").inputValue() === "respondent.email"
    && await modal.getByLabel("Nome", { exact: true }).inputValue() === "respondent.name", "sugestão acha telefone, e-mail e nome");
  check(await modal.getByLabel("utm_source (origem)").inputValue() === "url_params.utm_source" && await modal.getByLabel("fbclid (clique no Meta)").inputValue() === "url_params.fbclid"
    && await modal.getByLabel("bf_c (ID da campanha)").inputValue() === "url_params.bf_c", "sugestão acha a origem da campanha pelos nomes dos parâmetros");
  await modal.getByRole("button", { name: "Salvar mapeamento" }).click();
  await modal.getByText("Mapeamento salvo.").waitFor();
  check(w.mapping.phone === "respondent.whatsapp" && w.mapping.utm_source === "url_params.utm_source" && w.mapping.bf_c === "url_params.bf_c", "mapeamento salvo no endereço");

  await modal.getByRole("checkbox", { name: "Modo teste" }).click();
  await page.waitForTimeout(300);
  check(w.test_mode === false && (await modal.innerText()).includes("Registrando leads"), "desligar o modo teste passa a registrar leads");
  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

{
  // Site que exige consentimento: avisa que os avisos serão ignorados
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db, "aguardar_consentimento");
  await login(page, `/contatos?cliente=${CLI}`);
  await page.getByRole("button", { name: "Formulários de outros sistemas" }).click();
  const modal = page.getByTestId("lead-forms");
  await modal.getByLabel("Nome do formulário").fill("Responde");
  await modal.getByRole("button", { name: "Criar endereço" }).click();
  await page.getByTestId("lead-webhook").waitFor();
  check((await modal.innerText()).includes("exige consentimento"), "site com consentimento: avisa que os avisos serão ignorados");
  await browser.close();
}

{
  // Operador e visualizador não veem o botão de configuração
  for (const role of ["operador", "visualizador"]) {
    const { browser, page } = await launch();
    const db = await mockSupabase(page, { role });
    seed(db);
    await login(page, `/contatos?cliente=${CLI}`);
    await page.waitForTimeout(600);
    check(await page.getByRole("button", { name: "Formulários de outros sistemas" }).count() === 0, `${role} não configura formulários de outros sistemas`);
    await browser.close();
  }
}

console.log("\nLead por webhook (T5.2b): tudo certo.");
