/**
 * Teste de navegador da Etapa 39.1 — Inteligência de Resultados: conexão com o Google Sheets.
 * Supabase e Google SIMULADOS (support.mjs): nenhuma planilha real é lida.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000003901";
const LOJA = "e0000000-0000-4000-8000-000000003902";
const SHEET = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const PRIVATE = "1PrIvAdAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const KEY = JSON.stringify({ type: "service_account", client_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nTESTE\n-----END PRIVATE KEY-----\n" });

function seed(db, { withKey = false, withSource = false } = {}) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  db.clients.push(client(EXC, "Excalibur Moda"), client(LOJA, "Loja Sem Planilha"));
  db.sheetsDemo[SHEET] = {
    title: "Leads Excalibur",
    tabs: {
      "Resumo": [["Total"], ["10"]],
      "Leads": [
        ["ID", "Data", "Tipo de Cliente", "Campaign Name", "Ad Set Name", "Ad Name", "Ad ID", "Telefone"],
        ["L1", "10/10/2026", "Lojista", "Atacado SP", "Lojistas 25-45", "Video Vitrine", "120000000001", "(11) 90000-0001"],
        ["L2", "10/10/2026", "Sacoleira", "Atacado SP", "Revenda", "Carrossel Kits", "120000000002", "(11) 90000-0002"],
        ["L3", "11/10/2026", "Consumidor final", "Varejo", "Aberto", "Video Look", "120000000003", "(11) 90000-0003"],
        ["L4", "11/10/2026", "lojista ", "Atacado SP", "Lojistas 25-45", "Video Vitrine", "120000000001", "(11) 90000-0004"],
        ["L5", "12/10/2026", "", "Varejo", "Aberto", "Video Look", "120000000003", "(11) 90000-0005"],
      ],
    },
  };
  db.sheetsNotShared.push(PRIVATE);
  if (withKey) {
    db.sheetsKey = JSON.parse(KEY);
    Object.assign(db.sheetsSettings, { service_account_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com", has_key: true, key_updated_at: "2026-10-17T12:00:00Z" });
  }
  if (withSource) {
    db.riSources.push({ id: "51ee0000-0000-4000-8000-000000000099", client_id: EXC, spreadsheet_id: SHEET, spreadsheet_title: "Leads Excalibur", sheet_name: "Leads",
      header_row: 1, mapping: { record_id: "ID", profile: "Tipo de Cliente", campaign_name: "Campaign Name" },
      profile_rules: { lojista: "lojista", sacoleira: "sacoleiro" }, enabled: true, created_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z" });
  }
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

// ------------------------------------------------------------ administrador: chave + planilha
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/configuracoes/integracoes");
  const card = page.getByTestId("sheets-settings-card");
  await card.waitFor();
  await card.getByText("Nenhuma chave cadastrada").waitFor();
  check(true, "Integrações: cartão do Google Sheets sem chave");
  await card.getByLabel(/Chave da conta de serviço/).fill("minha senha");
  await card.getByRole("button", { name: "Salvar chave" }).click();
  await card.getByText("Isto não parece o arquivo JSON da chave").waitFor();
  check(true, "texto qualquer é recusado antes de ir para o servidor");
  await card.getByLabel(/Chave da conta de serviço/).fill(KEY);
  await card.getByRole("button", { name: "Salvar chave" }).click();
  await card.getByText("Chave guardada no cofre. Agora").waitFor();
  check((await card.getByLabel(/Trocar a chave/).inputValue()) === "", "a chave some da tela depois de salva");
  check(clean(await card.getByTestId("sheets-service-email").innerText()) === "crm-leitura@backstage-teste.iam.gserviceaccount.com", "mostra o e-mail com que as planilhas devem ser compartilhadas");
  await card.getByRole("button", { name: "Testar conexão" }).click();
  await card.getByText("Conexão com o Google funcionando").waitFor();
  check((await card.innerText()).includes("funcionou"), "teste da conexão registrado");
  await card.screenshot({ path: `${SHOTS}/39.1-integracao.png` });

  // Menu e página
  await page.getByRole("link", { name: "Inteligência de Resultados" }).click();
  await page.getByRole("heading", { name: "Inteligência de Resultados" }).waitFor();
  check(page.url().endsWith("/inteligencia-resultados"), "item no menu abre o módulo");
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Excalibur Moda" });
  await page.getByTestId("ri-setup").waitFor();
  check(page.url().includes(`cliente=${EXC}`), "cliente escolhido fica no endereço");

  const step1 = page.getByTestId("ri-step-1");
  await step1.getByLabel(/Link da planilha/).fill("https://exemplo.com/planilha");
  await step1.getByRole("button", { name: "Abrir planilha" }).click();
  await page.getByText("Link não reconhecido").waitFor();
  check(true, "link que não é do Google Sheets é recusado");
  await step1.getByLabel(/Link da planilha/).fill(`https://docs.google.com/spreadsheets/d/${PRIVATE}/edit`);
  await step1.getByRole("button", { name: "Abrir planilha" }).click();
  await page.getByText("não está compartilhada com o CRM").waitFor();
  check((await page.getByText("não está compartilhada com o CRM").innerText()).includes("crm-leitura@backstage-teste.iam.gserviceaccount.com"),
    "planilha não compartilhada: diz com qual e-mail compartilhar");
  await step1.getByLabel(/Link da planilha/).fill(`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`);
  await step1.getByRole("button", { name: "Abrir planilha" }).click();
  await page.getByTestId("ri-sheet-title").waitFor();
  check(clean(await page.getByTestId("ri-sheet-title").innerText()).includes("Leads Excalibur"), "abre a planilha e mostra o título");
  await step1.getByLabel("Aba com os contatos").selectOption("Leads");
  await step1.getByRole("button", { name: "Ler colunas" }).click();
  await page.getByTestId("ri-preview").waitFor();
  const prev = clean(await page.getByTestId("ri-preview").innerText());
  check(prev.includes("Tipo de Cliente") && prev.includes("Atacado SP"), "prévia com cabeçalho e linhas");

  const mapping = page.getByTestId("ri-mapping");
  check(await mapping.getByLabel("Perfil comercial (obrigatório)").inputValue() === "Tipo de Cliente", "sugestão: coluna do perfil");
  check(await mapping.getByLabel("Nome da campanha").inputValue() === "Campaign Name" && await mapping.getByLabel("ID do anúncio").inputValue() === "Ad ID"
    && await mapping.getByLabel("ID do contato").inputValue() === "ID", "sugestão: campanha, anúncio e ID");
  check(await mapping.getByLabel("ID da campanha").inputValue() === "", "o que não existe na planilha fica \"não usar\"");
  await mapping.getByLabel("Telefone ou e-mail").selectOption("");

  const step3 = page.getByTestId("ri-step-3");
  await step3.getByRole("button", { name: "Ler os valores da coluna de perfil" }).click();
  await page.getByTestId("ri-rules").waitFor();
  check(clean(await page.getByTestId("ri-values-total").innerText()).startsWith("5 linhas"), "lê todas as linhas da coluna de perfil");
  check(await step3.getByLabel("Perfil de Lojista").inputValue() === "lojista" && await step3.getByLabel("Perfil de Consumidor final").inputValue() === "consumidor_final",
    "nomes exatos já vêm com o perfil (\"lojista \" com espaço conta junto)");
  check(await step3.getByLabel("Perfil de Sacoleira").inputValue() === "", "\"Sacoleira\" não vira Sacoleiro sozinha");
  check(clean(await page.getByTestId("ri-unclassified").innerText()).startsWith("2 linha(s)"), "avisa quantas linhas ficariam como Não identificado");
  await step3.getByLabel("Perfil de Sacoleira").selectOption("sacoleiro");
  check(clean(await page.getByTestId("ri-unclassified").innerText()).startsWith("1 linha(s)"), "a conta muda ao escolher o perfil");
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.getByTestId("ri-setup").screenshot({ path: `${SHOTS}/39.1-configuracao.png` });

  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await page.getByTestId("ri-source-summary").waitFor();
  const saved = db.riSources[0];
  check(saved.spreadsheet_id === SHEET && saved.sheet_name === "Leads" && saved.header_row === 1 && saved.spreadsheet_title === "Leads Excalibur",
    "planilha, aba e cabeçalho salvos");
  check(saved.mapping.profile === "Tipo de Cliente" && saved.mapping.ad_id === "Ad ID" && !("contact_key" in saved.mapping), "colunas salvas (só as escolhidas)");
  const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
  check(sorted(saved.profile_rules) === sorted({ lojista: "lojista", sacoleira: "sacoleiro", "consumidor final": "consumidor_final" }),
    `regras salvas (${JSON.stringify(saved.profile_rules)})`);
  const summary = clean(await page.getByTestId("ri-source-summary").innerText());
  check(summary.includes("Leads Excalibur") && summary.includes("Aba Leads") && summary.includes("sacoleira → Sacoleiro"), "resumo da configuração");
  check(db.rpcCalls.filter((c) => c.fn === "sheets").every((c) => !JSON.stringify(c).includes("90000")), "nenhum dado da planilha vai do navegador para o servidor");
  await page.getByTestId("ri-source-summary").screenshot({ path: `${SHOTS}/39.1-resumo.png` });

  // Editar: abre o assistente com o que já estava salvo
  await page.getByRole("button", { name: "Editar configuração" }).click();
  await page.getByTestId("ri-setup").waitFor();
  check(await page.getByTestId("ri-step-3").getByLabel("Perfil de sacoleira").inputValue() === "sacoleiro", "editar mantém as regras salvas");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByTestId("ri-source-summary").waitFor();

  // Outro cliente, sem planilha: abre o assistente vazio
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Loja Sem Planilha" });
  await page.getByTestId("ri-setup").waitFor();
  check(await page.getByTestId("ri-step-1").getByLabel(/Link da planilha/).inputValue() === "", "cada cliente tem a sua planilha");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular não há rolagem para o lado");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ------------------------------------------------------------ visualizador: só vê
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db, { withKey: true, withSource: true });
  db.access.push({ user_id: USER_ID, client_id: EXC, created_at: "" }, { user_id: USER_ID, client_id: LOJA, created_at: "" });
  await login(page, `/inteligencia-resultados?cliente=${EXC}&aba=planilha`);
  await page.getByTestId("ri-source-summary").waitFor();
  check(await page.getByRole("button", { name: "Editar configuração" }).count() === 0, "visualizador vê a configuração, sem editar");
  await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Loja Sem Planilha" });
  await page.getByText("ainda não tem planilha conectada").waitFor();
  check(await page.getByTestId("ri-setup").count() === 0, "visualizador não conecta planilha");
  check(errors.length === 0, "sem erros no navegador (visualizador)");
  await browser.close();
}

// ------------------------------------------------------------ cliente: não vê o módulo
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "cliente" });
  seed(db, { withKey: true, withSource: true });
  await login(page, "/");
  check(await page.getByRole("link", { name: "Inteligência de Resultados" }).count() === 0, "cliente não vê o item no menu");
  await browser.close();
}

console.log(`\nInteligência de Resultados 39.1: tudo certo (${BASE}).`);
