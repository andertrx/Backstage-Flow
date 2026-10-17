import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { accessToken, parseServiceAccount, quoteSheet, SheetsClient, SheetsError, sheetsApiError, signServiceJwt, splitHeader, TOKEN_URL } from "./sheets.ts";

/** Chave RSA de teste gerada na hora (nunca uma chave real). */
async function testAccount(email = "crm@teste.iam.gserviceaccount.com") {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { sa: { client_email: email, private_key: pem }, publicKey: pair.publicKey };
}

const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

Deno.test("chave: aceita só JSON de conta de serviço", () => {
  const sa = parseServiceAccount(JSON.stringify({ type: "service_account", client_email: "a@b.iam.gserviceaccount.com", private_key: "x" }));
  assertEquals(sa.client_email, "a@b.iam.gserviceaccount.com");
  for (const bad of ["", "abc", JSON.stringify({ type: "authorized_user" })]) {
    let code = "";
    try { parseServiceAccount(bad); } catch (e) { code = (e as SheetsError).code; }
    assertEquals(code, "SHEETS_NOT_CONFIGURED");
  }
});

Deno.test("JWT assinado com RS256, escopo só de leitura, válido por 1 hora", async () => {
  const { sa, publicKey } = await testAccount();
  const jwt = await signServiceJwt(sa, 1_800_000_000);
  const [h, c, s] = jwt.split(".");
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlDecode(h))), { alg: "RS256", typ: "JWT" });
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
  assertEquals(claims, { iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: TOKEN_URL, iat: 1_800_000_000, exp: 1_800_003_600 });
  assert(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`)));
});

Deno.test("chave corrompida vira mensagem clara", async () => {
  await assertRejects(() => signServiceJwt({ client_email: "a@b.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----" }), SheetsError, "corrompida");
});

Deno.test("token: troca o JWT, reaproveita enquanto vale e explica quando o Google recusa", async () => {
  const { sa } = await testAccount("cache@teste.iam.gserviceaccount.com");
  let calls = 0;
  const ok = (async (url: string, init: RequestInit) => {
    calls++;
    assertEquals(url, TOKEN_URL);
    assert(String(init.body).includes("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer"));
    return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }));
  }) as typeof fetch;
  assertEquals(await accessToken(sa, ok), "tok-1");
  assertEquals(await accessToken(sa, ok), "tok-1");
  assertEquals(calls, 1);

  const { sa: other } = await testAccount("recusada@teste.iam.gserviceaccount.com");
  const refused = (() => Promise.resolve(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }))) as typeof fetch;
  await assertRejects(() => accessToken(other, refused), SheetsError, "recusou a chave");
});

Deno.test("erros da API viram orientação prática", () => {
  const email = "crm@p.iam.gserviceaccount.com";
  assertEquals(sheetsApiError(403, { error: { message: "The caller does not have permission" } }, email).code, "SHEETS_NOT_SHARED");
  assert(sheetsApiError(403, { error: { message: "x" } }, email).userMessage.includes(email));
  assertEquals(sheetsApiError(403, { error: { message: "Google Sheets API has not been used in project 1 before or it is disabled" } }, email).code, "SHEETS_API_DISABLED");
  assertEquals(sheetsApiError(404, null, email).code, "SHEETS_NOT_FOUND");
  assertEquals(sheetsApiError(400, { error: { message: "Unable to parse range: 'X'!A1" } }, email).code, "SHEETS_TAB_NOT_FOUND");
  assertEquals(sheetsApiError(429, null, email).code, "SHEETS_RATE_LIMITED");
  assertEquals(sheetsApiError(500, null, email).code, "SHEETS_ERROR");
});

Deno.test("lê abas e valores (cabeçalho separado, linhas vazias fora)", async () => {
  const { sa } = await testAccount("leitura@teste.iam.gserviceaccount.com");
  const seen: string[] = [];
  const fake = ((url: string, init?: RequestInit) => {
    seen.push(url);
    if (url === TOKEN_URL) return Promise.resolve(new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 })));
    assertEquals(new Headers(init?.headers).get("Authorization"), "Bearer tok");
    if (url.includes("/values/")) {
      return Promise.resolve(new Response(JSON.stringify({ values: [["ID", " Tipo de Cliente "], ["1", "Lojista"], [], ["", ""], ["2", 3]] })));
    }
    return Promise.resolve(new Response(JSON.stringify({ properties: { title: "Leads" }, sheets: [{ properties: { title: "Página1", gridProperties: { rowCount: 1000, columnCount: 26 } } }] })));
  }) as typeof fetch;
  const c = new SheetsClient(sa, fake);
  assertEquals(await c.inspect("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"), { title: "Leads", tabs: [{ title: "Página1", rowCount: 1000, columnCount: 26 }] });
  const values = await c.values("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", `${quoteSheet("Leads d'Ouro")}!A1:ZZ21`);
  assertEquals(splitHeader(values), { headers: ["ID", "Tipo de Cliente"], rows: [["1", "Lojista"], ["2", "3"]] });
  assert(seen.some((u) => u.includes(encodeURIComponent("'Leads d''Ouro'!A1:ZZ21"))));
});
