import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildCampaignFields, currencyOffset, fetchAccountLists, fetchLeadForms, searchTargeting, uploadAdImage, uploadAdVideo, validateCampaign } from "./builder.ts";

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

Deno.test("busca de interesses: pede adinterest em pt_BR e devolve só id e nome (com o tamanho do público)", async () => {
  let url = "";
  const f = ((u: URL | string) => { url = String(u); return Promise.resolve(reply(200, { data: [{ id: "6003", name: "Academia", audience_size_lower_bound: 1200000 }, { name: "sem id" }] })); }) as typeof fetch;
  const r = await searchTargeting("TOK", "interest", "acad", f);
  assertEquals(r.length, 1);
  assertEquals(r[0].id, "6003");
  assert(url.includes("type=adinterest") && url.includes("q=acad") && url.includes("locale=pt_BR"));
});

Deno.test("busca de cidades: só cidades, com região e país", async () => {
  let url = "";
  const f = ((u: URL | string) => { url = String(u); return Promise.resolve(reply(200, { data: [{ key: "2673660", name: "Fortaleza", region: "Ceará", country_name: "Brasil" }] })); }) as typeof fetch;
  const r = await searchTargeting("TOK", "city", "fort", f);
  assertEquals(r, [{ key: "2673660", name: "Fortaleza", detail: "Ceará, Brasil" }]);
  assert(url.includes("type=adgeolocation") && decodeURIComponent(url).includes('["city"]'));
});

Deno.test("formulários da página: id, nome e status", async () => {
  const f = (() => Promise.resolve(reply(200, { data: [{ id: "555566", name: "Cadastro Janeiro", status: "ACTIVE" }, { name: "x" }] }))) as typeof fetch;
  assertEquals(await fetchLeadForms("TOK", "1234567", f), [{ id: "555566", name: "Cadastro Janeiro", status: "ACTIVE" }]);
});

Deno.test("enviar vídeo: manda o arquivo, espera o Meta processar e devolve id e miniatura", async () => {
  const calls: string[] = [];
  let polls = 0;
  const f = ((u: URL | string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(u).split("?")[0]}`);
    if (init?.method === "POST") {
      assert(init.body instanceof FormData && init.body.get("source") instanceof Blob && init.body.get("access_token") === "TOK");
      return Promise.resolve(reply(200, { id: "vid1" }));
    }
    polls++;
    return Promise.resolve(reply(200, polls < 2 ? { status: { video_status: "processing" } } : { status: { video_status: "ready" }, picture: "https://scontent/x.jpg" }));
  }) as typeof fetch;
  const v = await uploadAdVideo("TOK", "123", new Uint8Array([1, 2, 3]), "reels.mp4", "video/mp4", { fetchImpl: f, pollMs: 1 });
  assertEquals(v, { id: "vid1", thumbnail: "https://scontent/x.jpg" });
  assert(calls[0].startsWith("POST") && calls[0].endsWith("/act_123/advideos"));
  assertEquals(polls, 2);
});

Deno.test("enviar vídeo: recusa do Meta, erro de processamento e demora viram mensagens claras", async () => {
  const bytes = new Uint8Array([1]);
  const refuse = (() => Promise.resolve(reply(400, { error: { message: "bad", error_user_msg: "Formato inválido" } }))) as typeof fetch;
  let m1 = ""; try { await uploadAdVideo("T", "1", bytes, "a.mp4", "video/mp4", { fetchImpl: refuse }); } catch (e) { m1 = (e as Error).message; }
  assert(m1.includes("recusou o vídeo") && m1.includes("Formato inválido"));
  const broken = ((_u: URL | string, init?: RequestInit) => Promise.resolve(init?.method === "POST" ? reply(200, { id: "v" }) : reply(200, { status: { video_status: "error" } }))) as typeof fetch;
  let m2 = ""; try { await uploadAdVideo("T", "1", bytes, "a.mp4", "video/mp4", { fetchImpl: broken, pollMs: 1 }); } catch (e) { m2 = (e as Error).message; }
  assert(m2.includes("não conseguiu processar"));
  const slow = ((_u: URL | string, init?: RequestInit) => Promise.resolve(init?.method === "POST" ? reply(200, { id: "v" }) : reply(200, { status: { video_status: "processing" } }))) as typeof fetch;
  let m3 = ""; try { await uploadAdVideo("T", "1", bytes, "a.mp4", "video/mp4", { fetchImpl: slow, pollMs: 1, maxWaitMs: 5 }); } catch (e) { m3 = (e as Error).message; }
  assert(m3.includes("ainda está processando"));
});
