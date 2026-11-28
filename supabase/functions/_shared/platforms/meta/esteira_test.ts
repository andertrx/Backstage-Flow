import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { type EsteiraDraft, newEsteira, newEsteiraItem, toMedia } from "../../../../../packages/shared/src/campaign-builder/esteira.ts";
import { esteiraCreativeFields, runEsteira, templateFromCreative, WHATSAPP_LINK } from "./esteira.ts";
import type { ItemResult } from "./publish.ts";

const video = (id: string, name: string, metaId: string) => ({ ...toMedia({ id: `${id}xxxxxxxxxx`, name, kind: "video", width: null, height: null }), metaVideoId: metaId, metaThumb: `https://cdn/${metaId}.jpg` });

function draft(): EsteiraDraft {
  const d = newEsteira();
  d.target = { adSetId: "555", adSetName: "CJ-03", campaignId: "444", campaignName: "CP-7.6", destinationType: "WHATSAPP" };
  d.pageId = "328104960376244";
  d.instagramId = "17841402908048736";
  d.items = [newEsteiraItem(d, { id: "i1", name: "OFERTA-01", feed: video("a", "OFERTA-01_4x5.mp4", "111"), vertical: video("b", "OFERTA-01_9x16.mp4", "222"), bodies: ["T1", "T2", "T3"], titles: ["H1", "H2", "H3"] })];
  return d;
}

Deno.test("esteira: dois vídeos + 3 textos/3 títulos viram um criativo com regras por posicionamento (formato do anúncio real da Vonks)", () => {
  const f = esteiraCreativeFields(draft(), draft().items[0], ["facebook", "instagram"]);
  assertEquals(JSON.parse(f.object_story_spec), { page_id: "328104960376244", instagram_user_id: "17841402908048736" });
  const s = JSON.parse(f.asset_feed_spec);
  assertEquals(s.optimization_type, "PLACEMENT");
  assertEquals(s.ad_formats, ["SINGLE_VIDEO"]);
  assertEquals(s.videos.map((v: { video_id: string }) => v.video_id), ["222", "111"]);
  assertEquals(s.bodies.length, 3);
  assertEquals(s.titles.length, 3);
  assertEquals(s.call_to_action_types, ["WHATSAPP_MESSAGE"]);
  assertEquals(s.link_urls[0].website_url, WHATSAPP_LINK);
  const [r1, r2] = s.asset_customization_rules;
  assertEquals(r1.customization_spec.instagram_positions, ["story", "reels"]);
  assertEquals(r1.customization_spec.facebook_positions, ["story", "facebook_reels"]);
  assertEquals(r1.video_label.name, "bf_m_vertical");
  assertEquals(r2.customization_spec, { publisher_platforms: ["facebook", "instagram"] });
  assertEquals(r2.video_label.name, "bf_m_resto");
  // Cada texto vale nas duas regras.
  assertEquals(s.bodies[0].adlabels.map((l: { name: string }) => l.name), ["bf_vertical_texto", "bf_resto_texto"]);
  assertEquals(r1.body_label.name, "bf_vertical_texto");
  // Controle total: melhorias desligadas e sem anúncios de vários anunciantes.
  assert(JSON.parse(f.degrees_of_freedom_spec).creative_features_spec.inline_comment.enroll_status === "OPT_OUT");
  assertEquals(JSON.parse(f.contextual_multi_ads), { enroll_status: "OPT_OUT" });
});

Deno.test("esteira: um vídeo + vários textos = video_data + várias opções de texto (DEGREES_OF_FREEDOM)", () => {
  const d = draft();
  d.items[0].vertical = null;
  const f = esteiraCreativeFields(d, d.items[0]);
  const story = JSON.parse(f.object_story_spec);
  assertEquals(story.video_data.video_id, "111");
  assertEquals(story.video_data.message, "T1");
  assertEquals(story.video_data.call_to_action, { type: "WHATSAPP_MESSAGE", value: { link: WHATSAPP_LINK } });
  const s = JSON.parse(f.asset_feed_spec);
  assertEquals(s.optimization_type, "DEGREES_OF_FREEDOM");
  assertEquals(s.bodies.map((b: { text: string }) => b.text), ["T1", "T2", "T3"]);
});

