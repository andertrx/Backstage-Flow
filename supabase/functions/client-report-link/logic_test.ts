import { assertEquals } from "jsr:@std/assert@1";
import { mapDbError, requestSchema } from "./logic.ts";

const token = "A".repeat(43);

Deno.test("aceita só código de 43 caracteres e períodos conhecidos", () => {
  assertEquals(requestSchema.safeParse({ token }).success, true);
  assertEquals(requestSchema.safeParse({ token, period: "last_30_days" }).success, true);
  assertEquals(requestSchema.safeParse({ token: "curto" }).success, false);
  assertEquals(requestSchema.safeParse({ token: token + "!" }).success, false);
  assertEquals(requestSchema.safeParse({ token, period: "ontem" }).success, false);
});

Deno.test("datas livres: as duas juntas, no formato AAAA-MM-DD", () => {
  assertEquals(requestSchema.safeParse({ token, from: "2026-09-01", to: "2026-09-10" }).success, true);
  assertEquals(requestSchema.safeParse({ token, from: "2026-09-01" }).success, false);
  assertEquals(requestSchema.safeParse({ token, from: "01/09/2026", to: "2026-09-10" }).success, false);
});

Deno.test("erros do banco viram mensagens amigáveis", () => {
  assertEquals(mapDbError("P0002").status, 404);
  assertEquals(mapDbError("22023").code, "INVALID_PERIOD");
  assertEquals(mapDbError("54000").status, 429);
  assertEquals(mapDbError("XX000").status, 500);
});
