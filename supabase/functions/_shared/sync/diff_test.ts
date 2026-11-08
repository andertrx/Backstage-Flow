import { assertEquals } from "jsr:@std/assert@1";
import { planWrites, sameValue, TOUCH_AFTER_MS } from "./diff.ts";

const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const old = (extra: Record<string, unknown> = {}, seenAgo = 60_000) =>
  new Map([["a1", { id: "id1", external_id: "a1", last_seen_at: iso(seenAgo), name: "Anúncio", status: "ativa", budget_micros: 5_000_000, thumbnail_url: "https://x/1", ...extra }]]);
const row = (extra: Record<string, unknown> = {}) => ({ external_id: "a1", name: "Anúncio", status: "ativa", budget_micros: 5_000_000, thumbnail_url: "https://x/2", last_seen_at: iso(0), ...extra });
const FIELDS = ["name", "status", "budget_micros"];

Deno.test("nada mudou e foi visto há pouco: não grava (mesmo com a miniatura trocada)", () => {
  const p = planWrites([row()], old(), FIELDS, NOW);
  assertEquals([p.write.length, p.skipped], [0, 1]);
});

Deno.test("linha nova grava", () => {
  const p = planWrites([row({ external_id: "novo" })], old(), FIELDS, NOW);
  assertEquals([p.write.length, p.skipped], [1, 0]);
});

Deno.test("campo que importa mudou (status, nome, orçamento): grava", () => {
  for (const change of [{ status: "pausada" }, { name: "Outro" }, { budget_micros: 6_000_000 }]) {
    assertEquals(planWrites([row(change)], old(), FIELDS, NOW).write.length, 1);
  }
});

Deno.test("nada mudou mas faz mais de 24 h que foi visto: grava 1 vez para renovar", () => {
  assertEquals(planWrites([row()], old({}, TOUCH_AFTER_MS + 1000), FIELDS, NOW).write.length, 1);
  assertEquals(planWrites([row()], old({}, TOUCH_AFTER_MS - 60_000), FIELDS, NOW).write.length, 0);
});

Deno.test("sem data de 'visto' no banco: grava", () => {
  assertEquals(planWrites([row()], old({ last_seen_at: null }), FIELDS, NOW).write.length, 1);
});

Deno.test("comparação como o banco devolve: vazio = nulo, número = texto numérico, objeto por conteúdo", () => {
  assertEquals(sameValue(null, undefined), true);
  assertEquals(sameValue("", null), true);
  assertEquals(sameValue(5000000, "5000000"), true);
  assertEquals(sameValue("2026-11-08", "2026-11-08"), true);
  assertEquals(sameValue(null, 0), false);
  assertEquals(sameValue({ a: 1 }, { a: 1 }), true);
  assertEquals(sameValue({ a: 1 }, { a: 2 }), false);
  assertEquals(sameValue("a", "b"), false);
  assertEquals(sameValue("2026-10-01", "2026-10-01T00:00:00-0300"), true);
  assertEquals(sameValue("2026-10-01", "2026-10-02T00:00:00-0300"), false);
});
