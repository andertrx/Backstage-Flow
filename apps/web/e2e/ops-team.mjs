/**
 * Teste de navegador da Etapa 36.1 — Central de Operações: menu, setores,
 * equipe (setores no cadastro de usuário), papel Equipe e permissões.
 * Supabase SIMULADO (support.mjs).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;

// ---------------------------------------------------------------- Admin
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();

  const nav = page.getByRole("navigation", { name: "Menu principal" }).first();
  const labels = (await nav.getByRole("link").allInnerTexts()).map((t) => t.trim().split("\n")[0]);
  check(labels.indexOf("Central de Operações") === labels.indexOf("Contas") + 1, "menu: Central de Operações logo depois de Visão geral");
  check((await nav.innerText()).includes("OPERAÇÕES") || (await nav.innerText()).includes("Operações"), "grupo Operações no menu");

  await nav.getByRole("link", { name: "Central de Operações" }).click();
  await page.waitForURL("**/operacoes/minhas-tarefas");
  await page.getByTestId("ops-my-tasks").waitFor();
  check(await page.getByRole("heading", { name: "Central de Operações", level: 1 }).count() === 1, "abre a Central em Minhas tarefas");
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(["Minhas tarefas", "Tarefas", "Equipe", "Configurações"]), `só as abas prontas aparecem (${tabs.join(", ")})`);
  await page.getByRole("link", { name: "Equipe" }).last().click();
  await page.getByTestId("ops-team").waitFor();
  const teamText = await page.getByTestId("ops-team").innerText();
  check(teamText.includes("Maria Gestora") && teamText.includes("Fora da Central") && !teamText.includes("cliente@excalibur.com"),
    "admin vê a equipe e quem ainda está fora (papel Cliente nunca aparece)");

  // Configurações → Setores
  await page.getByRole("link", { name: "Configurações" }).last().click();
  await page.getByTestId("ops-sectors").waitFor();
  check(await page.getByTestId("ops-sector-row").count() === 10, "10 setores iniciais");
  const names = await page.getByTestId("ops-sector-row").locator("p.font-medium").allInnerTexts();
  check(names[0] === "Comercial" && names[9] === "Áudio e Vídeo", "na ordem pedida");
  await page.getByRole("button", { name: "Novo setor" }).click();
  let dialog = page.getByRole("dialog", { name: "Novo setor" });
  await dialog.getByLabel("Nome").fill("comercial");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await dialog.getByText("Já existe um setor com esse nome.").waitFor();
  check(true, "nome repetido é recusado");
  await dialog.getByLabel("Nome").fill("Customer Success");
  await dialog.getByRole("radio", { name: "Cor #10B981" }).click();
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByText("Customer Success").waitFor();
  check(db.opsSectors.some((s) => s.name === "Customer Success" && s.color === "#10B981"), "setor novo criado com a cor escolhida");
  await page.getByRole("button", { name: "Subir Customer Success" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("[data-testid=ops-sector-row] p.font-medium")].at(-2)?.textContent === "Customer Success");
  check(true, "reordenar funciona");
  await page.getByRole("button", { name: "Editar Copy" }).click();
  dialog = page.getByRole("dialog", { name: "Editar setor" });
  await dialog.getByLabel("Nome").fill("Copywriting");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Copywriting").waitFor();
  check(true, "renomear setor");
  await page.screenshot({ path: `${SHOTS}/ops-setores.png`, fullPage: true });

  // Usuários: criar alguém do papel Equipe já com setores
  await page.goto(`${BASE}/configuracoes/usuarios`);
  await page.getByText("Maria Gestora").waitFor();
  await page.getByRole("button", { name: "Novo usuário" }).click();
  dialog = page.getByRole("dialog", { name: "Novo usuário" });
  await dialog.getByLabel("Nome completo").fill("Bia Designer");
  await dialog.getByLabel("E-mail").fill("bia@agencia.com");
  await dialog.getByLabel("Papel").selectOption("equipe");
  check((await dialog.innerText()).includes("Usa só a Central de Operações"), "papel Equipe explicado");
  await dialog.getByLabel("Senha inicial").fill("Designer2026");
  const section = dialog.getByTestId("user-ops-section");
  check(await section.evaluate((el) => el.open), "seção da Central aberta para o papel Equipe");
  await section.getByLabel("Setor principal").selectOption({ label: "Design" });
  await section.getByLabel("Social Media").check();
  await section.getByLabel("Cargo ou função (opcional)").fill("Designer Pleno");
  check(await section.getByLabel("Acessar a Central de Operações").isChecked(), "permissões padrão já marcadas");
  await section.getByLabel("Criar reuniões e Dailies").check();
  await dialog.getByRole("button", { name: "Criar usuário" }).click();
  await dialog.waitFor({ state: "detached" });
  const bia = db.profiles.find((p) => p.email === "bia@agencia.com");
  const m = db.opsMembers[bia.id];
  check(bia.role === "equipe" && m?.primary === sectorId(db, "Design") && m.secondary.join() === sectorId(db, "Social Media"), "usuário criado com papel Equipe, setor principal e secundário");
  check(m.job_title === "Designer Pleno" && m.permissions.includes("ops.access") && m.permissions.includes("ops.meetings.manage"), "cargo e permissões salvos");
  await page.getByRole("row", { name: /Bia Designer/ }).getByTestId("user-sector").getByText("Design").waitFor();
  check(true, "lista de usuários mostra o setor");

  // Equipe: filtros e colocar alguém na Central pela própria Central
  await page.goto(`${BASE}/operacoes/equipe`);
  await page.getByTestId("ops-team").waitFor();
  await page.getByLabel("Filtrar por setor").selectOption({ label: "Design" });
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-team-row]").length === 1);
  check((await page.getByTestId("ops-team-row").innerText()).includes("Bia Designer"), "filtro por setor");
  await page.getByLabel("Filtrar por setor").selectOption("");
  await page.getByLabel("Buscar pessoa").fill("pleno");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=ops-team-row]").length === 1);
  check(true, "busca por cargo");
  await page.getByLabel("Buscar pessoa").fill("");
  await page.getByRole("button", { name: "Editar Maria Gestora na Central" }).click();
  dialog = page.getByRole("dialog", { name: /Maria Gestora na Central/ });
  await dialog.getByLabel("Setor principal").selectOption({ label: "Account Manager" });
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await dialog.waitFor({ state: "detached" });
  check(db.opsMembers["22222222-2222-2222-2222-222222222222"]?.primary === sectorId(db, "Account Manager"), "gestora colocada na Central como Account Manager");
  await page.screenshot({ path: `${SHOTS}/ops-equipe.png`, fullPage: true });

  // Desativar setor com gente: pede o destino
  await page.getByRole("link", { name: "Configurações" }).last().click();
  await page.getByRole("button", { name: "Situação de Design" }).click();
  dialog = page.getByRole("dialog", { name: "Situação: Design" });
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await dialog.getByText("Escolha para qual setor as pessoas vão.").waitFor();
  check(true, "com pessoas no setor, pede o destino");
  await dialog.getByLabel(/Mover as 1 pessoa/).selectOption({ label: "Social Media" });
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await dialog.waitFor({ state: "detached" });
  const after = db.opsMembers[bia.id];
  check(db.opsSectors.find((s) => s.name === "Design").status === "inativo" && after.primary === sectorId(db, "Social Media") && after.secondary.length === 0,
    "setor desativado; a pessoa foi para o destino (sem ficar sem setor)");

  check(errors.length === 0, `sem erros no navegador (${errors.join(" | ")})`);
  await browser.close();
}

