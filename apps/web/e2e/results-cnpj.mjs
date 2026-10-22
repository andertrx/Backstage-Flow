/**
 * Teste de navegador — Inteligência de Resultados, caso específico (22/10/2026):
 * planilha que só pede o CNPJ. Com "Esta coluna é CNPJ", 14 números = Lojista; vazio ou outra coisa = Não identificado.
 * O número do CNPJ nunca é guardado. Supabase e Google SIMULADOS (support.mjs).
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004101";
const SHEET = "1CnPjCnPjCnPjCnPjCnPjCnPjCnPjCnPj012345";
const dmy = (daysAgo) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - daysAgo * 86_400_000));

function seed(db) {
  db.clients.push({ id: CLI, name: "Atacado CNPJ", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  db.sheetsKey = { type: "service_account", client_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com" };
  Object.assign(db.sheetsSettings, { service_account_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com", has_key: true });
  db.sheetsDemo[SHEET] = {
    title: "Leads Atacado",
    tabs: {
      "Leads": [
        ["Nome:", "CNPJ:", "Data:", "Número:", "utm_campaign"],
        ["Ana", "12.345.678/0001-90", dmy(2), "(11) 90000-0001", "Atacado"],
        ["Bia", "98765432000110", dmy(2), "(11) 90000-0002", "Atacado"],
        ["Caio", "", dmy(3), "(11) 90000-0003", "Atacado"],
        ["Duda", "123.456.789-01", dmy(3), "(11) 90000-0004", "Atacado"],
        ["Edu", "não tenho", dmy(3), "(11) 90000-0005", "Atacado"],
      ],
    },
  };
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const kpi = async (page, testid) => clean(await page.getByTestId(testid).getByTestId("ri-kpi-value").innerText());

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
seed(db);
await login(page, `/inteligencia-resultados?cliente=${CLI}`);
const step1 = page.getByTestId("ri-step-1");
await step1.getByLabel(/Link da planilha/).fill(`https://docs.google.com/spreadsheets/d/${SHEET}/edit`);
await step1.getByRole("button", { name: "Abrir planilha" }).click();
await page.getByTestId("ri-sheet-title").waitFor();
await step1.getByRole("button", { name: "Ler colunas" }).click();
await page.getByTestId("ri-preview").waitFor();

const mapping = page.getByTestId("ri-mapping");
const step3 = page.getByTestId("ri-step-3");
await mapping.getByLabel("Data", { exact: true }).selectOption("Data:");
await mapping.getByLabel("Número", { exact: true }).selectOption("Número:");
await mapping.getByLabel("SQL (obrigatório)", { exact: true }).selectOption("CNPJ:");
check(await step3.getByTestId("ri-cnpj-mode").isChecked(), "coluna \"CNPJ:\" no SQL: a opção CNPJ vem marcada sozinha");
check(await step3.getByRole("button", { name: "Ler os valores da coluna SQL" }).count() === 0, "no modo CNPJ não há regras por valor");
check(clean(await step3.getByTestId("ri-cnpj-summary").innerText()).includes("CNPJ com 14 números → Lojista"), "explica a regra na tela");
await page.getByTestId("ri-setup").screenshot({ path: `${SHOTS}/39.9-cnpj-configuracao.png` });

await page.getByRole("button", { name: "Salvar configuração" }).click();
await page.getByTestId("ri-source-summary").waitFor();
check(JSON.stringify(db.riSources[0].profile_rules) === JSON.stringify({ __cnpj__: "lojista" }), `regra salva (${JSON.stringify(db.riSources[0].profile_rules)})`);
check(clean(await page.getByTestId("ri-rules-summary").innerText()).includes("CNPJ com 14 números → Lojista"), "resumo da configuração mostra a regra do CNPJ");

await page.getByRole("button", { name: "Atualizar agora" }).click();
await page.getByRole("button", { name: "Visão geral", exact: true }).click();
await page.getByTestId("ri-overview").waitFor();
await page.waitForFunction(() => document.querySelector("[data-testid=ri-card-lojista] [data-testid=ri-kpi-value]")?.textContent?.trim() === "2", null, { timeout: 8000 }).catch(() => {});
check(await kpi(page, "ri-card-lojista") === "2", "2 CNPJs válidos = 2 lojistas");
check(await kpi(page, "ri-card-nao_identificado") === "3", "vazio, CPF e \"não tenho\" = 3 não identificados");
const stored = JSON.stringify(db.riSnapshots[db.riSources[0].id].rows);
check(!/12\.345\.678|12345678000190|98765432000110|456\.789|não tenho/.test(stored), "o número do CNPJ não fica guardado");

// Desmarcar volta ao jeito normal (regras por valor)
await page.getByRole("button", { name: "Planilha", exact: true }).click();
await page.getByRole("button", { name: "Editar configuração" }).click();
await page.getByTestId("ri-setup").waitFor();
check(await page.getByTestId("ri-step-3").getByTestId("ri-cnpj-mode").isChecked(), "editar mantém a opção CNPJ marcada");
await page.getByTestId("ri-step-3").getByTestId("ri-cnpj-mode").uncheck();
check(await page.getByTestId("ri-step-3").getByRole("button", { name: "Ler os valores da coluna SQL" }).count() === 1, "desmarcada: volta às regras por valor");
await page.getByRole("button", { name: "Cancelar" }).click();
await page.getByTestId("ri-source-summary").waitFor();
check(JSON.stringify(db.riSources[0].profile_rules) === JSON.stringify({ __cnpj__: "lojista" }), "cancelar não muda nada");
check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();

// Correção (22/10/2026): planilha já configurada com a coluna CNPJ no SQL, mas com as regras antigas.
// Ao editar, a opção já abre marcada; salvar grava a regra do CNPJ.
{
  const { browser: b2, page: p2, errors: e2 } = await launch();
  const db2 = await mockSupabase(p2, { role: "admin" });
  seed(db2);
  const now = new Date().toISOString();
  db2.riSources.push({ id: "51ee0000-0000-4000-8000-000000004102", client_id: CLI, spreadsheet_id: SHEET, spreadsheet_title: "Leads Atacado", sheet_name: "Leads",
    header_row: 1, mapping: { profile: "CNPJ:", contact_date: "Data:", contact_key: "Número:" }, profile_rules: { lojista: "lojista", "sacoleiro(a)": "sacoleiro" },
    enabled: true, read_status: "ok", last_attempt_at: now, last_success_at: now, last_error: null, consecutive_failures: 0, created_at: now, updated_at: now });
  await login(p2, `/inteligencia-resultados?cliente=${CLI}&aba=planilha`);
  await p2.getByRole("button", { name: "Editar configuração" }).click();
  await p2.getByTestId("ri-setup").waitFor();
  check(await p2.getByTestId("ri-step-3").getByTestId("ri-cnpj-mode").isChecked(), "planilha antiga com coluna CNPJ: ao editar, a opção já vem marcada");
  await p2.getByRole("button", { name: "Salvar configuração" }).click();
  await p2.getByTestId("ri-source-summary").waitFor();
  check(JSON.stringify(db2.riSources[0].profile_rules) === JSON.stringify({ __cnpj__: "lojista" }), "salvar troca as regras antigas pela regra do CNPJ");
  check(e2.length === 0, "sem erros no navegador (edição)");
  await b2.close();
}
console.log("Modo CNPJ da Inteligência de Resultados: tudo certo.");
