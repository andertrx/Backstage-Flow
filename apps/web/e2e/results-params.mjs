/**
 * Teste de navegador — parâmetros da planilha refeitos (pedido do Ander, 19/10/2026):
 * Nome, Número, SQL, Data, utm_source/medium/campaign/content/term, campaign_id, adset_id,
 * ad_id, gclid, fbclid e parâmetros personalizados. O nome nunca é guardado.
 * Supabase e Google SIMULADOS (support.mjs).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const EXC = "e0000000-0000-4000-8000-000000003961";
const SHEET = "1PaRaMeTrOsAaAaAaAaAaAaAaAaAaAaAaAaAa";
const sp = (daysAgo) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - daysAgo * 86_400_000));
const br = (iso) => iso.split("-").reverse().join("/");

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ id: EXC, name: "Excalibur Moda", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
db.sheetsKey = { type: "service_account", client_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com" };
Object.assign(db.sheetsSettings, { service_account_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com", has_key: true });
db.sheetsDemo[SHEET] = {
  title: "Leads com UTM",
  tabs: {
    Leads: [
      ["Nome", "Número", "Perfil de Lojista (SQL)", "Data", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "campaign_id", "adset_id", "ad_id", "gclid", "fbclid", "Cidade"],
      ["Maria Souza", "(11) 98888-0001", "Lojista", br(sp(2)), "facebook", "paid_social", "Atacado SP", "Video Vitrine", "Lojistas 25-45", "9001", "9011", "9021", "", "IwAR-abc", "Campinas"],
      ["Joana Lima", "(11) 98888-0002", "Consumidor final", br(sp(3)), "google", "cpc", "Varejo", "Banner", "Aberto", "", "", "", "Cj0K-xyz", "", ""],
    ],
  },
};

await login(page, `/inteligencia-resultados?cliente=${EXC}`);
const step1 = page.getByTestId("ri-step-1");
await step1.getByLabel(/Link da planilha/).fill(`https://docs.google.com/spreadsheets/d/${SHEET}/edit`);
await step1.getByRole("button", { name: "Abrir planilha" }).click();
await step1.getByLabel("Aba com os contatos").selectOption("Leads");
await step1.getByRole("button", { name: "Ler colunas" }).click();
const mapping = page.getByTestId("ri-mapping");
await mapping.waitFor();
const val = (label) => mapping.getByLabel(label, { exact: true }).inputValue();
const expected = {
  Nome: "Nome", "Número": "Número", "SQL (obrigatório)": "Perfil de Lojista (SQL)", Data: "Data", utm_source: "utm_source", utm_medium: "utm_medium",
  utm_campaign: "utm_campaign", utm_content: "utm_content", utm_term: "utm_term", campaign_id: "campaign_id", adset_id: "adset_id", ad_id: "ad_id",
  gclid: "gclid", fbclid: "fbclid",
};
for (const [label, column] of Object.entries(expected)) check(await val(label) === column, `parâmetro ${label} reconhecido sozinho`);
const legends = await mapping.locator("legend").allInnerTexts();
check(legends.join("|").toLowerCase().includes("origem (utms e ids)") && legends.join("|").toLowerCase().includes("parâmetros personalizados"), "grupos: Contato, Origem (UTMs e IDs), Outros e Personalizados");

// Parâmetro personalizado
const custom = page.getByTestId("ri-custom");
await custom.getByRole("button", { name: "Adicionar parâmetro" }).click();
await page.getByText("Dê um nome ao parâmetro").waitFor();
check(true, "sem nome não adiciona");
await custom.getByLabel("Nome do parâmetro").fill("Cidade");
await custom.getByLabel("Coluna da planilha").selectOption("Cidade");
await custom.getByRole("button", { name: "Adicionar parâmetro" }).click();
await custom.getByText("→ coluna “Cidade”").waitFor();
check(true, "parâmetro personalizado adicionado");
await page.setViewportSize({ width: 1280, height: 1800 });
await mapping.screenshot({ path: `${SHOTS}/parametros-planilha.png` });

const step3 = page.getByTestId("ri-step-3");
await step3.getByRole("button", { name: "Ler os valores da coluna SQL" }).click();
await page.getByTestId("ri-rules").waitFor();
await page.getByRole("button", { name: "Salvar configuração" }).click();
await page.getByTestId("ri-source-summary").waitFor();
const saved = db.riSources[0].mapping;
check(saved.contact_name === "Nome" && saved.utm_source === "utm_source" && saved.fbclid === "fbclid" && saved["x:Cidade"] === "Cidade", "configuração salva com os parâmetros novos e o personalizado");
const summary = (await page.getByTestId("ri-mapped").innerText()).replace(/\s+/g, " ");
check(summary.includes("SQL") && summary.includes("utm_source") && summary.includes("Cidade (personalizado)"), "resumo mostra os parâmetros");

// Leitura e registros
await page.getByRole("button", { name: "Atualizar agora" }).click();
await page.getByText("Planilha lida agora: 2 linha(s).").waitFor();
const rows = JSON.stringify(Object.values(db.riSnapshots)[0].rows);
check(!/Maria|Joana|IwAR-abc|Cj0K-xyz|98888/.test(rows), "nada de nome, número ou código de clique guardado");
await page.getByRole("button", { name: "Qualidade dos dados", exact: true }).click();
await page.getByTestId("ri-q-sem-origem").or(page.getByTestId("ri-q-nao-encontrada")).first().getByRole("button", { name: "Ver linhas" }).click();
await page.getByTestId("ri-record-params").first().waitFor();
await page.waitForFunction(() => [...document.querySelectorAll("[data-testid=ri-record-params]")].some((e) => e.textContent.includes("utm_source")));
const params = (await page.getByTestId("ri-record-params").allInnerTexts()).join(" | ");
check(params.includes("utm_source: facebook") && params.includes("Clique do Meta") && params.includes("Cidade: Campinas"), `registros mostram os parâmetros (${params})`);
check(params.includes("utm_source: google") && params.includes("Clique do Google"), "clique do Google");
check(!(await page.getByTestId("ri-records").innerText()).includes("Maria"), "registros sem o nome");
check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();

console.log(`\nParâmetros da planilha: tudo certo (${BASE}).`);
