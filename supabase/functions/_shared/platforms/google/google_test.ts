import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { AppError } from "../../http.ts";
import { createGoogleAdapter } from "./adapter.ts";
import { classifyGoogleError } from "./errors.ts";
import { formatCustomerId, mapCustomer, mapCustomerStatus } from "./mapping.ts";
import { buildAuthorizeUrl } from "./oauth.ts";

Deno.env.set("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV-TOKEN");
Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "client-id");
Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "client-secret");

Deno.test("status: valores documentados do CustomerStatus", () => {
  assertEquals(mapCustomerStatus("ENABLED"), "ativa");
  assertEquals(mapCustomerStatus("SUSPENDED"), "restrita");
  assertEquals(mapCustomerStatus("CANCELED"), "encerrada");
  assertEquals(mapCustomerStatus("CLOSED"), "encerrada");
  assertEquals(mapCustomerStatus("UNKNOWN"), "desconhecida");
  assertEquals(mapCustomerStatus(undefined), "desconhecida");
});

Deno.test("Customer ID é exibido no formato do Google (123-456-7890)", () => {
  assertEquals(formatCustomerId("1234567890"), "123-456-7890");
  assertEquals(formatCustomerId("123"), "123");
});

Deno.test("conta: mapeia campos; pré-paga não é informada pela API (null)", () => {
  const a = mapCustomer(
    { id: "1234567890", descriptiveName: "Excalibur", currencyCode: "brl", timeZone: "America/Sao_Paulo", status: "ENABLED", testAccount: false },
    { id: "999", name: "MCC Agência" },
  );
  assertEquals(a.externalId, "1234567890");
  assertEquals(a.currency, "BRL");
  assertEquals(a.status, "ativa");
  assertEquals(a.rawStatus, "customer.status=ENABLED");
  assertEquals(a.managerId, "999");
  assertEquals(a.businessName, "MCC Agência");
  assertEquals(a.isPrepay, null);
  assertEquals(a.isTestAccount, false);
});

Deno.test("OAuth: pede acesso offline, consentimento e escopo do Google Ads", () => {
  const url = new URL(buildAuthorizeUrl("estado-123", "https://app.exemplo.com/configuracoes/integracoes/google/callback"));
  assertEquals(url.searchParams.get("access_type"), "offline");
  assertEquals(url.searchParams.get("prompt"), "consent");
  assertEquals(url.searchParams.get("state"), "estado-123");
  assert(url.searchParams.get("scope")!.includes("https://www.googleapis.com/auth/adwords"));
  assertEquals(url.searchParams.get("client_id"), "client-id");
});

