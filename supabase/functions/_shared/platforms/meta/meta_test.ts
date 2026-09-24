import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { AppError } from "../../http.ts";
import { createMetaAdapter } from "./adapter.ts";
import { appSecretProof, classifyMetaError } from "./client.ts";
import { mapAccount, mapAccountStatus, mapPages } from "./mapping.ts";

Deno.test("status: códigos documentados viram status normalizado", () => {
  assertEquals(mapAccountStatus(1), "ativa");
  assertEquals(mapAccountStatus(2), "desativada");
  assertEquals(mapAccountStatus(3), "pagamento_pendente");
  assertEquals(mapAccountStatus(7), "restrita");
  assertEquals(mapAccountStatus(8), "pagamento_pendente");
  assertEquals(mapAccountStatus(9), "atencao");
  assertEquals(mapAccountStatus("1"), "ativa");
});

Deno.test("status: código desconhecido não é inventado", () => {
  assertEquals(mapAccountStatus(999), "desconhecida");
  assertEquals(mapAccountStatus(undefined), "desconhecida");
});

Deno.test("conta: mapeia campos e guarda o status original", () => {
  const account = mapAccount({
    id: "act_123",
    account_id: "123",
    name: " Excalibur - Conta 1 ",
    currency: "brl",
    timezone_name: "America/Sao_Paulo",
    account_status: 3,
    disable_reason: 0,
    is_prepay_account: true,
    business: { id: "999", name: "BM Agência" },
  });
  assertEquals(account, {
    externalId: "123",
    name: "Excalibur - Conta 1",
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    status: "pagamento_pendente",
    rawStatus: "account_status=3",
    statusReason: null,
    businessId: "999",
    businessName: "BM Agência",
    isPrepay: true,
  });
});

Deno.test("conta: campos ausentes ficam null (nada inventado)", () => {
  const account = mapAccount({ id: "act_555" });
  assertEquals(account.externalId, "555");
  assertEquals(account.currency, null);
  assertEquals(account.isPrepay, null);
  assertEquals(account.status, "desconhecida");
  assertEquals(account.rawStatus, null);
});

Deno.test("páginas: inclui Instagram ligado sem repetir", () => {
  const assets = mapPages([
    { id: "p1", name: "Excalibur", instagram_business_account: { id: "ig1", username: "excalibur" } },
    { id: "p2", name: "Excalibur 2", instagram_business_account: { id: "ig1", username: "excalibur" } },
    { id: "p3" },
  ]);
  assertEquals(assets.map((a) => `${a.type}:${a.externalId}`), ["page:p1", "instagram:ig1", "page:p2", "page:p3"]);
  assertEquals(assets[1].name, "@excalibur");
  assertEquals(assets[1].parentExternalId, "p1");
});

Deno.test("appsecret_proof: HMAC-SHA256 correto (vetor de teste público)", async () => {
  assertEquals(
    await appSecretProof("The quick brown fox jumps over the lazy dog", "key"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
});

Deno.test("erros do Meta viram mensagens amigáveis por categoria", () => {
  assertEquals(classifyMetaError(400, { error: { code: 190 } }).code, "AUTH_EXPIRED");
  assertEquals(classifyMetaError(403, { error: { code: 200 } }).code, "PERMISSION_DENIED");
  assertEquals(classifyMetaError(400, { error: { code: 17 } }).code, "RATE_LIMITED");
  assertEquals(classifyMetaError(400, { error: { code: 80004 } }).code, "RATE_LIMITED");
  assertEquals(classifyMetaError(400, { error: { code: 100 } }).code, "PLATFORM_BAD_REQUEST");
  assertEquals(classifyMetaError(500, {}).code, "PLATFORM_UNAVAILABLE");
  // A mensagem mostrada ao usuário nunca é o texto técnico do Meta.
  const err = classifyMetaError(400, { error: { code: 190, message: "Error validating access token: Session has expired" } });
  assert(!err.userMessage.includes("Session has expired"));
});

/** fetch falso que responde conforme o caminho e registra as URLs chamadas. */
function fakeFetch(routes: Record<string, unknown[]>) {
  const calls: URL[] = [];
  const impl = ((input: URL | string) => {
    const url = new URL(input.toString());
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.pathname.endsWith(k));
    const queue = key ? routes[key] : undefined;
    const body = queue?.shift() ?? { error: { code: 100, message: "not found" } };
    const status = (body as { error?: unknown }).error ? 400 : 200;
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;
  return { impl, calls };
}

Deno.test("listAccounts: percorre todas as páginas e ordena por nome", async () => {
  const { impl, calls } = fakeFetch({
    "/me/adaccounts": [
      { data: [{ id: "act_2", account_id: "2", name: "Zeta", account_status: 1 }], paging: { next: "https://graph.facebook.com/v26.0/me/adaccounts?after=abc&access_token=VAZADO" } },
      { data: [{ id: "act_1", account_id: "1", name: "Alfa", account_status: 2 }] },
    ],
  });
  const accounts = await createMetaAdapter(impl).listAccounts("TOKEN");
  assertEquals(accounts.map((a) => a.name), ["Alfa", "Zeta"]);
  assertEquals(calls.length, 2);
  assert(calls[0].pathname.startsWith("/v26.0/"), "usa a versão configurada");
  assertEquals(calls[1].searchParams.get("access_token"), "TOKEN", "reenvia o token certo, não o do link");
  assertEquals(calls[1].searchParams.get("after"), "abc");
});

Deno.test("listAssets: sem permissão de Instagram, busca só as páginas", async () => {
  const { impl, calls } = fakeFetch({
    "/act_123/promote_pages": [{ error: { code: 200, message: "no ig permission" } }, { data: [{ id: "p1", name: "Página" }] }],
  });
  const assets = await createMetaAdapter(impl).listAssets("TOKEN", "123");
  assertEquals(assets, [{ type: "page", externalId: "p1", name: "Página", parentExternalId: null }]);
  assertEquals(calls[1].searchParams.get("fields"), "id,name");
});

Deno.test("getAccount: recusa id que não é numérico (evita montar URL arbitrária)", async () => {
  const { impl, calls } = fakeFetch({});
  await assertRejects(() => createMetaAdapter(impl).getAccount("TOKEN", "../me"), AppError);
  assertEquals(calls.length, 0);
});
