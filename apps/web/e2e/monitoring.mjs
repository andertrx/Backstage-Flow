/**
 * Teste de navegador da Etapa 37.1 — Monitoramento de Desempenho (base):
 * menu, Visão geral (situação da coleta) e Configurações (limites e regras).
 * Supabase SIMULADO (support.mjs).
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000901";
const META2 = "a0000000-0000-4000-8000-000000000902";
const US = "a0000000-0000-4000-8000-000000000903";
const C1 = "c0000000-0000-4000-8000-000000000901";

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const account = (id, external_id, client_id, name, currency) => ({ id, platform_id: "meta", external_id, client_id, name, currency, status: "ativa", unlinked_at: null, connection_id: "x" });
  db.adAccounts.push(account(META, "611", EXC, "Excalibur Meta", "BRL"), account(META2, "612", EXC, "Excalibur Remarketing", "BRL"), account(US, "613", LOJA, "Loja US", "USD"));
  db.campaigns.push({ id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Setembro", status: "ativa" });
  db.ads.push({ id: "d0000000-0000-4000-8000-000000000901", campaign_id: C1, ad_account_id: META, client_id: EXC, name: "Vídeo depoimento", status: "ativa" });
  db.syncState[META] = { status: "sucesso", last_success_at: ago(20), next_run_at: new Date(Date.now() + 40 * 60_000).toISOString() };
  db.syncState[META2] = { status: "sucesso", last_success_at: ago(180) };
  db.syncState[US] = { status: "erro", last_success_at: ago(300), last_error_message: "Token expirado" };
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const cardValue = async (page, s) => clean(await page.getByTestId(`coleta-${s}`).innerText());

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  page.on("dialog", (d) => d.accept());
  // Entra direto no monitoramento: o Dashboard sincroniza sozinho as contas atrasadas ao abrir (Etapa 24).
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();

  // Menu: item novo no grupo Análise, antes de Alertas
  const nav = await page.locator("nav a").evaluateAll((els) => els.map((e) => e.textContent.trim()));
  const iMon = nav.findIndex((t) => t.startsWith("Monitoramento"));
  const iAlerts = nav.findIndex((t) => t.startsWith("Alertas"));
  check(iMon >= 0 && iAlerts === iMon + 1, `menu: Monitoramento logo antes de Alertas (${nav.join(" | ")})`);

  check(await page.getByRole("link", { name: /^Monitoramento/ }).first().getAttribute("aria-current") === "page", "item do menu marcado como página atual");
  const tabs = await page.getByRole("tab").allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(["Visão geral", "Alertas", "Comparativos", "Campanhas", "Criativos", "Configurações"]), `só as abas que já funcionam (${tabs})`);

  // Visão geral: situação da coleta
  await page.waitForFunction(() => document.querySelector("[data-testid=coleta-em_dia]")?.textContent.includes("1"), null, { timeout: 5000 }).catch(() => {});
  check((await cardValue(page, "em_dia")).includes("Em dia 1"), `1 conta em dia (${await cardValue(page, "em_dia")})`);
  check((await cardValue(page, "atrasada")).includes("Atrasada 1"), "1 conta atrasada (3 h sem atualizar)");
  check((await cardValue(page, "erro")).includes("Com erro 1"), "1 conta com erro");
  const body = clean(await page.locator("main").innerText());
  check(body.includes("Loja Internacional · Loja US") && body.includes("Token expirado"), "lista a conta com erro e o motivo");
  check(body.includes("Excalibur Fitness · Excalibur Remarketing"), "lista a conta atrasada");
  check(!body.includes("Excalibur Fitness · Excalibur Meta"), "conta em dia não aparece na lista de problemas");
  check(body.includes("não gera alerta de desempenho"), "avisa que coleta com problema não gera alerta");
  check(body.includes("6 limite(s) geral(is) ativo(s)") && body.includes("0 regra(s) específica(s)"), "resumo das regras em vigor");
  await page.screenshot({ path: `${SHOTS}/37.1-visao-geral.png`, fullPage: true });

  // Configurações: tabela inicial do prompt
  await page.getByRole("button", { name: "Ver os limites" }).click();
  await page.getByRole("heading", { name: "Limites gerais (todos os clientes)" }).waitFor();
  check(page.url().includes("aba=configuracoes"), "aba fica no endereço");
  const row = async (m) => clean(await page.getByTestId(`regra-geral-${m}`).innerText());
  check((await row("cost_per_result")).includes("Custo por resultado Quando subir 20% 40% 10 resultados (padrão)"), "custo por resultado +20/+40");
  check((await row("cpc")).includes("CPC Quando subir 20% 40% 20 cliques (padrão)"), "CPC +20/+40");
  check((await row("cpm")).includes("CPM Quando subir 20% 40% 1.000 impressões (padrão)"), "CPM +20/+40");
  check((await row("ctr")).includes("CTR Quando cair 15% 30%"), "CTR −15/−30");
  check((await row("results")).includes("Resultados Quando cair 20% 40%"), "resultados −20/−40");
  check((await row("roas")).includes("ROAS Quando cair 20% 40% 5 conversões (padrão)"), "ROAS −20/−40");

  // Admin edita o limite geral do CTR; a versão anterior vai para o histórico
  await page.getByRole("button", { name: "Editar CTR" }).click();
  const dlg = page.getByRole("dialog", { name: "Editar regra" });
  await dlg.getByLabel("Atenção a partir de (%)").fill("12");
  await dlg.getByLabel("Crítico a partir de (%)").fill("10");
  await dlg.getByRole("button", { name: "Salvar" }).click();
  check(clean(await dlg.innerText()).includes("O limite crítico não pode ser menor que o de atenção."), "valida crítico menor que atenção antes de enviar");
  await dlg.getByLabel("Crítico a partir de (%)").fill("25");
  await dlg.getByLabel("Volume mínimo (impressões)").fill("5000");
  await dlg.getByRole("button", { name: "Salvar" }).click();
  await dlg.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector("[data-testid=regra-geral-ctr]")?.textContent.includes("12%"), null, { timeout: 5000 }).catch(() => {});
  check((await row("ctr")).includes("CTR Quando cair 12% 25% 5.000 impressões"), "CTR geral editado para 12/25 com volume 5.000");
  const save = db.rpcCalls.filter((c) => c.fn === "monitor_rule_save").at(-1);
  check(save?.p_scope === "global" && save.p_attention === 12 && save.p_critical === 25 && save.p_min_volume === 5000 && !!save.p_replaces_id, "salvou como nova versão da regra global");

  // Regra específica: cliente → conta → campanha
  await page.getByRole("button", { name: "Nova regra" }).click();
  const nd = page.getByRole("dialog", { name: "Nova regra" });
  check(await nd.getByLabel("Conta (opcional)").isDisabled(), "conta só depois do cliente");
  await nd.getByLabel("Cliente").selectOption(EXC);
  await nd.getByLabel("Conta (opcional)").locator("option", { hasText: "Excalibur Meta" }).waitFor({ state: "attached" });
  await nd.getByLabel("Conta (opcional)").selectOption(META);
  await nd.getByLabel("Campanha (opcional)").locator("option", { hasText: "Leads Setembro" }).waitFor({ state: "attached" });
  await nd.getByLabel("Campanha (opcional)").selectOption(C1);
  check(clean(await nd.innerText()).includes("Vale para: Campanha"), "mostra onde a regra vale");
  await nd.getByLabel("Métrica", { exact: true }).selectOption("cpm");
  check(await nd.getByLabel("Alertar").inputValue() === "up", "CPM: alerta quando sobe (padrão da métrica)");
  await nd.getByLabel("Atenção a partir de (%)").fill("30");
  await nd.getByLabel("Crítico a partir de (%)").fill("60");
  await nd.getByLabel("Observação (opcional)").fill("Black Friday: CPM sobe naturalmente");
  await nd.getByRole("button", { name: "Salvar" }).click();
  await nd.waitFor({ state: "detached" });
  await page.getByTestId("regra-especifica").first().waitFor();
  const spec = clean(await page.getByTestId("regra-especifica").first().innerText());
  check(spec.includes("CPM · quando subir 30% / 60%") && spec.includes("Campanha: Leads Setembro (Excalibur Fitness)") && spec.includes("Black Friday"), `regra da campanha aparece (${spec})`);

  // Mesma métrica no mesmo lugar: o banco recusa
  await page.getByRole("button", { name: "Nova regra" }).click();
  const dd = page.getByRole("dialog", { name: "Nova regra" });
  await dd.getByLabel("Cliente").selectOption(EXC);
  await dd.getByLabel("Conta (opcional)").locator("option", { hasText: "Excalibur Meta" }).waitFor({ state: "attached" });
  await dd.getByLabel("Conta (opcional)").selectOption(META);
  await dd.getByLabel("Campanha (opcional)").locator("option", { hasText: "Leads Setembro" }).waitFor({ state: "attached" });
  await dd.getByLabel("Campanha (opcional)").selectOption(C1);
  await dd.getByLabel("Métrica", { exact: true }).selectOption("cpm");
  await dd.getByRole("button", { name: "Salvar" }).click();
  await dd.getByText("Já existe uma regra desta métrica neste lugar").waitFor({ timeout: 5000 }).catch(() => {});
  check(clean(await dd.innerText()).includes("Já existe uma regra desta métrica neste lugar"), "não duplica regra no mesmo lugar");
  await dd.getByRole("button", { name: "Cancelar" }).click();
  await page.screenshot({ path: `${SHOTS}/37.1-configuracoes.png`, fullPage: true });

  // Remover a específica: volta a valer a geral e fica no histórico
  await page.getByRole("button", { name: "Remover regra" }).click();
  await page.getByText("Nenhuma regra específica").waitFor();
  check(true, "regra específica removida");
  await page.getByRole("button", { name: "Mostrar" }).click();
  await page.getByTestId("regra-historico").first().waitFor();
  const hist = clean(await page.locator("section", { has: page.getByRole("heading", { name: "Histórico de mudanças" }) }).innerText());
  check((await page.getByTestId("regra-historico").count()) === 2 && hist.includes("CTR · Todos os clientes · 15% / 30%") && hist.includes("CPM · Campanha: Leads Setembro · 30% / 60%"), "histórico guarda a versão antiga do CTR e a regra removida");
  check(db.monitorRules.length === 8 && db.monitorRules.filter((r) => r.archived_at).length === 2, "nada foi apagado (8 versões, 2 arquivadas)");

  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

{
  // Gestor: cria regra dos clientes dele, não mexe nos limites gerais
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await login(page, "/monitoramento");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page.getByRole("heading", { name: "Limites gerais (todos os clientes)" }).waitFor();
  await page.getByTestId("regra-geral-cpc").waitFor();
  check(await page.getByRole("button", { name: /^Editar / }).count() === 0, "gestor não edita os limites gerais");
  check(clean(await page.locator("main").innerText()).includes("Só o administrador muda os limites que valem para todos os clientes"), "explica quem muda os gerais");
  check(await page.getByRole("button", { name: "Nova regra" }).count() === 1, "gestor cria regra específica");
  check(errors.length === 0, "sem erros (gestor)");
  await browser.close();
}

{
  // Visualizador: vê, mas não muda nada
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await login(page, "/monitoramento");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page.getByTestId("regra-geral-cpc").waitFor();
  check(await page.getByRole("button", { name: "Nova regra" }).count() === 0 && await page.getByRole("button", { name: /^Editar / }).count() === 0, "visualizador só lê");
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}

for (const role of ["cliente", "equipe"]) {
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role });
  seed(db);
  await login(page, "/monitoramento");
  await page.waitForTimeout(1500);
  check(!(await page.getByRole("heading", { name: "Monitoramento de Desempenho" }).count()), `perfil ${role} não acessa o monitoramento`);
  check(!(await page.getByRole("link", { name: /^Monitoramento/ }).count()), `perfil ${role} não vê o item no menu`);
  check(!db.rpcCalls.some((c) => c.fn === "monitor_rules_list"), `perfil ${role} nem consulta as regras`);
  await browser.close();
}

{
  // Celular: sem rolagem lateral
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "/monitoramento");
  await page.getByTestId("coleta-em_dia").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `celular: sem rolagem lateral (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/37.1-celular.png`, fullPage: true });
  await browser.close();
}

console.log("Monitoramento (37.1): tudo certo.");
