import { assert, assertEquals } from "jsr:@std/assert@1";
import { newAd, newAdSet, newDraft, type CampaignDraft } from "../../../../../packages/shared/src/campaign-builder/model.ts";
import { adFields, adSetFields, buildPlan, campaignFields, creativeFields, type ItemResult, type PublishCtx, runPublish, zonedIso } from "./publish.ts";

function draft(): CampaignDraft {
  const d = newDraft();
  d.campaign = { ...d.campaign, name: "Black Friday", objective: "OUTCOME_TRAFFIC", status: "PAUSED", budgetLevel: "adset", budgetType: "daily" };
  const s = newAdSet({ id: "s1", name: "Brasil 25-45", optimizationGoal: "LINK_CLICKS", billingEvent: "IMPRESSIONS", budgetAmount: 50, ageMin: 25, ageMax: 45, gender: "female" });
  d.adSets = [s];
  d.ads = [newAd("s1", { id: "a1", name: "Anúncio 1", pageId: "111", instagramId: "222", primaryText: "Oferta", headline: "Compre", link: "https://loja.com.br", imageUrl: "https://loja.com.br/i.jpg", cta: "SHOP_NOW" })];
  return d;
}
const ctx = (d: CampaignDraft): PublishCtx => ({ externalId: "123", currency: "BRL", timezone: "America/Sao_Paulo", draft: d, audiences: { custom: new Set(["9001"]), saved: new Map([["9002", { interests: [{ id: "1" }] }]]) } });

Deno.test("plano: campanha, conjuntos, e criativo+anúncio de cada anúncio, em ordem", () => {
  const p = buildPlan(draft());
  assertEquals(p.map((x) => x.kind), ["campanha", "conjunto", "criativo", "anuncio"]);
  assertEquals(p.map((x) => x.position), [0, 1, 2, 3]);
});

Deno.test("fuso: o horário sai com o deslocamento do fuso da conta", () => {
  assertEquals(zonedIso("2026-12-01", "00:00:00", "America/Sao_Paulo"), "2026-12-01T00:00:00-03:00");
  assertEquals(zonedIso("2026-12-01", "23:59:59", "UTC"), "2026-12-01T23:59:59+00:00");
});

Deno.test("campos: tudo PAUSADO; orçamento do conjunto em centavos; público e segmentação certos", () => {
  const d = draft();
  assertEquals(campaignFields(d, "BRL").status, "PAUSED");
  assertEquals(campaignFields(d, "BRL").is_adset_budget_sharing_enabled, "false");
  d.adSets[0].audienceIds = ["9001"];
  d.adSets[0].startDate = "2026-12-01";
  const f = adSetFields(d.adSets[0], "C1", ctx(d));
  assertEquals(f.status, "PAUSED");
  assertEquals(f.daily_budget, "5000");
  assertEquals(f.start_time, "2026-12-01T00:00:00-03:00");
  const t = JSON.parse(f.targeting);
  assertEquals(t.genders, [2]);
  assertEquals(t.custom_audiences, [{ id: "9001" }]);
  assertEquals(t.geo_locations, { countries: ["BR"] });
  assertEquals(t.targeting_automation, { advantage_audience: 0 });
  const cr = JSON.parse(creativeFields(d.ads[0]).object_story_spec);
  assertEquals(cr.page_id, "111");
  assertEquals(cr.instagram_user_id, "222");
  assertEquals(cr.link_data.picture, "https://loja.com.br/i.jpg");
  assertEquals(cr.link_data.call_to_action, { type: "SHOP_NOW", value: { link: "https://loja.com.br" } });
  assertEquals(adFields(d.ads[0], "S1", "CR1").status, "PAUSED");
});

Deno.test("público salvo vira a segmentação base; dois salvos ou público que sumiu é recusado antes de falar com o Meta", () => {
  const d = draft();
  d.adSets[0].audienceIds = ["9002"];
  const t = JSON.parse(adSetFields(d.adSets[0], "C1", ctx(d)).targeting);
  assertEquals(t.interests, [{ id: "1" }]);
  d.adSets[0].audienceIds = ["9999"];
  let msg = "";
  try { adSetFields(d.adSets[0], "C1", ctx(d)); } catch (e) { msg = (e as Error).message; }
  assert(msg.includes("não existe mais"));
});

