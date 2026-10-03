/**
 * Teste de navegador da Etapa 37.3 — Monitoramento: motor de alertas.
 * Visão geral (alertas abertos e avaliação automática), aba Alertas e Configurações (frequência, avaliar agora).
 * Supabase SIMULADO (support.mjs).
 */
import { check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000000001";
const LOJA = "e0000000-0000-4000-8000-000000000002";
const META = "a0000000-0000-4000-8000-000000000901";
const US = "a0000000-0000-4000-8000-000000000903";
const C1 = "c0000000-0000-4000-8000-000000000901";
const C3 = "c0000000-0000-4000-8000-000000000903";
const A1 = "d0000000-0000-4000-8000-000000000901";

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const alert = (id, o) => ({
  id, kind: "limite", level: "campaign", metric: "cost_per_result", severity: "critico", status: "novo", client_id: EXC, platform_id: "meta",
  ad_account_id: META, campaign_id: C1, ad_id: null, currency: "BRL", current_value: 5, previous_value: 2, variation_pct: 150,
  period_from: day(-7), period_to: day(-1), prev_from: day(-14), prev_to: day(-8), attention_pct: 20, critical_pct: 40,
  explanation: "Custo por resultado: alta de 150,0% (de R$ 2,00 para R$ 5,00) nos últimos 7 dias em relação aos 7 dias anteriores. Limite crítico: 40%.",
  context: [], details: {}, detections: 1, first_detected_at: ago(120), last_detected_at: ago(10), recurrence_of: null, recurrence_count: 0,
  resolved_at: null, resolution: null, ...o,
});

function seed(db) {
  const client = (id, name) => ({ id, name, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "" });
  db.clients.push(client(EXC, "Excalibur Fitness"), client(LOJA, "Loja Internacional"));
  db.adAccounts.push(
    { id: META, platform_id: "meta", external_id: "611", client_id: EXC, name: "Excalibur Meta", currency: "BRL", status: "ativa", unlinked_at: null },
    { id: US, platform_id: "meta", external_id: "613", client_id: LOJA, name: "Loja US", currency: "USD", status: "ativa", unlinked_at: null },
  );
  db.campaigns.push(
    { id: C1, ad_account_id: META, client_id: EXC, platform_id: "meta", external_id: "c1", name: "Leads Setembro", status: "ativa" },
    { id: C3, ad_account_id: US, client_id: LOJA, platform_id: "meta", external_id: "c3", name: "Loja US Vendas", status: "ativa" },
  );
  db.ads.push({ id: A1, campaign_id: C1, ad_account_id: META, client_id: EXC, name: "Depoimento Ana", status: "ativa", thumbnail_url: "https://cdn.test/a1.png" });
  db.syncState[META] = { status: "sucesso", last_success_at: ago(20) };
  db.syncState[US] = { status: "sucesso", last_success_at: ago(20) };
  db.monitorRuns.push({ started_at: ago(30), finished_at: ago(30), trigger: "agendada", evaluated: 2, skipped: 1, created: 3, updated: 0, resolved: 1, error: null });
  db.monitorAlerts.push(
    alert(1, {}),
    alert(2, { kind: "sem_resultados", level: "ad", metric: "results", severity: "atencao", ad_id: A1, current_value: 0, previous_value: 2, variation_pct: null,
      attention_pct: null, critical_pct: null, detections: 3,
      explanation: "Anúncio investiu R$ 14,00 nos últimos 7 dias sem nenhum resultado. No período anterior, a campanha gastava R$ 2,00 por resultado." }),
    alert(3, { client_id: LOJA, ad_account_id: US, campaign_id: C3, currency: "USD", metric: "cpm", severity: "atencao", current_value: 13, previous_value: 10, variation_pct: 30,
      recurrence_of: 9, recurrence_count: 1, explanation: "CPM: alta de 30,0% (de US$ 10,00 para US$ 13,00) nos últimos 7 dias em relação aos 7 dias anteriores. Limite de atenção: 20%.",
      context: [{ field: "status", level: "campaign", old: "ativa", new: "pausada", at: ago(60 * 30) }] }),
    alert(4, { kind: "anomalia", metric: "results", severity: "atencao", resolved_at: ago(200), resolution: "automatica", status: "resolvido", period_from: day(-1), period_to: day(-1),
      explanation: "Fora do padrão: em ontem resultados = 1, contra média de 10 nos 28 dias anteriores (8,8 desvios-padrão abaixo)." }),
    alert(6, { client_id: LOJA, ad_account_id: US, campaign_id: C3, currency: "USD", metric: "ctr", severity: "atencao", current_value: 0.8, previous_value: 1, variation_pct: -20, resolved_at: ago(100), resolution: "automatica",
      status: "resolvido", details: { closed_reason: "inativo" }, explanation: "CTR: queda de 20,0% (de 1,00% para 0,80%) nos últimos 7 dias em relação aos 7 dias anteriores. Limite de atenção: 15%." }),
  );
  // O que a próxima "Avaliar agora" vai encontrar
  db.monitorNextAlerts.push(alert(5, { metric: "ctr", severity: "atencao", current_value: 0.8, previous_value: 1, variation_pct: -20,
    explanation: "CTR: queda de 20,0% (de 1,00% para 0,80%) nos últimos 7 dias em relação aos 7 dias anteriores. Limite de atenção: 15%." }));
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await page.route("https://cdn.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();

  const tabs = await page.getByRole("tab").allInnerTexts();
  check(JSON.stringify(tabs) === JSON.stringify(["Visão geral", "Alertas", "Comparativos", "Campanhas", "Criativos", "Histórico", "Configurações"]), `aba Alertas logo depois da Visão geral (${tabs})`);

  // Visão geral: abertos por gravidade e situação da avaliação
  await page.waitForFunction(() => document.querySelector("[data-testid=abertos-critico]")?.textContent.includes("1"), null, { timeout: 5000 }).catch(() => {});
  check(clean(await page.getByTestId("abertos-critico").innerText()).includes("Críticos 1"), "1 crítico aberto");
  check(clean(await page.getByTestId("abertos-atencao").innerText()).includes("Atenção 2"), "2 de atenção abertos (o resolvido não conta)");
  check(clean(await page.getByTestId("abertos-informativo").innerText()).includes("Informativos 0"), "0 informativos");
  const last = clean(await page.getByTestId("ultima-avaliacao").innerText());
  check(last.includes("Última avaliação (automática) há 30 minutos") && last.includes("2 conta(s) avaliada(s), 1 pulada(s)"), `última avaliação explicada (${last})`);
  check(clean(await page.getByTestId("proxima-avaliacao").innerText()).startsWith("Avaliação automática a cada 1 hora · Próxima por volta de"), "mostra frequência e próxima avaliação");
  await page.screenshot({ path: `${SHOTS}/37.3-visao-geral.png`, fullPage: true });

  // Aba Alertas
  await page.getByRole("button", { name: "Ver alertas" }).click();
  await page.getByTestId("alerta").first().waitFor();
  check(page.url().includes("aba=alertas"), "aba fica no endereço");
  const cards = page.getByTestId("alerta");
  check(await cards.count() === 3, `3 abertos (${await cards.count()})`);
  check(await cards.first().getAttribute("data-severity") === "critico", "crítico primeiro");
  const c1 = clean(await cards.first().innerText());
  check(c1.includes("Crítico") && c1.includes("Passou do limite") && c1.includes("Campanha: Leads Setembro") && c1.includes("Excalibur Fitness · Excalibur Meta"), `crítico com campanha e cliente (${c1})`);
  check(c1.includes("Custo por resultado: alta de 150,0% (de R$ 2,00 para R$ 5,00)"), "explicação do motor");
  check(c1.includes("Agora: R$ 5,00 (antes R$ 2,00)"), "valor atual e anterior na moeda da conta");
  check(/Período: \d\d\/\d\d\/\d{4} a \d\d\/\d\d\/\d{4} × \d\d\/\d\d\/\d{4} a \d\d\/\d\d\/\d{4}/.test(c1), "períodos comparados");
  const adCard = page.locator("[data-testid=alerta][data-kind=sem_resultados]");
  const ad = clean(await adCard.innerText());
  check(ad.includes("Sem resultados") && ad.includes("Anúncio: Depoimento Ana") && ad.includes("Detectado: 3 vezes"), `alerta de anúncio (${ad})`);
  check(await adCard.locator("img").count() === 1, "anúncio mostra a miniatura");
  const us = clean(await page.locator("[data-testid=alerta]", { hasText: "Loja US Vendas" }).innerText());
  check(us.includes("Reincidência (2ª vez)"), "marca a reincidência");
  check(us.includes("US$ 13,00") && !us.includes("R$ 13"), "valores em dólar ficam em dólar");
  check(us.includes("Mudanças no período") && us.includes("status mudou de “ativa” para “pausada”"), "mostra a mudança que pode explicar a variação");
  await page.screenshot({ path: `${SHOTS}/37.3-alertas.png`, fullPage: true });

  // Filtros
  // Etapa 37.6: o filtro de cliente passa pelo endereço; espera a lista atualizar.
  const waitCount = (n) => page.waitForFunction((k) => document.querySelectorAll("[data-testid=alerta]").length === k, n, { timeout: 5000 }).catch(() => {});
  await page.getByLabel("Cliente").selectOption(LOJA);
  await waitCount(1);
  check(await cards.count() === 1, "filtro por cliente");
  check(page.url().includes("cliente="), "filtro de cliente fica no endereço");
  await page.getByLabel("Cliente").selectOption("");
  await page.waitForFunction(() => !location.search.includes("cliente="), null, { timeout: 5000 }).catch(() => {});
  await page.getByLabel("Gravidade").selectOption("critico");
  check(await cards.count() === 1, "filtro por gravidade");
  await page.getByLabel("Gravidade").selectOption("");
  await page.getByLabel("Tipo").selectOption("sem_resultados");
  check(await cards.count() === 1, "filtro por tipo");
  await page.getByLabel("Tipo").selectOption("anomalia");
  check(await page.getByTestId("sem-alertas").count() === 1, "sem resultado: mensagem clara");
  await page.getByLabel("Tipo").selectOption("");
  // Histórico (resolvidos)
  await page.getByRole("button", { name: "Resolvidos (histórico)" }).click();
  await page.getByTestId("alerta").first().waitFor();
  check(await cards.count() === 2, `2 resolvidos no histórico (${await cards.count()})`);
  const res = clean(await page.locator("[data-testid=alerta][data-kind=anomalia]").innerText());
  check(res.includes("Fora do padrão") && res.includes("Normalizou sozinho"), `resolvido aparece no histórico (${res})`);
  const off = clean(await page.locator("[data-testid=alerta]", { hasText: "Loja US Vendas" }).innerText());
  check(off.includes("Encerrado: item desativado"), `item desativado: encerrado com o motivo (${off})`);
  check(db.rpcCalls.some((c) => c.fn === "monitor_alerts_query" && c.p_open === false), "histórico consulta os resolvidos");
  await page.getByRole("button", { name: "Abertos" }).click();

  // Configurações: frequência e avaliar agora
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page.getByTestId("config-motor").waitFor();
  await page.getByLabel("Frequência").selectOption("180");
  await page.getByLabel("Coleta atrasada depois de (horas)").fill("6");
  await page.getByTestId("config-motor").getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Configuração salva.").waitFor();
  const saved = db.rpcCalls.filter((c) => c.fn === "monitor_settings_save").at(-1);
  check(saved?.p_interval === 180 && saved.p_stale_hours === 6 && saved.p_enabled === true, "salvou a frequência e o atraso tolerado");
  check(db.monitorSettings.eval_interval_minutes === 180, "configuração gravada");
  await page.getByTestId("avaliar-agora").click();
  await page.getByText(/Avaliação concluída: 2 conta\(s\) avaliada\(s\), 1 alerta\(s\) novo\(s\)/).waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByText(/Avaliação concluída: 2 conta\(s\) avaliada\(s\), 1 alerta\(s\) novo\(s\)/).count() === 1, "avaliar agora mostra o resultado");
  await page.getByTestId("avaliar-agora").click();
  await page.getByText("Uma avaliação acabou de rodar. Aguarde 2 minutos para avaliar de novo.").waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByText("Uma avaliação acabou de rodar. Aguarde 2 minutos para avaliar de novo.").count() === 1, "segunda avaliação seguida é recusada com explicação");
  await page.screenshot({ path: `${SHOTS}/37.3-configuracoes.png`, fullPage: true });

  // O alerta novo aparece na lista e na contagem
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=alerta]").length === 4, null, { timeout: 5000 }).catch(() => {});
  check(await cards.count() === 4, "alerta da nova avaliação aparece");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page.getByLabel("Avaliar automaticamente").uncheck();
  await page.getByTestId("config-motor").getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Configuração salva.").waitFor();
  await page.getByRole("tab", { name: "Visão geral" }).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=proxima-avaliacao]")?.textContent.includes("desligada"), null, { timeout: 5000 }).catch(() => {});
  check(clean(await page.getByTestId("proxima-avaliacao").innerText()) === "Avaliação automática desligada", "desligar aparece na visão geral");
  check(clean(await page.getByTestId("abertos-atencao").innerText()).includes("Atenção 3"), "contagem inclui o alerta novo");

  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

