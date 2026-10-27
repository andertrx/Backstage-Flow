/**
 * Teste de navegador da Etapa 41.1 — Envios semanais (Central de Operações). Supabase SIMULADO.
 * O CRM só guarda a configuração e o histórico; quem envia é o agente (MCP).
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const LOJA_A = "a1000000-0000-4000-8000-0000000000a1";
const LOJA_B = "b1000000-0000-4000-8000-0000000000b1";
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;

// ---------------------------------------------------------------- Admin: criar, validar, copiar, histórico, arquivar
{
  const { browser, page, errors } = await launch();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockSupabase(page, { role: "admin" });
  db.clients.push(client(LOJA_A, "Loja Aurora"), client(LOJA_B, "Loja Brisa"));
  await login(page, "/operacoes/envios");
  await page.getByTestId("envios-empty").waitFor();
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(tabs.includes("Envios semanais"), "aba Envios semanais na Central (admin)");

  // Validação: mensagem e cliente obrigatórios
  await page.getByRole("button", { name: "Novo envio" }).click();
  const form = page.getByTestId("envio-form");
  await form.getByLabel("Nome do envio").fill("Feedback semanal");
  await form.getByRole("button", { name: "Salvar" }).click();
  let errs = await page.getByTestId("envio-errors").innerText();
  check(errs.includes("Escreva a mensagem.") && errs.includes("Escolha pelo menos um cliente.") && errs.includes("Escolha o dia da semana."),
    "mensagem, dia e cliente obrigatórios");

  // Mensagem com quebra de linha, emoji e negrito; pré-visualização
  await form.getByLabel("Mensagem").fill("Oi, pessoal! 👋\n*Como foi a semana?*");
  const preview = page.getByTestId("envio-preview");
  check((await preview.locator("p").count()) === 2 && (await preview.locator("span.font-bold").innerText()) === "Como foi a semana?", "pré-visualização com quebra de linha e negrito");
  await form.getByLabel("Dia da semana").selectOption({ label: "Sexta-feira" });
  await form.getByLabel("Horário (Brasília)").fill("10:30");

  // Marcar cliente abre os campos; nome do grupo obrigatório
  await form.getByLabel("Incluir Loja Aurora").check();
  await form.getByRole("button", { name: "Salvar" }).click();
  errs = await page.getByTestId("envio-errors").innerText();
  check(errs.includes('Informe o nome do grupo de "Loja Aurora".'), "nome do grupo obrigatório");
  await form.getByLabel("Nome do grupo").fill("Loja Aurora — Agência");
  const add = (n) => form.getByLabel("Adicionar pessoa para marcar em Loja Aurora").fill(n).then(() => form.getByRole("button", { name: "Adicionar" }).click());
  await add("Bruno");
  await add("Ana Paula");
  await form.getByRole("button", { name: "Subir Ana Paula" }).click();
  await add("11 98765-4321");
  await form.getByRole("button", { name: "Salvar" }).click();
  errs = await page.getByTestId("envio-errors").innerText();
  check(errs.includes("não o telefone"), "telefone em Quem marcar é recusado");
  await form.getByRole("button", { name: "Tirar 11 98765-4321" }).click();

  // Segundo cliente inativo
  await form.getByLabel("Incluir Loja Brisa").check();
  await form.getByLabel("Nome do grupo").nth(1).fill("Brisa | Agência");
  await form.getByRole("switch", { name: "Loja Brisa ativo neste envio" }).click();
  await page.screenshot({ path: `${SHOTS}/envios-formulario.png` });
  await form.getByRole("button", { name: "Salvar" }).click();
  await page.getByTestId("envio-card").waitFor();
  const saved = db.opsEnvios[0];
  const ca = db.opsEnvioClientes.find((c) => c.cliente_id === LOJA_A);
  const cb = db.opsEnvioClientes.find((c) => c.cliente_id === LOJA_B);
  check(saved.mensagem === "Oi, pessoal! 👋\n*Como foi a semana?*" && saved.dia_semana === 5 && saved.horario === "10:30", "envio salvo com a mensagem exata, sexta 10:30");
  check(JSON.stringify(ca.contatos_marcar) === JSON.stringify(["Ana Paula", "Bruno"]) && ca.ativo && !cb.ativo, "ordem de quem marcar e cliente inativo guardados");
  const card = await page.getByTestId("envio-card").innerText();
  check(card.includes("Sexta-feira às 10:30") && card.includes("1 grupo(s) ativo(s)"), "card com dia, horário e grupos ativos");

  // Copiar comando: só grupos ativos, nomes na ordem
  await page.getByRole("button", { name: "Copiar comando de Feedback semanal" }).click();
  const cmd = await page.evaluate(() => navigator.clipboard.readText());
  check(cmd.startsWith("Envie esta mensagem nos grupos abaixo e marque as pessoas indicadas em uma segunda mensagem logo depois.")
    && cmd.includes("Oi, pessoal! 👋\n*Como foi a semana?*") && cmd.includes('Grupo "Loja Aurora — Agência" (cliente Loja Aurora): marcar @Ana Paula @Bruno')
    && !cmd.includes("Brisa"), "comando copiado com a mensagem e só os grupos ativos");
  await page.screenshot({ path: `${SHOTS}/envios-lista.png` });

  // Editar: tirar a Loja Brisa fica guardado (não apaga)
  await page.getByRole("button", { name: "Editar Feedback semanal" }).click();
  await page.getByTestId("envio-form").getByLabel("Incluir Loja Brisa").uncheck();
  await page.getByTestId("envio-form").getByRole("button", { name: "Salvar" }).click();
  await page.getByTestId("envio-form").waitFor({ state: "detached" });
  check(Boolean(db.opsEnvioClientes.find((c) => c.cliente_id === LOJA_B).removido_em) && db.opsEnvios[0].versao === 2, "cliente tirado fica marcado; versão sobe");

  // Histórico: execução registrada pelo agente aparece "via Claude (MCP)"
  db.opsEnvioExecucoes.push({ id: 1, envio_id: saved.id, cliente_id: LOJA_A, executado_em: new Date().toISOString(), status: "enviado",
    detalhe: "Mensagem e marcação enviadas", registrado_por: USER_ID, origem: "mcp" });
  db.opsEnvioExecucoes.push({ id: 2, envio_id: saved.id, cliente_id: LOJA_A, executado_em: "2026-10-20T13:30:00Z", status: "falhou",
    detalhe: "Grupo não encontrado", registrado_por: USER_ID, origem: "mcp" });
  await page.getByRole("button", { name: "Histórico" }).click();
  await page.getByTestId("envio-execucao").first().waitFor();
  const hist = await page.getByTestId("envio-historico").innerText();
  check((await page.getByTestId("envio-execucao").count()) === 2 && hist.includes("via Claude (MCP)") && hist.includes("Grupo não encontrado") && hist.includes("Falhou"),
    "histórico com data, cliente, status, detalhe e via MCP");
  await page.getByLabel("Filtrar por status").selectOption("falhou");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=envio-execucao]").length === 1);
  check(true, "filtro por status no histórico");
  await page.screenshot({ path: `${SHOTS}/envios-historico.png` });

  // Arquivar: sai da lista, fica nos arquivados
  await page.getByRole("button", { name: "Envios", exact: true }).click();
  await page.getByRole("button", { name: "Arquivar Feedback semanal" }).click();
  await page.getByTestId("envios-empty").waitFor();
  await page.getByLabel("Ver arquivados").check();
  await page.getByTestId("envio-card").waitFor();
  check(db.opsEnvios.length === 1 && Boolean(db.opsEnvios[0].arquivado_em), "arquivar não apaga");

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Equipe sem a permissão: não vê a aba nem entra pela URL
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true, permissions: ["ops.access"] };
  await login(page, "/operacoes/envios");
  await page.waitForURL("**/operacoes/minhas-tarefas");
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(!tabs.includes("Envios semanais"), "sem a permissão: sem a aba e sem entrar pela URL");
  check(errors.length === 0, `sem erros (equipe) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Equipe com "Envios semanais": vê e usa
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Atendimento"), secondary: [], job_title: "Atendimento", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.envios"] };
  await login(page, "/operacoes/envios");
  await page.getByTestId("ops-envios").waitFor();
  check((await page.getByRole("button", { name: "Novo envio" }).count()) === 1, "com a permissão: vê o módulo e pode criar");
  check(errors.length === 0, `sem erros (equipe com permissão) ${errors.join(" | ")}`);
  await browser.close();
}
console.log("Envios semanais (Etapa 41.1): tudo certo.");