// ---------------------------------------------------------------- Papel Equipe
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  db.opsMembers[USER_ID] = { primary: db.opsSectors[4].id, secondary: [], job_title: "Designer", active: true, joins_meetings: true,
    permissions: ["ops.access", "ops.kanban.view"] };
  await login(page, "/");
  await page.waitForURL("**/operacoes/minhas-tarefas");
  await page.getByTestId("ops-my-tasks").waitFor();
  check(true, "papel Equipe entra direto na Central");
  const nav = page.getByRole("navigation", { name: "Menu principal" }).first();
  const labels = (await nav.getByRole("link").allInnerTexts()).map((t) => t.trim().split("\n")[0]);
  check(JSON.stringify(labels) === JSON.stringify(["Central de Operações"]), `menu só com a Central (${labels.join(", ")})`);
  const tabs = await page.getByRole("navigation", { name: "Central de Operações" }).getByRole("link").allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(["Minhas tarefas", "Tarefas", "Equipe"]), `sem a aba Configurações (só admin): ${tabs.join(", ")}`);
  await page.getByRole("link", { name: "Equipe" }).last().click();
  await page.getByTestId("ops-team").waitFor();
  check(await page.getByRole("button", { name: /na Central$/ }).count() === 0, "não edita a equipe");
  for (const path of ["/clientes", "/contas", "/meta-ads", "/campanhas", "/relatorios"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForURL("**/operacoes/**");
  }
  check(true, "telas de anúncios, clientes e relatórios levam de volta à Central");
  await page.goto(`${BASE}/operacoes/configuracoes`);
  await page.waitForURL("**/operacoes/minhas-tarefas");
  check(true, "Configurações da Central bloqueadas");

  // Sem estar na Central
  delete db.opsMembers[USER_ID];
  await page.goto(`${BASE}/operacoes`);
  await page.getByTestId("ops-no-access").waitFor();
  check(true, "fora da Central: aviso claro, sem dados");
  check(errors.length === 0, `sem erros (equipe) ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Gestor fora da Central
{
  const { browser, page, errors } = await launch();
  await mockSupabase(page, { role: "gestor" });
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();
  const nav = page.getByRole("navigation", { name: "Menu principal" }).first();
  check(!(await nav.innerText()).includes("Central de Operações"), "gestor fora da Central não vê o item no menu");
  check((await nav.innerText()).includes("Dashboard"), "gestor continua vendo o Dashboard");
  check(errors.length === 0, "sem erros (gestor)");
  await browser.close();
}
