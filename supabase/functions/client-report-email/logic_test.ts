import { assertEquals } from "jsr:@std/assert@1";
import { emailButton, emailWeek, periodText, resendResult } from "./logic.ts";

Deno.test("semana do e-mail: últimos 7 dias completos no fuso do cliente", () => {
  // Segunda 28/09/2026 às 08h em São Paulo (11h UTC)
  const w = emailWeek("America/Sao_Paulo", new Date("2026-09-28T11:00:00Z"));
  assertEquals(w, { from: "2026-09-21", to: "2026-09-27" });
  assertEquals(periodText(w), "21/09 a 27/09/2026");
});

Deno.test("botão: link secreto guardado, senão login ligado, senão nenhum", () => {
  const tok = "A".repeat(43);
  assertEquals(emailButton("link", tok, false)?.url, `https://www.backstageflow.com.br/r/${tok}`);
  assertEquals(emailButton("link", null, true)?.url, "https://www.backstageflow.com.br/login");
  assertEquals(emailButton("login", null, true)?.label, "Entrar e ver o dashboard completo");
  assertEquals(emailButton("login", null, false), null);
  assertEquals(emailButton("none", tok, true), null);
});

Deno.test("respostas do Resend viram mensagens claras", () => {
  assertEquals(resendResult(200, { id: "abc" }), { ok: true, id: "abc" });
  const bad = resendResult(401, { message: "API key is invalid" });
  assertEquals(bad.ok, false);
  assertEquals((bad as { message: string }).message.startsWith("O Resend recusou a chave"), true);
  const dom = resendResult(403, { message: "The backstageflow.com.br domain is not verified." });
  assertEquals((dom as { message: string }).message.startsWith("O domínio do remetente ainda não foi verificado"), true);
  assertEquals(resendResult(429, {}).ok, false);
  assertEquals(resendResult(200, {}).ok, false);
});
