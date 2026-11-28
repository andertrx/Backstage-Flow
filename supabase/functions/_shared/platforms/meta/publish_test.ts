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
  assert(got.get(2)?.errorMessage?.includes("não foi enviado ao Meta"));
  assert(!m.calls.some((c) => c.endsWith("/adcreatives")));
});

Deno.test("conversa no WhatsApp: destino e página no conjunto; criativo com botão do WhatsApp, sem link do site", () => {
  const d = draft();
  d.adSets[0].optimizationGoal = "CONVERSATIONS";
  d.adSets[0].destinationType = "WHATSAPP";
  const f = adSetFields(d.adSets[0], "C1", ctx(d));
  assertEquals(f.destination_type, "WHATSAPP");
  assertEquals(JSON.parse(f.promoted_object), { page_id: "111" });
  const l = JSON.parse(creativeFields(d.ads[0], "H", "WHATSAPP").object_story_spec).link_data;
  assertEquals(l.call_to_action, { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } });
  assertEquals(l.link, "https://fb.me/");
  assertEquals(JSON.parse(creativeFields(d.ads[0], "H", "MESSENGER").object_story_spec).link_data.call_to_action.type, "MESSAGE_PAGE");
  assertEquals(JSON.parse(creativeFields(d.ads[0], "H", "INSTAGRAM_DIRECT").object_story_spec).link_data.call_to_action.value.app_destination, "INSTAGRAM_DIRECT");
});

Deno.test("formulário no anúncio: destino ON_AD, botão que abre o formulário e o ID dele", () => {
  const d = draft();
  d.adSets[0].optimizationGoal = "LEAD_GENERATION";
  d.adSets[0].destinationType = "ON_AD";
  d.ads[0].leadFormId = "123456789012";
  d.ads[0].cta = "SIGN_UP";
  assertEquals(adSetFields(d.adSets[0], "C1", ctx(d)).destination_type, "ON_AD");
  const l = JSON.parse(creativeFields(d.ads[0], "H", "ON_AD").object_story_spec).link_data;
  assertEquals(l.call_to_action, { type: "SIGN_UP", value: { lead_gen_form_id: "123456789012" } });
  d.ads[0].cta = "WHATSAPP_MESSAGE";
  assertEquals(JSON.parse(creativeFields(d.ads[0], "H", "ON_AD").object_story_spec).link_data.call_to_action.type, "SIGN_UP");
});

Deno.test("público: cidades (com raio em km) substituem o país; interesses viram flexible_spec; Advantage+ liga só quando escolhido", () => {
  const d = draft();
  d.adSets[0] = { ...d.adSets[0], audienceIds: [], interests: [{ id: "6003", name: "Academia" }], cities: [{ key: "2673660", name: "Fortaleza", radius: 25 }], advantageAudience: true };
  const t = JSON.parse(adSetFields(d.adSets[0], "C1", ctx(d)).targeting);
  assertEquals(t.geo_locations, { cities: [{ key: "2673660", radius: 25, distance_unit: "kilometer" }] });
  assertEquals(t.flexible_spec, [{ interests: [{ id: "6003", name: "Academia" }] }]);
  assertEquals(t.targeting_automation, { advantage_audience: 1 });
  d.adSets[0] = { ...d.adSets[0], interests: [], cities: [], advantageAudience: false };
  const u = JSON.parse(adSetFields(d.adSets[0], "C1", ctx(d)).targeting);
  assertEquals(u.geo_locations, { countries: d.adSets[0].countries });
  assertEquals(u.flexible_spec, undefined);
  assertEquals(u.targeting_automation, { advantage_audience: 0 });
});

Deno.test("público: interesses junto de um público salvo que já tem interesses é recusado com mensagem clara", () => {
  const d = draft();
  d.adSets[0] = { ...d.adSets[0], audienceIds: ["9002"], interests: [{ id: "6003", name: "Academia" }] };
  const c = ctx(d);
  c.audiences.saved.set("9002", { flexible_spec: [{ interests: [{ id: "1" }] }] });
  let msg = "";
  try { adSetFields(d.adSets[0], "C1", c); } catch (e) { msg = (e as Error).message; }
  assert(msg.includes("já tem interesses"));
});

Deno.test("criativo de vídeo: video_data com id do vídeo, miniatura do Meta e botão do destino (site, mensagem e formulário)", () => {
  const a = newAd("s1", { id: "a1", name: "Reels", pageId: "111", primaryText: "Oferta", headline: "Compre", link: "https://loja.com.br", cta: "SHOP_NOW" });
  const vid = { id: "vid1", thumbnail: "https://scontent/x.jpg" };
  const site = JSON.parse(creativeFields(a, undefined, "", vid).object_story_spec);
  assertEquals(site.link_data, undefined);
  assertEquals(site.video_data, { video_id: "vid1", image_url: "https://scontent/x.jpg", message: "Oferta", title: "Compre", call_to_action: { type: "SHOP_NOW", value: { link: "https://loja.com.br" } } });
  const zap = JSON.parse(creativeFields(a, undefined, "WHATSAPP", vid).object_story_spec);
  assertEquals(zap.video_data.call_to_action, { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } });
  const form = JSON.parse(creativeFields({ ...a, leadFormId: "555566" }, undefined, "ON_AD", vid).object_story_spec);
  assertEquals(form.video_data.call_to_action, { type: "SIGN_UP", value: { lead_gen_form_id: "555566" } });
});

Deno.test("publicar com vídeo: o criativo usa o vídeo enviado e não pede hash de imagem", async () => {
  const d = draft();
  d.ads[0] = { ...d.ads[0], driveFileId: "videoUm12345678", driveKind: "video", imageUrl: "" };
  const c = ctx(d);
  c.videos = new Map([["videoUm12345678", { id: "vid1", thumbnail: "https://scontent/x.jpg" }]]);
  const sent: Record<string, string>[] = [];
  const deps = {
    post: (path: string, f: Record<string, string>) => { sent.push({ path, ...f }); return Promise.resolve({ status: 200, body: { id: `id${sent.length}` } }); },
    get: (id: string) => Promise.resolve({ id, status: "PAUSED", effective_status: "PAUSED" }),
  };
  const out = await runPublish(deps, c, () => Promise.resolve());
  assertEquals(out, "concluida");
  const cr = sent.find((x) => x.path.endsWith("/adcreatives"))!;
  assert(JSON.parse(cr.object_story_spec).video_data.video_id === "vid1");
});
