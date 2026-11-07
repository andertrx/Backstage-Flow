import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildAuthorizeUrl, CALLBACK_PATH, hasCalendarScope, newState, validRedirectUri } from "./logic.ts";

Deno.test("endereço de retorno: só a página do site, em https (ou localhost), sem parâmetros", () => {
  assert(validRedirectUri(`https://www.backstageflow.com.br${CALLBACK_PATH}`));
  assert(validRedirectUri(`http://localhost:5173${CALLBACK_PATH}`));
  for (const bad of ["http://www.backstageflow.com.br/google-agenda/retorno", `https://x.com${CALLBACK_PATH}?a=1`, "https://x.com/outra", "https://x.com/configuracoes/integracoes/google/callback", "javascript:alert(1)", "lixo"]) {
    assert(!validRedirectUri(bad), bad);
  }
});

Deno.test("link de autorização: acesso offline, só o escopo de eventos e o estado", () => {
  const u = new URL(buildAuthorizeUrl("cid.apps.googleusercontent.com", "s".repeat(64), `https://www.backstageflow.com.br${CALLBACK_PATH}`, "ana@empresa.com.br"));
  assertEquals(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assertEquals(u.searchParams.get("access_type"), "offline");
  assertEquals(u.searchParams.get("prompt"), "consent");
  assertEquals(u.searchParams.get("login_hint"), "ana@empresa.com.br");
  const scope = u.searchParams.get("scope")!;
  assert(scope.includes("auth/calendar.events") && !scope.includes("adwords") && !scope.includes("auth/calendar ") && !scope.endsWith("auth/calendar"));
  assertEquals(u.searchParams.get("state")!.length, 64);
});

Deno.test("sem editar eventos a conexão não vale", () => {
  assert(hasCalendarScope("openid email https://www.googleapis.com/auth/calendar.events"));
  assert(!hasCalendarScope("openid email"));
  assert(!hasCalendarScope(undefined));
});

Deno.test("estado novo: 64 caracteres hexadecimais e diferente a cada vez", () => {
  const a = newState(), b = newState();
  assert(/^[0-9a-f]{64}$/.test(a));
  assert(a !== b);
});
