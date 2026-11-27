import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildCampaignFields, currencyOffset, fetchAccountLists, uploadAdImage, validateCampaign } from "./builder.ts";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.test("moeda: BRL em centavos; JPY sem centavos", () => {
  assertEquals(currencyOffset("BRL"), 100);
  assertEquals(currencyOffset("jpy"), 1);
});

Deno.test("campanha: orçamento na campanha vira centavos e usa o menor custo; sem orçamento avisa que não é compartilhado", () => {
  const base = { name: "Teste", objective: "OUTCOME_TRAFFIC", specialAdCategories: [] as string[], budgetType: "daily" as const };
  const a = buildCampaignFields({ ...base, budgetLevel: "campaign", budgetAmount: 50.5 }, "BRL", "PAUSED");
  assertEquals(a.daily_budget, "5050");
  assertEquals(a.bid_strategy, "LOWEST_COST_WITHOUT_CAP");
  assertEquals(a.status, "PAUSED");
  assertEquals(a.special_ad_categories, "[]");
  const b = buildCampaignFields({ ...base, budgetLevel: "adset", budgetAmount: 50 }, "BRL", "PAUSED");
  assertEquals(b.daily_budget, undefined);
  assertEquals(b.is_adset_budget_sharing_enabled, "false");
  const c = buildCampaignFields({ ...base, budgetLevel: "campaign", budgetType: "lifetime", budgetAmount: 1000 }, "JPY", "PAUSED");
  assertEquals(c.lifetime_budget, "1000");
});

Deno.test("validar: manda validate_only, status PAUSED e o token só no corpo; sucesso do Meta vira ok", async () => {
  let seen: { url: string; body: string } | null = null;
  const f = ((url: URL, init: RequestInit) => { seen = { url: String(url), body: String(init.body) }; return Promise.resolve(reply(200, { success: true })); }) as unknown as typeof fetch;
  const r = await validateCampaign("TOKEN-SECRETO", "123", buildCampaignFields({ name: "X", objective: "OUTCOME_TRAFFIC", specialAdCategories: [], budgetLevel: "adset", budgetType: "daily", budgetAmount: null }, "BRL", "PAUSED"), f);
  assertEquals(r.ok, true);
  assert(seen!.url.includes("/act_123/campaigns"));
  assert(!seen!.url.includes("TOKEN-SECRETO"), "o token não pode ir na URL");
  assert(seen!.body.includes("validate_only") && decodeURIComponent(seen!.body).includes('"validate_only"'));
  assert(decodeURIComponent(seen!.body).includes("status=PAUSED"));
});

Deno.test("validar: recusa do Meta mostra o motivo dele; erro de permissão é marcado", async () => {
  const f1 = (() => Promise.resolve(reply(400, { error: { message: "Invalid parameter", code: 100, error_subcode: 1, error_user_title: "Objetivo inválido", error_user_msg: "Escolha outro objetivo." } }))) as unknown as typeof fetch;
  const r1 = await validateCampaign("t", "1", {}, f1);
  assertEquals(r1.ok, false);
  assertEquals(r1.message, "Objetivo inválido: Escolha outro objetivo.");
  assertEquals(r1.permission, false);
  const f2 = (() => Promise.resolve(reply(403, { error: { message: "(#200) Requires ads_management permission", code: 200 } }))) as unknown as typeof fetch;
  const r2 = await validateCampaign("t", "1", {}, f2);
  assertEquals(r2.permission, true);
});

Deno.test("listas da conta: só id e nome, em ordem; uma lista que falha vira aviso e não derruba as outras", async () => {
  const f = ((url: URL) => {
    const u = String(url);
    if (u.includes("/adspixels")) return Promise.resolve(reply(200, { data: [{ id: "2", name: "Pixel B" }, { id: "1", name: "Pixel A" }] }));
    if (u.includes("/customaudiences")) return Promise.resolve(reply(200, { data: [{ id: "9", name: "Clientes", subtype: "CUSTOM" }] }));
    return Promise.resolve(reply(403, { error: { message: "sem permissão", code: 200 } }));
  }) as unknown as typeof fetch;
  const l = await fetchAccountLists("t", "act_55", f);
  assertEquals(l.pixels.map((p) => p.name), ["Pixel A", "Pixel B"]);
  assertEquals(l.customAudiences[0], { id: "9", name: "Clientes", detail: "CUSTOM" });
  assertEquals(l.savedAudiences, []);
  assertEquals(l.failed, ["savedAudiences"]);
});

Deno.test("imagem: envia em base64 para /adimages e devolve o hash; o token só vai no corpo", async () => {
  let seen: { url: string; body: string } | null = null;
  const f = ((url: URL, init: RequestInit) => { seen = { url: String(url), body: String(init.body) }; return Promise.resolve(reply(200, { images: { "a.png": { hash: "abc123", url: "https://x" } } })); }) as unknown as typeof fetch;
  const hash = await uploadAdImage("TOKEN-SECRETO", "123", new Uint8Array([1, 2, 3]), "a.png", f);
  assertEquals(hash, "abc123");
  assert(seen!.url.includes("/act_123/adimages") && !seen!.url.includes("TOKEN-SECRETO"));
  assert(decodeURIComponent(seen!.body).includes("bytes=AQID"));
});

Deno.test("imagem: recusa do Meta vira mensagem clara com o nome do arquivo", async () => {
  const f = (() => Promise.resolve(reply(400, { error: { message: "bad", error_user_msg: "Imagem pequena demais." } }))) as unknown as typeof fetch;
  let msg = "";
  try { await uploadAdImage("t", "1", new Uint8Array([1]), "pequena.png", f); } catch (e) { msg = (e as Error).message; }
  assertEquals(msg, 'O Meta recusou a imagem "pequena.png": Imagem pequena demais.');
});