Deno.test("esteira: um texto só não manda asset_feed_spec; site usa o link e o botão escolhidos", () => {
  const d = draft();
  d.target!.destinationType = "WEBSITE";
  d.link = "https://loja.com.br";
  d.cta = "SHOP_NOW";
  d.items[0] = { ...d.items[0], vertical: null, feed: { ...toMedia({ id: "imgxxxxxxxxxx", name: "a.jpg", kind: "image", width: 1, height: 1 }), metaHash: "abcdef1234" }, bodies: ["Só um"], titles: ["Um"] };
  const f = esteiraCreativeFields(d, d.items[0]);
  assertEquals(f.asset_feed_spec, undefined);
  const l = JSON.parse(f.object_story_spec).link_data;
  assertEquals(l.image_hash, "abcdef1234");
  assertEquals(l.link, "https://loja.com.br");
  assertEquals(l.call_to_action, { type: "SHOP_NOW", value: { link: "https://loja.com.br" } });
});

Deno.test("esteira: arquivo ainda não enviado ao Meta não monta", async () => {
  const d = draft();
  d.items[0].feed!.metaVideoId = "";
  let msg = "";
  try { esteiraCreativeFields(d, d.items[0]); } catch (e) { msg = (e as Error).message; }
  assert(/ainda não foi enviado/.test(msg));
  await assertRejects(() => runEsteira({ post: () => Promise.reject(new Error("x")), get: () => Promise.resolve({}) }, { externalId: "1", draft: { ...d, target: null }, adSetPlatforms: [] }, async () => {}));
});

Deno.test("esteira: cria criativo → anúncio PAUSADO no conjunto escolhido, relê e para no primeiro erro", async () => {
  const d = draft();
  d.items.push(newEsteiraItem(d, { id: "i2", name: "OFERTA-02", feed: video("c", "OFERTA-02.mp4", "333"), bodies: ["X"] }));
  const posts: { path: string; fields: Record<string, string> }[] = [];
  let n = 0;
  const results = new Map<number, ItemResult>();
  const outcome = await runEsteira({
    post: (path, fields) => {
      posts.push({ path, fields });
      n++;
      if (n === 3) return Promise.resolve({ status: 400, body: { error: { message: "Recusado", code: 100 } } });
      return Promise.resolve({ status: 200, body: { id: `M${n}` } });
    },
    get: (id) => Promise.resolve({ id, status: "PAUSED", effective_status: "PAUSED", degrees_of_freedom_spec: { creative_features_spec: { inline_comment: { enroll_status: "OPT_OUT" } } } }),
  }, { externalId: "act_99", draft: d, adSetPlatforms: [] }, async (p, r) => { results.set(p, r); });
  assertEquals(outcome, "parcial");
  assertEquals(posts.map((p) => p.path), ["act_99/adcreatives", "act_99/ads", "act_99/adcreatives"]);
  assertEquals(posts[1].fields.adset_id, "555");
  assertEquals(posts[1].fields.status, "PAUSED");
  assertEquals(JSON.parse(posts[1].fields.creative), { creative_id: "M1" });
  assertEquals(results.get(2)?.status, "falhou");
  assertEquals(results.get(3)?.status, "pulado");
  assertEquals(results.get(0)?.automations, { kind: "criativo", ligadas: [] });
  assertEquals(results.get(1)?.confirmed, true);
});

Deno.test("anúncio-modelo: lê textos, títulos, página, Instagram, link e botão do criativo existente", () => {
  const t = templateFromCreative({
    object_story_spec: { page_id: "1", instagram_user_id: "2", video_data: { message: "A", call_to_action: { type: "WHATSAPP_MESSAGE", value: { link: WHATSAPP_LINK } } } },
    asset_feed_spec: { bodies: [{ text: "A" }, { text: "B" }], titles: [{ text: "H" }] },
    url_tags: "utm_source=meta",
  });
  assertEquals(t, { pageId: "1", instagramId: "2", bodies: ["A", "B"], titles: ["H"], description: "", link: WHATSAPP_LINK, cta: "WHATSAPP_MESSAGE", urlTags: "utm_source=meta" });
});
