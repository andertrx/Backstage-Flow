import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { buildCoexAuthorizeUrl, coexSchema, completeCoex, credentialsReady, wabaIdsFromDebugToken } from "./coex.ts";

const creds = { app_id: "123456789012", config_id: "987654321098", graph_version: "v23.0", app_secret: "b".repeat(32), verify_token: "v".repeat(48) };
const RET = "https://www.backstageflow.com.br/configuracoes/integracoes/whatsapp/retorno";

Deno.test("endereço do cadastro oficial do Meta (Coexistence)", () => {
  const url = new URL(buildCoexAuthorizeUrl(creds, RET, "s".repeat(64)));
  assertEquals(url.origin + url.pathname, "https://www.facebook.com/v23.0/dialog/oauth");
  assertEquals(url.searchParams.get("client_id"), creds.app_id);
  assertEquals(url.searchParams.get("config_id"), creds.config_id);
  assertEquals(url.searchParams.get("redirect_uri"), RET);
  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(JSON.parse(url.searchParams.get("extras")!).featureType, "whatsapp_business_app_onboarding");
  assert(!url.toString().includes(creds.app_secret));
});

Deno.test("só aceita o retorno do próprio CRM e configuração completa", () => {
  assert(coexSchema.safeParse({ action: "coex_start", containerId: crypto.randomUUID(), redirectUri: RET }).success);
  assert(!coexSchema.safeParse({ action: "coex_start", containerId: crypto.randomUUID(), redirectUri: "https://malicioso.com/x" }).success);
  assert(!coexSchema.safeParse({ action: "coex_start", containerId: crypto.randomUUID(), redirectUri: "http://site.com" + "/configuracoes/integracoes/whatsapp/retorno" }).success);
  assert(credentialsReady(creds));
  assert(!credentialsReady({ ...creds, app_secret: null }));
});

Deno.test("contas liberadas lidas do debug_token", () => {
  assertEquals(wabaIdsFromDebugToken({ data: { granular_scopes: [
    { scope: "business_management", target_ids: ["111111"] },
    { scope: "whatsapp_business_management", target_ids: ["222222", "333333"] },
    { scope: "whatsapp_business_messaging", target_ids: ["222222"] },
  ] } }), ["222222", "333333"]);
  assertEquals(wabaIdsFromDebugToken({}), []);
});

Deno.test("concluir: troca o código, acha o número e assina o webhook (token nunca na resposta de erro)", async () => {
  const calls: string[] = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url.replace(/access_token=[^&]+/, "access_token=…").replace(/client_secret=[^&]+/, "client_secret=…")}`);
    if (url.includes("/oauth/access_token")) return Response.json({ access_token: "EAAtoken" });
    if (url.includes("/debug_token")) return Response.json({ data: { granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["880000000042001"] }] } });
    if (url.includes("/phone_numbers")) return Response.json({ data: [{ id: "990000000042001", display_phone_number: "+55 45 3000-4242", verified_name: "Loja" }] });
    if (url.includes("/subscribed_apps")) return Response.json({ success: true });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const r = await completeCoex(creds, "codigo-do-meta", RET, fake);
  assertEquals([r.waba_id, r.phone_number_id, r.display_phone, r.numbers], ["880000000042001", "990000000042001", "+55 45 3000-4242", 1]);
  assert(calls.some((c) => c.startsWith("POST") && c.includes("/880000000042001/subscribed_apps")));

  const refuse = (async () => Response.json({ error: { message: "Invalid verification code", code: 100 } }, { status: 400 })) as typeof fetch;
  const err = await assertRejects(() => completeCoex(creds, "x".repeat(20), RET, refuse));
  assert(!String((err as Error).message).includes(creds.app_secret));
});
