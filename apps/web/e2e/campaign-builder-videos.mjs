/**
 * Fase J.6 — vídeos grandes no Criar campanha: o vídeo do Drive vai antes, em partes, e o Publicar reaproveita.
 * Supabase e Meta simulados. Nada é criado no Meta de verdade.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const CLIENT = { id: "55555555-5555-4555-8555-555555555555", name: "Vonks", company: null, cnpj: null, owner_name: null, phone: null, email: null,
  notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-24T12:00:00Z", updated_at: "", created_by: null, excluded_at: null };
const ACCOUNT = { id: "a0000000-0000-4000-8000-000000000001", platform_id: "meta", external_id: "1238140437148137", client_id: CLIENT.id, connection_id: null, name: "CA - Vonks",
  currency: "BRL", timezone: "America/Sao_Paulo", status: "ativa", raw_status: "account_status=1", status_reason: null, business_name: "BM - Vonks", is_prepay: null,
  manager_customer_id: null, is_test_account: null, linked_at: "2026-09-25T00:00:00Z", details_updated_at: "2026-09-25T00:00:00Z", unlinked_at: null, assets: [] };
const data = {
  schema: 1,
  campaign: { name: "Black | Vídeo grande", objective: "OUTCOME_TRAFFIC", status: "PAUSED", specialAdCategories: [], budgetLevel: "adset", budgetType: "daily", budgetAmount: null },
  adSets: [{ id: "s1", name: "CJ-01 | Brasil", optimizationGoal: "LINK_CLICKS", billingEvent: "IMPRESSIONS", budgetAmount: 50, countries: ["BR"], ageMin: 18, ageMax: 65, gender: "all" }],
  ads: [
    { id: "a1", adSetId: "s1", name: "[AD-01] REELS", pageId: "328104960376244", instagramId: "17841402908048736", primaryText: "Revenda moda masculina", headline: "Atacado",
      link: "https://loja.com.br", cta: "LEARN_MORE", driveFileId: "videoGrande123456", driveFileName: "REELS-01_9x16.mp4", driveKind: "video" },
    { id: "a2", adSetId: "s1", name: "[AD-02] REELS", pageId: "328104960376244", instagramId: "17841402908048736", primaryText: "Outro texto", headline: "Atacado",
      link: "https://loja.com.br", cta: "LEARN_MORE", driveFileId: "videoGrande123456", driveFileName: "REELS-01_9x16.mp4", driveKind: "video" },
  ],
  advancedJson: "",
};
const draft = { id: "d0000000-0000-4000-8000-000000000006", client_id: CLIENT.id, ad_account_id: ACCOUNT.id, name: "Vídeo grande", data, version: 1,
  archived_at: null, created_by: null, updated_by: null, created_at: "2026-11-28T10:00:00Z", updated_at: "2026-11-28T10:00:00Z" };

const { browser, page, errors } = await launch();
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ ...CLIENT });
db.adAccounts.push({ ...ACCOUNT });
db.builderDrafts.push(draft);

await login(page, `/criar-campanhas/${draft.id}`);
const publicar = page.getByRole("button", { name: /Publicar no Meta/ });
await publicar.waitFor();
check(await publicar.isDisabled(), "Publicar fica travado enquanto o vídeo não foi enviado");
check(await page.getByTestId("cb-videos-pendentes").isVisible(), "explica que falta enviar o vídeo");
check((await page.getByTestId("cb-enviar-videos").innerText()).includes("1 vídeo(s)"), "o mesmo vídeo em dois anúncios conta uma vez só");

// Erro no meio: a tela explica e o próximo clique continua de onde parou.
db.metaBuilder.uploadFailOnce = "videoGrande123456";
await page.getByTestId("cb-enviar-videos").click();
await page.getByText("O Meta recusou uma parte do vídeo.", { exact: false }).waitFor({ timeout: 8000 });
check(await page.getByText("Clique de novo para continuar de onde parou", { exact: false }).isVisible(), "erro no meio explica que dá para continuar");
await page.getByTestId("cb-checklist").screenshot({ path: `${SHOTS}/35-17-videos-no-criador.png` });
await page.getByTestId("cb-enviar-videos").click();
await page.getByTestId("cb-videos-prontos").waitFor({ timeout: 10000 });
check(db.metaBuilder.uploads.videoGrande123456.sent === 120 * 1024 * 1024, "o vídeo de 120 MB terminou de ir em partes");
check((db.metaBuilder.prepared ?? []).length === 1, "enviado uma vez só");
check(await publicar.isEnabled(), "com o vídeo no Meta, o Publicar libera");
check((await page.getByTestId("cb-videos-pendentes").count()) === 0, "o aviso some");

await publicar.click();
await page.getByTestId("confirm-ok").click();
await page.getByTestId("confirm-ok").click();
await page.getByTestId("cb-publicacao-status").waitFor({ timeout: 8000 });
check((await page.getByTestId("cb-publicacao-status").textContent()) === "Publicada (pausada)", "publicou tudo pausado");

check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
await browser.close();
console.log("campaign-builder-videos: ok");
