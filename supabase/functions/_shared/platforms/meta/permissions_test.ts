import { assert, assertEquals } from "jsr:@std/assert@1";
import { fetchPermissions, summarizePermissions } from "./permissions.ts";

const todas = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement", "instagram_basic"];

Deno.test("permissões: com todas concedidas, pode criar campanha", () => {
  const r = summarizePermissions(todas.map((permission) => ({ permission, status: "granted" })));
  assert(r.canCreate);
  assert(r.canRead);
  assertEquals(r.checks.every((c) => c.state === "concedida"), true);
});

Deno.test("permissões: só leitura (sem ads_management) não pode criar, mas lê", () => {
  const r = summarizePermissions([
    { permission: "ads_read", status: "granted" },
    { permission: "business_management", status: "granted" },
  ]);
  assertEquals(r.canCreate, false);
  assertEquals(r.canRead, true);
  assertEquals(r.checks.find((c) => c.name === "ads_management")?.state, "ausente");
});

Deno.test("permissões: recusada e expirada contam como recusada; extras só informam", () => {
  const r = summarizePermissions([
    { permission: "ads_management", status: "declined" },
    { permission: "ads_read", status: "expired" },
    { permission: "public_profile", status: "granted" },
    { permission: "email", status: "declined" },
  ]);
  assertEquals(r.checks.find((c) => c.name === "ads_management")?.state, "recusada");
  assertEquals(r.checks.find((c) => c.name === "ads_read")?.state, "recusada");
  assertEquals(r.canRead, false);
  assertEquals(r.others, ["public_profile"]);
});

Deno.test("permissões: resposta vazia do Meta vira tudo ausente (nada inventado)", () => {
  const r = summarizePermissions([]);
  assertEquals(r.canCreate, false);
  assertEquals(r.checks.every((c) => c.state === "ausente"), true);
});

Deno.test("fetchPermissions: chama /me/permissions só com GET", async () => {
  const calls: { url: string; method?: string }[] = [];
  const fakeFetch = ((input: URL | string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method });
    return Promise.resolve(new Response(JSON.stringify({ data: [{ permission: "ads_read", status: "granted" }] }), { status: 200 }));
  }) as typeof fetch;
  const r = await fetchPermissions("token-falso", fakeFetch);
  assertEquals(calls.length, 1);
  assert(calls[0].url.includes("/me/permissions"));
  assert(calls[0].method === undefined || calls[0].method === "GET");
  assertEquals(r.canCreate, false);
});
