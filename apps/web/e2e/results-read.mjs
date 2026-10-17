/**
 * Teste de navegador da Etapa 39.2 — Inteligência de Resultados: leitura da planilha
 * (botão "Atualizar agora", última leitura, falha, leitura automática ligada/desligada).
 * Supabase e Google SIMULADOS (support.mjs): nenhuma planilha real é lida.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000003911";
const SOURCE = "51ee0000-0000-4000-8000-000000000391";
const SHEET = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

function seed(db) {
  db.clients.push({ id: EXC, name: "Excalibur Moda", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  db.sheetsDemo[SHEET] = {
    title: "Leads Excalibur",
    tabs: {
      "Leads": [
        ["ID", "Data", "Tipo de Cliente", "Campaign Name", "Ad Name", "Telefone"],
        ["L1", "10/10/2026", "Lojista", "Atacado SP", "Video Vitrine", "(11) 90000-0001"],
        ["L2", "10/10/2026", "Sacoleira", "Atacado SP", "Carrossel Kits", "(11) 90000-0002"],
        ["L3", "", "Consumidor final", "Varejo", "Video Look", "(11) 90000-0003"],
        ["L4", "11/10/2026", "lojista", "", "", "(11) 90000-0004"],
        ["L5", "12/10/2026", "", "Varejo", "Video Look", "(11) 90000-0005"],
      ],
    },
  };
  db.sheetsKey = { type: "service_account", client_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com" };
  Object.assign(db.sheetsSettings, { service_account_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com", has_key: true, key_updated_at: "2026-10-17T12:00:00Z" });
  db.riSources.push({ id: SOURCE, client_id: EXC, spreadsheet_id: SHEET, spreadsheet_title: "Leads Excalibur", sheet_name: "Leads", header_row: 1,
    mapping: { record_id: "ID", contact_date: "Data", profile: "Tipo de Cliente", campaign_name: "Campaign Name", ad_name: "Ad Name" },
    profile_rules: { lojista: "lojista", sacoleira: "sacoleiro", "consumidor final": "consumidor_final" }, enabled: true,
    read_status: "nunca", last_attempt_at: null, last_success_at: null, last_error: null, consecutive_failures: 0,
    created_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z" });
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const situation = (page) => page.getByTestId("ri-situation").getAttribute("data-situation");
const waitSituation = (page, v) => page.waitForFunction((x) => document.querySelector("[data-testid=ri-situation]")?.dataset.situation === x, v, { timeout: 5000 });

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, `/inteligencia-resultados?cliente=${EXC}`);
  const card = page.getByTestId("ri-read-status");
  await card.waitFor();
  check(await situation(page) === "nunca", "planilha nova: aguardando a primeira leitura");
  check(clean(await card.getByTestId("ri-last-read").innerText()) === "A planilha ainda não foi lida.", "sem leitura ainda, sem números inventados");
  check(clean(await card.getByTestId("ri-next-read").innerText()).includes("8h, 12h e 16h"), "mostra a próxima leitura automática e os horários");
  check(await card.getByTestId("ri-read-quality").count() === 0, "sem leitura, sem quadro de qualidade");

  await card.getByRole("button", { name: "Atualizar agora" }).click();
  await card.getByText("Planilha lida agora: 5 linha(s).").waitFor();
  await waitSituation(page, "ok");
  check(true, "\"Atualizar agora\" lê a planilha na hora");
  check(db.rpcCalls.some((c) => c.fn === "sheets" && c.action === "read_now" && c.sourceId === SOURCE), "o botão pede a leitura ao servidor");
  await card.getByTestId("ri-read-quality").waitFor();
  const last = clean(await card.getByTestId("ri-last-read").innerText());
  check(last.includes("5 linha(s)") && last.includes("atualizada pelo botão"), `última leitura com linhas e origem (${last})`);
  const quality = clean(await card.getByTestId("ri-read-quality").innerText());
  check(quality.includes("5 linha(s) com conteúdo"), "qualidade: total de linhas");
  check(quality.includes("1 sem perfil preenchido"), "qualidade: linhas sem perfil");
  check(quality.includes("1 sem campanha, conjunto ou anúncio"), "qualidade: linhas sem origem");
  check(quality.includes("1 sem data"), "qualidade: linhas sem data");
  check(!quality.includes("ID repetido"), "qualidade: não mostra o que está zerado");
  await card.screenshot({ path: `${SHOTS}/39.2-leitura-ok.png` });

  // Desligar e ligar a leitura automática
  await card.getByRole("button", { name: "Desligar leitura automática" }).click();
  await card.getByText("Leitura automática desligada.").waitFor();
  await waitSituation(page, "desativada");
  check(clean(await card.getByTestId("ri-next-read").innerText()).includes("só mudam pelo botão"), "desligada: avisa que só o botão atualiza");
  check(await card.getByRole("button", { name: "Atualizar agora" }).count() === 1, "desligada: o botão continua funcionando");
  await card.getByRole("button", { name: "Ligar leitura automática" }).click();
  await card.getByText("Leitura automática ligada (8h, 12h e 16h).").waitFor();
  await waitSituation(page, "ok");
  check(db.riSources[0].enabled === true, "leitura automática ligada de novo");

  // Falha: planilha deixou de estar compartilhada
  db.sheetsNotShared.push(SHEET);
  await card.getByRole("button", { name: "Atualizar agora" }).click();
  await card.getByTestId("ri-last-error").waitFor();
  await waitSituation(page, "erro");
  check(clean(await card.getByTestId("ri-last-error").innerText()).includes("crm-leitura@backstage-teste.iam.gserviceaccount.com"), "falha explica o que fazer (compartilhar com o e-mail)");
  check(clean(await card.getByTestId("ri-last-read").innerText()).includes("5 linha(s)"), "falha não apaga a última leitura boa");
  check(clean(await card.innerText()).includes("continuam os da última leitura boa"), "avisa que os números são os da última leitura boa");
  check(await card.getByText(/A planilha não está compartilhada/).count() === 1, "o motivo aparece uma vez só");
  check(await card.getByTestId("ri-stale").count() === 0, "uma falha só ainda não marca como desatualizado");
  await card.getByRole("button", { name: "Atualizar agora" }).click();
  await card.getByTestId("ri-stale").waitFor();
  check(clean(await card.getByTestId("ri-stale").innerText()).includes("2 leituras falharam"), "duas falhas seguidas: dados desatualizados");
  await card.screenshot({ path: `${SHOTS}/39.2-leitura-falha.png` });

  // Volta a funcionar
  db.sheetsNotShared.length = 0;
  await card.getByRole("button", { name: "Atualizar agora" }).click();
  await waitSituation(page, "ok");
  check(await card.getByTestId("ri-last-error").count() === 0 && await card.getByTestId("ri-stale").count() === 0, "leitura boa limpa a falha");
  await page.screenshot({ path: `${SHOTS}/39.2-pagina.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular não há rolagem para o lado");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ------------------------------------------------------------ operador: atualiza, não desliga
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "operador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC, created_at: "" });
  await login(page, `/inteligencia-resultados?cliente=${EXC}`);
  const card = page.getByTestId("ri-read-status");
  await card.waitFor();
  check(await card.getByRole("button", { name: /leitura automática/ }).count() === 0, "operador não liga/desliga a leitura automática");
  await card.getByRole("button", { name: "Atualizar agora" }).click();
  await card.getByText("Planilha lida agora: 5 linha(s).").waitFor();
  check(true, "operador usa o \"Atualizar agora\"");
  check(errors.length === 0, "sem erros no navegador (operador)");
  await browser.close();
}

// ------------------------------------------------------------ visualizador: só vê
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.access.push({ user_id: USER_ID, client_id: EXC, created_at: "" });
  db.riSnapshots[SOURCE] = { read_at: "2026-10-17T11:00:05Z", trigger: "agendada", row_count: 5, stats: { total: 5, noProfile: 1 } };
  Object.assign(db.riSources[0], { read_status: "ok", last_success_at: "2026-10-17T11:00:05Z" });
  await login(page, `/inteligencia-resultados?cliente=${EXC}`);
  const card = page.getByTestId("ri-read-status");
  await card.getByTestId("ri-read-quality").waitFor();
  check(clean(await card.getByTestId("ri-last-read").innerText()).includes("leitura automática"), "visualizador vê a última leitura automática");
  check(await card.getByRole("button").count() === 0, "visualizador não tem botões de leitura");
  check(errors.length === 0, "sem erros no navegador (visualizador)");
  await browser.close();
}

console.log(`\nInteligência de Resultados 39.2: tudo certo (${BASE}).`);
