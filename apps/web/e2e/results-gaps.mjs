/**
 * Teste de navegador da correção de 21/10/2026 — Inteligência de Resultados:
 * 1) ID do Meta colado nas colunas de NOME (utm_campaign/utm_term/utm_content) liga à campanha,
 *    ao conjunto e ao anúncio;
 * 2) aviso "N lojistas sem campanha preenchida na planilha" e "com campanha que o CRM não ligou",
 *    com o atalho para ver as linhas.
 * Supabase SIMULADO (support.mjs).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLI = "e0000000-0000-4000-8000-000000004001";
const SOURCE = "51ee0000-0000-4000-8000-000000000401";
const ACC = "acc00000-0000-4000-8000-000000004001";
const id = (n) => `c0000000-0000-4000-8000-0000000401${String(n).padStart(2, "0")}`;
const sp = (daysAgo) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - daysAgo * 86_400_000));
const [D2, D3] = [sp(2), sp(3)];
const [CID, SID, AID] = ["120249035297520625", "120249035297560625", "120249035297490625"];

function seed(db) {
  db.clients.push({ id: CLI, name: "Vonks Teste", company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-01-01T00:00:00Z", updated_at: "", created_by: null });
  db.campaigns.push({ id: id(1), ad_account_id: ACC, client_id: CLI, platform_id: "meta", external_id: CID, name: "STG | CP-7.4 | FORM | SITE", status: "ativa", objective: "OUTCOME_LEADS" });
  db.adGroups.push({ id: id(11), campaign_id: id(1), ad_account_id: ACC, client_id: CLI, platform_id: "meta", external_id: SID, name: "CJ-01 | ATACADO", status: "ativa" });
  db.ads.push({ id: id(21), ad_group_id: id(11), campaign_id: id(1), ad_account_id: ACC, client_id: CLI, platform_id: "meta", external_id: AID, name: "[AD-04] Video", status: "ativa" });
  db.sheetsKey = { type: "service_account", client_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com" };
  Object.assign(db.sheetsSettings, { service_account_email: "crm-leitura@backstage-teste.iam.gserviceaccount.com", has_key: true });
  const now = new Date().toISOString();
  db.riSources.push({ id: SOURCE, client_id: CLI, spreadsheet_id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", spreadsheet_title: "Vonks - SQL", sheet_name: "Lojistas", header_row: 1,
    mapping: { profile: "Você é:", campaign_name: "utm_campaign", adset_name: "utm_term", ad_name: "utm_content" },
    profile_rules: { lojista: "lojista", sacoleiro: "sacoleiro", "consumidor final": "consumidor_final" }, enabled: true,
    read_status: "ok", last_attempt_at: now, last_success_at: now, last_error: null, consecutive_failures: 0, created_at: now, updated_at: now });
  const r = (n, h, d, p, extra = {}) => ({ n, k: `L${n}`, h, d, p, ...extra });
  const ids = { cn: CID, sn: SID, an: AID };
  db.riSnapshots[SOURCE] = { read_at: now, trigger: "agendada", row_count: 7, stats: { total: 7 }, rows: [
    r(2, "h1", D2, "lojista", ids),
    r(3, "h2", D3, "lojista", ids),
    r(4, "h3", D2, "lojista"),
    r(5, "h4", D3, "lojista", { an: "link_in_bio" }),
    r(6, "h5", D2, "lojista", { cn: "Campanha com nome antigo" }),
    r(7, "h6", D2, "sacoleiro", ids),
    r(8, "h7", D3, "consumidor final", ids),
  ] };
}

const clean = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const kpi = async (page, testid) => clean(await page.getByTestId(testid).getByTestId("ri-kpi-value").innerText());

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
seed(db);
await login(page, `/inteligencia-resultados?cliente=${CLI}&aba=lojista`);
await page.getByTestId("ri-tab-lojista").waitFor();
check(await kpi(page, "ri-profile-total") === "5", "5 lojistas na planilha (a conta bate com as linhas)");
await page.getByTestId("ri-level-ad").getByTestId("ri-ranking-row").first().waitFor();
const camp = (await page.getByTestId("ri-level-campaign").getByTestId("ri-ranking-row").allInnerTexts()).map(clean);
check(camp.length === 1 && camp[0].includes("STG | CP-7.4 | FORM | SITE") && / 2 /.test(camp[0]), `ID na coluna utm_campaign liga à campanha (${camp.join(" | ")})`);
const set = clean(await page.getByTestId("ri-level-ad_group").getByTestId("ri-ranking-row").first().innerText());
check(set.includes("CJ-01 | ATACADO"), "ID na coluna utm_term liga ao conjunto");
const ad = clean(await page.getByTestId("ri-level-ad").getByTestId("ri-ranking-row").first().innerText());
check(ad.includes("[AD-04] Video") && ad.includes("STG | CP-7.4 | FORM | SITE › CJ-01 | ATACADO"), "ID na coluna utm_content liga ao criativo");

const gaps = page.getByTestId("ri-campaign-gaps");
const gapText = clean(await gaps.innerText());
check(gapText.includes("2 lojistas sem campanha preenchida na planilha"), `aviso: lojistas sem campanha (${gapText})`);
check(gapText.includes("1 lojistas com campanha preenchida, mas que o CRM não conseguiu ligar"), "aviso: campanha preenchida que o CRM não ligou");
check(!gapText.includes("sacoleiro"), "aviso só do perfil da aba");
await page.screenshot({ path: `${SHOTS}/39.8-aviso-sem-campanha.png`, fullPage: true });

await gaps.getByRole("button", { name: "Ver linhas" }).first().click();
const modal = page.getByTestId("ri-records");
await modal.getByTestId("ri-records-rows").waitFor();
check(clean(await modal.getByTestId("ri-records-count").innerText()).includes("de 2 linha(s)"), "ver linhas: as 2 linhas sem campanha");
check((await modal.getByTestId("ri-records-rows").locator("tr").allInnerTexts()).every((t) => /^\s*[45]\s/.test(t)), "ver linhas: linhas 4 e 5 da planilha");
await page.keyboard.press("Escape");

// Visão geral: o aviso mostra cada perfil
await page.goto(`${BASE}/inteligencia-resultados?cliente=${CLI}`);
await page.getByTestId("ri-overview").waitFor();
const all = clean(await page.getByTestId("ri-campaign-gaps").innerText());
check(all.includes("2 lojistas sem campanha") && !all.includes("sacoleiros sem"), "visão geral: aviso por perfil (só quem tem problema)");
check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
await browser.close();
console.log(`Correção da conta (IDs nas colunas de nome + aviso sem campanha): tudo certo (${BASE}).`);
