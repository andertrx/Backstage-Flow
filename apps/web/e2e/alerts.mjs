/**
 * Teste de navegador da Etapa 15 — Central de alertas.
 * Supabase SIMULADO (support.mjs).
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000901";
const GOOGLE = "a0000000-0000-4000-8000-000000000902";
const US = "a0000000-0000-4000-8000-000000000903";
const C1 = "c0000000-0000-4000-8000-000000000901";

const ago = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  const account = (id, platform_id, external_id, client_id, name, currency) => ({ id, platform_id, external_id, client_id, name, currency, status: "ativa", unlinked_at: null });
  db.adAccounts.push(
    account(META, "meta", "611", EXC, "Excalibur Meta", "BRL"),
    account(GOOGLE, "google", "1234567890", EXC, "Excalibur Google", "BRL"),
    account(US, "meta", "613", LOJA, "Loja US", "USD"),
  );
  db.campaigns.push({ id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Setembro", status: "ativa" });
  const alert = (id, type, severity, status, client_id, platform_id, ad_account_id, description, recommended_action, hours, extra = {}) => ({
    id, alert_key: `${type}:${ad_account_id}`, type, severity, status, client_id, platform_id, ad_account_id, campaign_id: null, description, recommended_action,
    details: {}, first_seen_at: ago(hours), last_seen_at: ago(0.1), seen_at: status === "visto" ? ago(1) : null, resolved_at: null, resolution: null, ...extra,
  });
  db.alerts.push(
    alert(1, "sem_saldo", "critica", "aberto", EXC, "meta", META, "Conta sem saldo: o limite de gastos foi atingido e os anúncios param de rodar.",
      "Adicionar saldo ou aumentar o limite de gastos da conta na plataforma.", 2),
    alert(2, "saldo_baixo", "alta", "visto", EXC, "google", GOOGLE, "Saldo baixo: R$ 100,00 disponíveis, cerca de 1 dia(s) no ritmo atual de gasto.",
      "Adicionar saldo ou aumentar o limite de gastos antes que acabe.", 5),
    alert(3, "campanha_sem_entrega", "media", "aberto", EXC, "meta", META, "Campanha ativa sem impressões em 22/09 e 23/09.", null, 3, { campaign_id: C1, alert_key: `campanha_sem_entrega:${C1}` }),
    alert(4, "erro_api", "critica", "aberto", LOJA, "meta", US, "A última sincronização falhou: Token expirado",
      "Conferir a conexão em Configurações → Integrações e sincronizar de novo.", 1),
    alert(5, "queda_resultados", "media", "resolvido", EXC, "google", GOOGLE, "Conversões caíram 50% nos últimos 7 dias (de 20 para 10) em relação aos 7 dias anteriores.",
      null, 48, { resolved_at: ago(24), resolution: "automatica" }),
  );
  // "Verificar agora": encontra um problema novo e percebe que o erro da API foi resolvido
  db.alertRefresh = (d) => {
    d.alerts.find((a) => a.id === 4).status = "resolvido";
    Object.assign(d.alerts.find((a) => a.id === 4), { resolved_at: new Date().toISOString(), resolution: "automatica" });
    d.alerts.push(alert(6, "sincronizacao_atrasada", "alta", "aberto", EXC, "meta", META, "Sincronização atrasada: a última atualização com sucesso foi há 50 horas.",
      "Conferir a conexão em Configurações → Integrações.", 0));
    return { created: 1, updated: 3, resolved: 1 };
  };
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const cards = (page) => page.getByTestId("alert-card");
async function waitCount(page, n) {
  await page.waitForFunction((k) => document.querySelectorAll("[data-testid=alert-card]").length === k, n, { timeout: 5000 }).catch(() => {});
  return cards(page).count();
}
const card = (page, type) => page.locator(`[data-testid=alert-card][data-alert-type=${type}]`);

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await page.getByRole("heading", { name: /^Olá/ }).waitFor();

  // Número no menu: alertas ainda não vistos
  await page.getByTestId("nav-alerts-count").first().waitFor();
  check(clean(await page.getByTestId("nav-alerts-count").first().innerText()).startsWith("3"), "menu mostra 3 alertas não vistos");

  await page.getByRole("link", { name: /^Alertas/ }).first().click();
  await page.getByRole("heading", { name: "Alertas", level: 1 }).waitFor();
  check(await waitCount(page, 4) === 4, "abre com os 4 alertas não resolvidos");

  // Resumo por gravidade
  const count = async (s) => clean(await page.getByTestId(`count-${s}`).innerText());
  check((await count("critica")).includes("🔴 Crítica 2") && (await count("alta")).includes("🟠 Alta 1") && (await count("media")).includes("🟡 Média 1"), "resumo 🔴 🟠 🟡 com os abertos");

  // Ordem: mais grave primeiro, depois mais recente
  const order = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-alert-type")));
  check(JSON.stringify(order) === JSON.stringify(["erro_api", "sem_saldo", "saldo_baixo", "campanha_sem_entrega"]), `ordem por gravidade e data (${order})`);

  // Campos de cada alerta
  const semSaldo = card(page, "sem_saldo");
  const meta = clean(await semSaldo.getByTestId("alert-meta").innerText());
  check(meta.includes("Data:") && meta.includes("Cliente: Excalibur Fitness") && meta.includes("Plataforma: Meta Ads") && meta.includes("Conta: Excalibur Meta (act_611)"), "data, cliente, plataforma e conta");
  check(clean(await semSaldo.getByTestId("alert-type").innerText()) === "Conta sem saldo" && clean(await semSaldo.getByTestId("alert-severity").innerText()) === "🔴 Crítica", "tipo e gravidade");
  check(clean(await semSaldo.getByTestId("alert-description").innerText()).startsWith("Conta sem saldo:"), "descrição");
  check(clean(await semSaldo.getByTestId("alert-status").innerText()) === "Aberto", "status");
  check(clean(await semSaldo.getByTestId("alert-action").innerText()).includes("Adicionar saldo"), "ação recomendada (orientação técnica)");
  const semEntrega = card(page, "campanha_sem_entrega");
  check(await semEntrega.getByTestId("alert-action").count() === 0, "sem orientação objetiva: não inventa ação recomendada");
  check(await semEntrega.getByRole("link", { name: "Leads Setembro" }).count() === 1, "alerta de campanha leva à campanha");
  check(clean(await card(page, "saldo_baixo").getByTestId("alert-status").innerText()) === "Visto", "alerta visto aparece como Visto");
  await page.screenshot({ path: `${SHOTS}/150-alertas.png`, fullPage: true });

  // Filtros
  await page.getByTestId("count-critica").click();
  check(await waitCount(page, 2) === 2 && new URL(page.url()).searchParams.get("gravidade") === "critica", "clicar em 🔴 Crítica filtra");
  await page.getByTestId("count-critica").click();
  await page.getByLabel("Cliente").selectOption(LOJA);
  check(await waitCount(page, 1) === 1 && await card(page, "erro_api").count() === 1, "filtro por cliente");
  await page.getByLabel("Cliente").selectOption("");
  await page.getByLabel("Plataforma").selectOption("google");
  check(await waitCount(page, 1) === 1 && await card(page, "saldo_baixo").count() === 1, "filtro por plataforma");
  await page.getByLabel("Plataforma").selectOption("");
  await page.getByLabel("Tipo").selectOption("campanha_sem_entrega");
  check(await waitCount(page, 1) === 1, "filtro por tipo");
  await page.getByLabel("Tipo").selectOption("");
  await page.getByLabel("Situação").selectOption("resolvidos");
  check(await waitCount(page, 1) === 1 && clean(await card(page, "queda_resultados").innerText()).includes("Resolvido automaticamente"), "histórico: resolvidos automaticamente");
  check(await card(page, "queda_resultados").getByRole("button").count() === 0, "resolvido não muda mais (sem botões)");
  await page.getByLabel("Situação").selectOption("todos");
  check(await waitCount(page, 5) === 5, "situação: todos");
  await page.getByLabel("Situação").selectOption("abertos");
  await waitCount(page, 4);

  // Mudar status
  await semSaldo.getByRole("button", { name: "Marcar como visto" }).click();
  await semSaldo.getByTestId("alert-status").getByText("Visto").waitFor();
  check(db.rpcCalls.some((c) => c.fn === "set_alert_status" && c.p_id === 1 && c.p_status === "visto"), "marcar como visto");
  await page.waitForFunction(() => document.querySelector("[data-testid=nav-alerts-count]")?.textContent?.startsWith("2"), null, { timeout: 5000 }).catch(() => {});
  check(clean(await page.getByTestId("nav-alerts-count").first().innerText()).startsWith("2"), "número do menu diminui");
  await semSaldo.getByRole("button", { name: "Reabrir" }).click();
  await semSaldo.getByTestId("alert-status").getByText("Aberto").waitFor();
  check(true, "reabrir");
  await semSaldo.getByRole("button", { name: "Resolver" }).click();
  check(await waitCount(page, 3) === 3, "resolver tira da lista de abertos");
  check(db.alerts.find((a) => a.id === 1).resolution === "manual", "resolvido manualmente fica registrado");

  // Verificar agora
  await page.getByRole("button", { name: "Verificar agora" }).click();
  await page.getByText("Verificação concluída: 1 alerta novo · 1 resolvido automaticamente.").waitFor();
  check(await waitCount(page, 3) === 3 && await card(page, "sincronizacao_atrasada").count() === 1 && await card(page, "erro_api").count() === 0, "verificar agora: novo alerta aparece e o resolvido some");

  // Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  check(overflow.sw <= overflow.vw, `no celular a página cabe na tela ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: `${SHOTS}/151-alertas-celular.png`, fullPage: true });

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

{
  // Visualizador: vê, mas não muda status nem verifica
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  await login(page, "/alertas");
  await page.getByRole("heading", { name: "Alertas", level: 1 }).waitFor();
  check(await waitCount(page, 4) === 4, "visualizador vê os alertas");
  check(await page.getByRole("button", { name: "Verificar agora" }).count() === 0 && await page.getByRole("button", { name: "Resolver" }).count() === 0, "visualizador não altera nem verifica");
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}

{
  // Sem alertas: mensagem clara
  const { browser, page } = await launch();
  await mockSupabase(page, { role: "admin" });
  await login(page, "/alertas");
  await page.getByTestId("alerts-empty").waitFor();
  check((await page.getByTestId("alerts-empty").innerText()).includes("Nenhum alerta aberto. Tudo certo por aqui."), "sem alertas: mensagem de tudo certo");
  check(await page.getByTestId("nav-alerts-count").count() === 0, "sem alertas: menu sem número");
  await browser.close();
}

{
  // Perfil cliente não acessa a central interna
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "cliente" });
  seed(db);
  await login(page, "/alertas");
  await page.waitForTimeout(1500);
  check(!(await page.getByRole("heading", { name: "Alertas", level: 1 }).count()), "perfil cliente não acessa a central de alertas");
  await browser.close();
}

console.log("Central de alertas: tudo certo.");
