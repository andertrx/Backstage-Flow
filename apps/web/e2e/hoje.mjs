/**
 * Teste de navegador da Etapa 43.2 — tela "Hoje" (pré-visualização em /hoje, fora do menu). Supabase SIMULADO.
 * Confere: o que aparece em "Precisa de você agora", o que cada papel vê, atalhos, menu intacto e movimento reduzido.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const A = "a2000000-0000-4000-8000-0000000000a2";
const ENVIO = "e4100000-0000-4000-8000-0000000000e4";
const SEG_0830 = "2026-11-02T11:30:00Z"; // segunda-feira, 8h30 em Brasília
const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });

function seed(db) {
  db.clients.push(client(A, "Loja Aurora"));
  const t = "2026-10-27T12:00:00Z";
  db.opsEnvios.push({ id: ENVIO, nome: "Feedback semanal", mensagem: "Bom dia!", dia_semana: 1, horario: "10:00", ativo: true,
    arquivado_em: null, versao: 1, criado_por: USER_ID, atualizado_por: USER_ID, created_at: t, updated_at: t });
  db.opsEnvioClientes.push({ id: crypto.randomUUID(), envio_id: ENVIO, cliente_id: A, nome_grupo: "Acelera A. – Aurora", contatos_marcar: ["Ana"], ativo: true,
    observacao: null, removido_em: null, created_at: t, updated_at: t, contatos_desligados: [] });
  db.dueTasks = [{ id: "t1", number: 7, title: "Subir criativos", client: "Loja Aurora", due_date: "2026-11-01", days_late: 1, version: 1, status_id: "nao_iniciado", principal: USER_ID }];
}

// ---------------------------------------------------------------- Admin: vê tudo, na ordem certa
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.envioAgora = SEG_0830;
  await login(page, "/hoje");
  const pop = page.getByTestId("envio-aprovacao");
  await pop.waitFor();
  await pop.getByRole("button", { name: "Decidir depois" }).click(); // o pop-up de sempre continua funcionando por cima
  await pop.waitFor({ state: "detached" });
  await page.getByTestId("hoje").waitFor();
  await page.getByTestId("hoje-item-envio").waitFor();
  const dataTxt = await page.getByTestId("hoje-data").innerText();
  check(/^[A-ZÀ-Ú][a-zà-ú]+-?[a-zà-ú]*, \d+ de [a-zç]+$/.test(dataTxt), `data só com a primeira letra maiúscula (${dataTxt})`);
  check((await page.locator("h1").innerText()).includes("Boa") || (await page.locator("h1").innerText()).includes("Bom"), "saudação pelo horário");
  const envio = await page.getByTestId("hoje-item-envio").innerText();
  check(envio.includes("Aprovar o envio de hoje até 10:00") && envio.includes("Feedback semanal"), "envio esperando aprovação aparece primeiro, com o horário");
  check((await page.getByTestId("hoje-item-tarefas").innerText()).includes("1 tarefa sua vencida"), "tarefa vencida do próprio usuário aparece");
  const ids = await page.locator("[data-testid^=hoje-item-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("hoje-item-", "")));
  check(ids[0] === "envio" && ids.indexOf("tarefas") > ids.indexOf("envio"), `ordem de prioridade (${ids.join(", ")})`);
  check(await page.getByTestId("hoje-saude").count() === 1 && await page.getByTestId("hoje-resultado").count() === 1, "saúde das contas e resultado da semana aparecem");
  const atalhos = await page.getByTestId("hoje-atalhos").innerText();
  check(["Visão geral", "Operações", "Anúncios", "Análise", "Sistema"].every((g) => atalhos.includes(g)), "atalhos nas 5 áreas do menu");
  check(await page.getByTestId("hoje-atalhos").getByRole("link", { name: "Monitoramento" }).count() === 1, "atalho para o Monitoramento");
  check(await page.getByRole("navigation").getByRole("link", { name: /^Hoje$/ }).count() === 0, "o menu lateral não ganhou item novo");
  await page.waitForTimeout(900); // espera os números subirem
  await page.screenshot({ path: `${SHOTS}/hoje-desktop.png`, fullPage: true });

  await page.getByTestId("hoje-item-envio").click();
  await page.waitForURL("**/operacoes/envios");
  check(true, "clicar no envio abre a tela de Envios semanais");

  // Entrada do sistema continua sendo o Dashboard
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: /Olá/ }).waitFor();
  check(await page.getByTestId("hoje").count() === 0, "a entrada (/) continua sendo o Dashboard");
  check(errors.length === 0, "sem erros no navegador (admin)", errors.join(" | "));

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/hoje`);
  await page.getByTestId("hoje").waitFor();
  await page.waitForTimeout(900);
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(noOverflow, "celular: sem rolagem para os lados");
  await page.screenshot({ path: `${SHOTS}/hoje-celular.png`, fullPage: true });
  await browser.close();
}

// ---------------------------------------------------------------- Movimento reduzido: números já no valor final
{
  const { browser, page, errors } = await launch();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.envioAgora = SEG_0830;
  await login(page, "/hoje");
  const pop = page.getByTestId("envio-aprovacao");
  await pop.waitFor();
  await pop.getByRole("button", { name: "Decidir depois" }).click();
  const item = page.getByTestId("hoje-item-tarefas");
  await item.waitFor();
  check((await item.innerText()).trim().startsWith("1"), "movimento reduzido: o número aparece direto, sem subir");
  check(errors.length === 0, "sem erros (movimento reduzido)", errors.join(" | "));
  await browser.close();
}

// ---------------------------------------------------------------- Equipe: só o que é da Central
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  seed(db);
  await login(page, "/hoje");
  await page.getByTestId("hoje").waitFor();
  check(await page.getByTestId("hoje-resultado").count() === 0, "equipe: não vê o resultado de anúncios");
  check(await page.getByTestId("hoje-saude").count() === 0, "equipe: não vê a saúde das contas");
  check(await page.getByTestId("hoje-item-envio").count() === 0, "equipe sem \"Envios semanais\": não vê o envio");
  check(errors.length === 0, "sem erros (equipe)", errors.join(" | "));
  await browser.close();
}

// ---------------------------------------------------------------- Cliente: volta para a própria tela
{
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "cliente" });
  await login(page, "/hoje");
  await page.waitForTimeout(1500);
  check(new URL(page.url()).pathname !== "/hoje", "cliente não fica na tela Hoje");
  await browser.close();
}

console.log("Tela Hoje (Etapa 43.2): tudo certo.");
