import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { describeError, recordError, redactSecrets, setErrorLogClient } from "./errorlog.ts";
import { AppError, handle } from "./http.ts";

Deno.test("redactSecrets apaga tokens, chaves e senhas", () => {
  const raw = [
    "GET https://graph.facebook.com/v23.0/act_1?access_token=EAABsbCS1iHgBAKZC9ZBxyz&appsecret_proof=abc123&fields=name",
    'refresh_token: "1//0gAbCdEf"',
    "Authorization: Bearer ya29.a0AfH6SMB",
    "developer-token=XyZ123",
    '{"password":"SenhaForte!1","client_secret":"GOCSPX-abc"}',
    "solto EAAG1234567890abcdefghijKLMNOP no meio",
    "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  ].join("\n");
  const clean = redactSecrets(raw);
  for (const secret of ["EAABsbCS1iHgBAKZC9ZBxyz", "abc123", "1//0gAbCdEf", "ya29.a0AfH6SMB", "XyZ123", "SenhaForte", "GOCSPX-abc", "EAAG1234567890", "dozjgNryP4J3"]) {
    assertFalse(clean.includes(secret), `vazou: ${secret}`);
  }
  assert(clean.includes("graph.facebook.com/v23.0/act_1"));
  assert(clean.includes("fields=name"));
});

Deno.test("describeError inclui o código e o detalhe técnico, sem segredos", () => {
  const err = new AppError(502, "PLATFORM_ERROR", "A Meta não respondeu.", new Error("fetch failed ?access_token=EAAtesteTokenMuitoLongo123456"));
  const text = describeError(err);
  assert(text.startsWith("PLATFORM_ERROR"));
  assert(text.includes("fetch failed"));
  assertFalse(text.includes("EAAtesteTokenMuitoLongo123456"));
  assertEquals(describeError({ message: "duplicate key", code: "23505" }), '{"message":"duplicate key","code":"23505"}');
  assertEquals(describeError("x".repeat(5000)).length, 4000);
});

function fakeClient(fail = false) {
  const rows: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (fail) return Promise.reject(new Error("banco fora do ar"));
        rows.push({ table, ...row });
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, rows };
}

Deno.test("recordError grava o erro limpo e nunca lança", async () => {
  const { client, rows } = fakeClient();
  setErrorLogClient(client);
  try {
    await recordError({
      source: "sincronizacao", code: "RATE LIMITED!", userMessage: "Não conseguimos atualizar os dados desta conta.",
      technical: new Error("429 token=segredo"), context: { periodo: "2026-09-01..2026-09-25", vazio: null }, adAccountId: "a1", clientId: "c1",
    });
    assertEquals(rows.length, 1);
    assertEquals(rows[0].table, "error_logs");
    assertEquals(rows[0].code, "RATELIMITED");
    assertEquals(rows[0].ad_account_id, "a1");
    assertEquals(rows[0].context, { periodo: "2026-09-01..2026-09-25" });
    assertFalse(String(rows[0].technical).includes("segredo"));

    setErrorLogClient(fakeClient(true).client);
    await recordError({ source: "servidor", code: "X", technical: "y" }); // não lança
  } finally {
    setErrorLogClient(null);
  }
});

Deno.test("handle devolve mensagem amigável e guarda o detalhe técnico", async () => {
  const { client, rows } = fakeClient();
  setErrorLogClient(client);
  try {
    const post = () => new Request("http://x", { method: "POST" });
    const boom = handle(() => Promise.reject(new TypeError("Cannot read properties of undefined (reading 'id')")), "teste");
    const res = await boom(post());
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error.message, "Algo deu errado. Tente novamente em instantes.");
    assertFalse(JSON.stringify(body).includes("Cannot read"));
    assertEquals(rows.length, 1);
    assert(String(rows[0].technical).includes("Cannot read properties"));
    assertEquals(rows[0].context, { funcao: "teste" });

    // Erro esperado (sessão expirada, validação) não vira log técnico.
    const expected = handle(() => Promise.reject(new AppError(401, "UNAUTHENTICATED", "Faça login.", new Error("jwt expired"))), "teste");
    assertEquals((await expected(post())).status, 401);
    const invalid = handle(() => Promise.reject(new AppError(400, "INVALID_INPUT", "Dados inválidos.", "zod: email")), "teste");
    assertEquals((await invalid(post())).status, 400);
    assertEquals(rows.length, 1);

    // Erro da plataforma (mesmo 4xx) vai para o log.
    const platform = handle(() => Promise.reject(new AppError(429, "RATE_LIMITED", "O Meta pediu uma pausa.")), "teste");
    assertEquals((await platform(post())).status, 429);
    assertEquals(rows.length, 2);
    assertEquals(rows[1].code, "RATE_LIMITED");
  } finally {
    setErrorLogClient(null);
  }
});

Deno.test("CORS: só o site oficial, as versões de teste e o computador local", async () => {
  const { isAllowedOrigin, corsHeaders } = await import("./http.ts");
  for (const ok of ["https://web-ivory-three-49.vercel.app", "https://web-gvvjd71eu-andertrxs-projects.vercel.app", "http://localhost:5173"]) {
    assert(isAllowedOrigin(ok, ""), ok);
  }
  for (const bad of ["https://evil.com", "https://web-ivory-three-49.vercel.app.evil.com", "https://web-x-outro-projects.vercel.app", "http://localhost:8080", ""]) {
    assertFalse(isAllowedOrigin(bad, ""), bad);
  }
  assert(isAllowedOrigin("https://app.agencia.com.br", "https://app.agencia.com.br, https://outro.com"));
  const h = corsHeaders(new Request("http://x", { headers: { origin: "https://evil.com" } })) as Record<string, string>;
  assertEquals(h["Access-Control-Allow-Origin"], "https://web-ivory-three-49.vercel.app");
});
