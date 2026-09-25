import { assertEquals } from "jsr:@std/assert@1";
import { pickForSync } from "./cache.ts";

const now = new Date("2026-09-25T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
const states = [
  { adAccountId: "recente", lastSuccessAt: ago(3) },
  { adAccountId: "em-dia", lastSuccessAt: ago(45) },
  { adAccountId: "atrasada", lastSuccessAt: ago(200) },
  { adAccountId: "nunca", lastSuccessAt: null },
];

Deno.test("Sincronizar agora: pula só quem foi sincronizada há menos de 10 minutos", () => {
  assertEquals(pickForSync(states, false, now), { sync: ["em-dia", "atrasada", "nunca"], fresh: ["recente"] });
});

Deno.test("ao abrir a página: busca só as desatualizadas ou nunca sincronizadas", () => {
  assertEquals(pickForSync(states, true, now), { sync: ["atrasada", "nunca"], fresh: ["recente", "em-dia"] });
});
