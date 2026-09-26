// Etapa 28: o servidor e o site conhecem exatamente as mesmas plataformas.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { PLATFORM_ID_PATTERN, PLATFORM_IDS } from "../../../../packages/shared/src/platforms/catalog.ts";
import type { PlatformAdapter } from "./adapter.ts";
import { getAdapter, SUPPORTED_PLATFORMS } from "./registry.ts";

Deno.test("cada plataforma do catálogo tem adaptador no servidor (e vice-versa)", () => {
  assertEquals([...SUPPORTED_PLATFORMS].sort(), [...PLATFORM_IDS].sort());
});

Deno.test("o adaptador de cada plataforma cumpre o contrato comum", () => {
  const required: (keyof PlatformAdapter)[] = [
    "validateCredentials",
    "listAccounts",
    "getAccount",
    "listAssets",
    "getFunding",
    "fetchStructure",
    "fetchDailyMetrics",
  ];
  for (const id of SUPPORTED_PLATFORMS) {
    const adapter = getAdapter(id);
    assert(adapter, id);
    assertEquals(adapter.platform, id);
    assert(PLATFORM_ID_PATTERN.test(id), `id fora do padrão do banco: ${id}`);
    for (const fn of required) assertEquals(typeof adapter[fn], "function", `${id}.${fn}`);
  }
});

Deno.test("plataforma que ainda não existe não tem adaptador (sem erro)", () => {
  assertEquals(getAdapter("tiktok"), undefined);
  assertEquals(getAdapter("toString"), undefined);
});