// Gestor: vê só os clientes liberados; avalia agora; não muda a frequência.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC });
  await page.route("https://cdn.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.getByTestId("alerta").first().waitFor();
  const txt = clean(await page.locator("main").innerText());
  check(await page.getByTestId("alerta").count() === 2 && !txt.includes("Loja US"), "gestor só vê os alertas dos clientes dele");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page.getByTestId("config-motor-leitura").waitFor();
  check(await page.getByTestId("config-motor").count() === 0, "gestor não muda a frequência");
  check(clean(await page.getByTestId("config-motor-leitura").innerText()).includes("Só o administrador muda isso"), "explica quem pode mudar");
  check(await page.getByTestId("avaliar-agora").count() === 1, "gestor pode avaliar agora");
  check(errors.length === 0, "sem erros (gestor)");
  await browser.close();
}

// Visualizador: vê, mas não avalia nem configura. Celular sem rolagem lateral.
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC }, { user_id: USER_ID, client_id: LOJA });
  await page.route("https://cdn.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "/monitoramento");
  await page.getByRole("heading", { name: "Monitoramento de Desempenho", level: 1 }).waitFor();
  await page.getByTestId("abertos-critico").waitFor();
  check(await page.getByTestId("avaliar-agora").count() === 0, "visualizador não tem Avaliar agora");
  await page.getByRole("tab", { name: "Alertas" }).click();
  await page.getByTestId("alerta").first().waitFor();
  check(await page.getByTestId("alerta").count() === 3, "visualizador vê os alertas");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `celular sem rolagem lateral (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/37.3-celular.png`, fullPage: true });
  check(!db.rpcCalls.some((c) => c.fn === "monitor_evaluate_now" || c.fn === "monitor_settings_save"), "visualizador não chama funções de mudança");
  check(errors.length === 0, "sem erros (visualizador)");
  await browser.close();
}