function fakeMeta(failAt?: string) {
  const calls: string[] = [];
  let n = 0;
  return {
    calls,
    deps: {
      post: (path: string) => {
        calls.push(`POST ${path}`);
        if (failAt && path.endsWith(failAt)) return Promise.resolve({ status: 400, body: { error: { message: "Invalid parameter", code: 100, error_user_title: "Meta inválida", error_user_msg: "Escolha outra." } } });
        return Promise.resolve({ status: 200, body: { id: String(++n * 1000) } });
      },
      get: (id: string) => { calls.push(`GET ${id}`); return Promise.resolve({ id, name: "x", status: "PAUSED", effective_status: "PAUSED" }); },
    },
  };
}

Deno.test("publicar: cria na ordem certa, usa os IDs devolvidos, relê e confirma tudo", async () => {
  const m = fakeMeta();
  const got = new Map<number, ItemResult>();
  const out = await runPublish(m.deps, ctx(draft()), (pos, r) => { got.set(pos, { ...(got.get(pos) ?? {}), ...r }); return Promise.resolve(); });
  assertEquals(out, "concluida");
  assertEquals(m.calls.filter((c) => c.startsWith("POST")), ["POST act_123/campaigns", "POST act_123/adsets", "POST act_123/adcreatives", "POST act_123/ads"]);
  assertEquals([...got.values()].every((r) => r.status === "criado" && r.confirmed === true), true);
  assertEquals(got.get(0)?.metaId, "1000");
});

Deno.test("publicar: erro no conjunto → para ali, o resto fica 'pulado', o que já foi criado fica registrado (parcial)", async () => {
  const m = fakeMeta("/adsets");
  const got = new Map<number, ItemResult>();
  const out = await runPublish(m.deps, ctx(draft()), (pos, r) => { got.set(pos, { ...(got.get(pos) ?? {}), ...r }); return Promise.resolve(); });
  assertEquals(out, "parcial");
  assertEquals(got.get(0)?.status, "criado");
  assertEquals(got.get(1)?.status, "falhou");
  assertEquals(got.get(1)?.errorMessage, "Meta inválida: Escolha outra.");
  assertEquals(got.get(2)?.status, "pulado");
  assertEquals(got.get(3)?.status, "pulado");
  assert(!m.calls.some((c) => c.endsWith("/adcreatives") || c.endsWith("/ads")), "não tenta criar o que depende do que falhou");
});

Deno.test("publicar: erro já na campanha → falhou, nada criado", async () => {
  const m = fakeMeta("/campaigns");
  const out = await runPublish(m.deps, ctx(draft()), () => Promise.resolve());
  assertEquals(out, "falhou");
  assertEquals(m.calls.length, 1);
});

Deno.test("criativo: imagem do Drive usa image_hash (sem picture); sem Drive usa o endereço", () => {
  const d = draft();
  const comHash = JSON.parse(creativeFields(d.ads[0], "HASH1").object_story_spec).link_data;
  assertEquals(comHash.image_hash, "HASH1");
  assertEquals(comHash.picture, undefined);
  const semHash = JSON.parse(creativeFields(d.ads[0]).object_story_spec).link_data;
  assertEquals(semHash.picture, "https://loja.com.br/i.jpg");
});

Deno.test("publicar: anúncio com imagem do Drive sem hash enviado falha ANTES de falar com o Meta (nada de criativo sem imagem)", async () => {
  const d = draft();
  d.ads[0].driveFileId = "drive-file-1234";
  const m = fakeMeta();
  const got = new Map<number, ItemResult>();
  const out = await runPublish(m.deps, ctx(d), (pos, r) => { got.set(pos, { ...(got.get(pos) ?? {}), ...r }); return Promise.resolve(); });
  assertEquals(out, "parcial");
  assertEquals(got.get(2)?.status, "falhou");
  assert(got.get(2)?.errorMessage?.includes("não foi enviada ao Meta"));
  assert(!m.calls.some((c) => c.endsWith("/adcreatives")));
});