Deno.test("erros: códigos do Google viram mensagens amigáveis", () => {
  assertEquals(classifyGoogleError(400, { error: "invalid_grant" }).code, "AUTH_EXPIRED");
  const dev = classifyGoogleError(403, { error: { details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" } }] }] } });
  assertEquals(dev.code, "DEVELOPER_TOKEN_LIMITED");
  assert(dev.userMessage.includes("contas de teste"));
  assertEquals(classifyGoogleError(403, { error: { details: [{ errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" } }] }] } }).code, "PERMISSION_DENIED");
  assertEquals(classifyGoogleError(403, { error: { message: "CUSTOMER_NOT_ENABLED" } }).code, "ACCOUNT_NOT_ENABLED");
  assertEquals(classifyGoogleError(429, {}).code, "RATE_LIMITED");
  assertEquals(classifyGoogleError(401, {}).code, "AUTH_EXPIRED");
  assertEquals(classifyGoogleError(503, {}).code, "PLATFORM_UNAVAILABLE");
});

/** Google falso: responde token, contas acessíveis e consultas GAQL. */
function fakeGoogle() {
  const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
  const customers: Record<string, unknown> = {
    "111": { id: "111", descriptiveName: "MCC Agência", manager: true, status: "ENABLED" },
    "222": { id: "222", descriptiveName: "Loja Direta", manager: false, status: "ENABLED", currencyCode: "BRL", timeZone: "America/Sao_Paulo" },
    "333": null, // conta cancelada: a API responde erro
  };
  const impl = ((input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url, headers, body: init?.body?.toString() });
    const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    if (url.includes("oauth2.googleapis.com/token")) return ok({ access_token: "ACCESS", expires_in: 3600 });
    if (url.endsWith("customers:listAccessibleCustomers")) return ok({ resourceNames: ["customers/111", "customers/222", "customers/333"] });
    const match = url.match(/customers\/(\d+)\/googleAds:search$/);
    if (match) {
      const query = JSON.parse(init!.body as string).query as string;
      if (query.includes("FROM customer_client")) {
        return ok({
          results: [
            { customerClient: { id: "444", descriptiveName: "Excalibur Fitness", status: "ENABLED", currencyCode: "BRL", timeZone: "America/Sao_Paulo", manager: false } },
            { customerClient: { id: "222", descriptiveName: "Loja Direta", status: "ENABLED", manager: false } },
          ],
        });
      }
      const customer = customers[match[1]];
      if (!customer) {
        return Promise.resolve(new Response(JSON.stringify({ error: { code: 403, message: "CUSTOMER_NOT_ENABLED" } }), { status: 403 }));
      }
      return ok({ results: [{ customer }] });
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  }) as typeof fetch;
  return { impl, calls };
}

Deno.test("listAccounts: expande a MCC, prioriza acesso direto e pula conta cancelada", async () => {
  const { impl, calls } = fakeGoogle();
  const accounts = await createGoogleAdapter(impl).listAccounts("REFRESH");
  assertEquals(accounts.map((a) => `${a.externalId}:${a.managerId ?? "direto"}`), ["444:111", "222:direto"]);
  const clientsCall = calls.find((c) => c.body?.includes("FROM customer_client"))!;
  assertEquals(clientsCall.headers["login-customer-id"], "111", "consulta a MCC com login-customer-id");
  assertEquals(clientsCall.headers["developer-token"], "DEV-TOKEN");
  assertEquals(clientsCall.headers["authorization"], "Bearer ACCESS");
  assert(calls[0].url.includes("oauth2.googleapis.com/token"), "renova o token de acesso primeiro");
  assert(calls.some((c) => c.url.includes("/v25/")), "usa a versão configurada");
});

Deno.test("getAccount: usa a MCC informada como login-customer-id", async () => {
  const { impl, calls } = fakeGoogle();
  const account = await createGoogleAdapter(impl).getAccount("REFRESH", "222", { managerId: "111" });
  assertEquals(account.managerId, "111");
  assertEquals(account.businessName, "MCC Agência");
  const first = calls.find((c) => c.url.includes("customers/222/"))!;
  assertEquals(first.headers["login-customer-id"], "111");
});

Deno.test("getAccount: recusa Customer ID inválido sem chamar o Google", async () => {
  const { impl, calls } = fakeGoogle();
  await assertRejects(() => createGoogleAdapter(impl).getAccount("REFRESH", "12-34"), AppError);
  assertEquals(calls.length, 0);
});

Deno.test("developer token sem aprovação interrompe a listagem com aviso claro", async () => {
  const impl = ((input: string | URL) => {
    const url = input.toString();
    if (url.includes("oauth2")) return Promise.resolve(new Response(JSON.stringify({ access_token: "A", expires_in: 1 }), { status: 200 }));
    if (url.endsWith("listAccessibleCustomers")) return Promise.resolve(new Response(JSON.stringify({ resourceNames: ["customers/1"] }), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify({ error: { code: 403, details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" } }] }] } }), { status: 403 }));
  }) as typeof fetch;
  const err = await assertRejects(() => createGoogleAdapter(impl).listAccounts("R"), AppError);
  assertEquals((err as AppError).code, "DEVELOPER_TOKEN_LIMITED");
});
