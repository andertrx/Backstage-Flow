import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { setErrorLogClient } from "./errorlog.ts";
import { AppError } from "./http.ts";
import { enforceRateLimit, RATE_LIMITS } from "./ratelimit.ts";

function fakeDb(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown>[] = [];
  const db = { rpc: (_fn: string, args: Record<string, unknown>) => (calls.push(args), Promise.resolve(result)) } as unknown as SupabaseClient;
  return { db, calls };
}

Deno.test("dentro do limite: segue e envia a regra da ação", async () => {
  const { db, calls } = fakeDb({ data: true, error: null });
  await enforceRateLimit(db, "sync.run", "u1");
  assertEquals(calls[0], { p_bucket: "sync.run", p_subject: "u1", p_max: RATE_LIMITS["sync.run"].max, p_window_seconds: 600 });
});

Deno.test("passou do limite: 429 com mensagem amigável", async () => {
  const { db } = fakeDb({ data: false, error: null });
  const err = await assertRejects(() => enforceRateLimit(db, "accounts.connect", "u1"), AppError);
  assertEquals(err.status, 429);
  assertEquals(err.code, "TOO_MANY_REQUESTS");
  assertEquals(err.userMessage, "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.");
});

Deno.test("contador fora do ar: não bloqueia quem usa", async () => {
  setErrorLogClient(null);
  const { db } = fakeDb({ data: null, error: { message: "timeout" } });
  await enforceRateLimit(db, "users.manage", "u1");
});
