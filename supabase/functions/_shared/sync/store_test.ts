import { assertEquals } from "jsr:@std/assert@1";
import { supabaseSyncStore } from "./store.ts";

/** Banco de mentira (em memória) com só o que a gravação da estrutura usa. */
function fakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = { campaigns: [], ad_groups: [], ads: [], period_reach: [] };
  const writes: Record<string, number> = { campaigns: 0, ad_groups: 0, ads: 0, period_reach: 0 };
  let seq = 0;
  const db = {
    from(table: string) {
      return {
        select() {
          const q = { rows: tables[table] };
          const chain = {
            eq: () => chain, in: () => chain, order: () => chain,
            range: (a: number, b: number) => Promise.resolve({ data: q.rows.slice(a, b + 1), error: null }),
            then: undefined,
          };
          return chain;
        },
        upsert(part: Record<string, unknown>[]) {
          writes[table] += part.length;
          const out: Record<string, unknown>[] = [];
          for (const row of part) {
            const keyOf = (r: Record<string, unknown>) => table === "period_reach"
              ? `${r.level}|${r.entity_external_id}|${r.period_start}|${r.period_end}` : String(r.external_id);
            const i = tables[table].findIndex((r) => keyOf(r) === keyOf(row));
            const saved: Record<string, unknown> = i >= 0 ? { ...tables[table][i], ...row } : { id: `id${++seq}`, ...row };
            if (i >= 0) tables[table][i] = saved; else tables[table].push(saved);
            out.push({ id: saved.id, external_id: saved.external_id });
          }
          return { select: () => Promise.resolve({ data: out, error: null }), then: (f: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(f) };
        },
      };
    },
  };
  return { db, tables, writes };
}

const account = { id: "acc1", client_id: "cli1", platform_id: "meta" } as never;
const structure = (status = "ativa") => ({
  campaigns: [{ externalId: "c1", name: "Camp", objective: "LEADS", status, rawStatus: "ACTIVE", effectiveStatus: "ACTIVE", budgetMicros: 5_000_000, budgetPeriod: "diario", bidStrategy: null, startDate: "2026-10-01", endDate: null }],
  adGroups: [{ externalId: "g1", campaignExternalId: "c1", name: "Grupo", status: "ativa", rawStatus: "ACTIVE", effectiveStatus: "ACTIVE", budgetMicros: null, budgetPeriod: null, optimizationGoal: "LEADS" }],
  ads: [
    { externalId: "a1", adGroupExternalId: "g1", campaignExternalId: "c1", name: "Anúncio 1", status: "ativa", rawStatus: "ACTIVE", effectiveStatus: "ACTIVE", creativeType: "imagem", reviewStatus: null, thumbnailUrl: "https://cdn/1?sig=a", creativeExternalId: "cr1" },
    { externalId: "a2", adGroupExternalId: "g1", campaignExternalId: "c1", name: "Anúncio 2", status: "ativa", rawStatus: "ACTIVE", effectiveStatus: "ACTIVE", creativeType: "video", reviewStatus: null, thumbnailUrl: "https://cdn/2?sig=a", creativeExternalId: null },
  ],
}) as never;

Deno.test("estrutura: 1ª rodada grava tudo; 2ª (nada mudou, miniatura trocada) não grava; mudança grava só a linha; ids vêm sempre completos", async () => {
  const { db, writes } = fakeDb();
  const store = supabaseSyncStore(db as never);
  const r1 = await store.upsertStructure(account, structure());
  assertEquals([writes.campaigns, writes.ad_groups, writes.ads, r1.count], [1, 1, 2, 4]);

  const s2 = structure() as { ads: { thumbnailUrl: string }[] };
  s2.ads[0].thumbnailUrl = "https://cdn/1?sig=NOVA"; // o Meta troca a assinatura da imagem a cada consulta
  const r2 = await store.upsertStructure(account, s2 as never);
  assertEquals([writes.campaigns, writes.ad_groups, writes.ads], [1, 1, 2]);
  assertEquals([r2.count, r2.ids.ads.size, r2.ids.campaigns.size, r2.ids.adGroups.size], [4, 2, 1, 1]);
  assertEquals(r2.ids.ads.get("a1"), r1.ids.ads.get("a1"));

  const s3 = structure() as { ads: { status: string }[] };
  s3.ads[1].status = "pausada";
  const r3 = await store.upsertStructure(account, s3 as never);
  assertEquals([writes.campaigns, writes.ad_groups, writes.ads], [1, 1, 3]);
  assertEquals(r3.ids.ads.size, 2);

  // volta o anúncio 2 para "ativa" (muda de novo) e pausa a campanha
  await store.upsertStructure(account, structure("pausada"));
  assertEquals([writes.campaigns, writes.ad_groups, writes.ads], [2, 1, 4]);
});

Deno.test("alcance: igual ao guardado não é reescrito; valor novo ou diferente é", async () => {
  const { db, writes } = fakeDb();
  const store = supabaseSyncStore(db as never);
  const row = (reach: number) => ({ level: "campaign", entityExternalId: "c1", from: "2026-11-01", to: "2026-11-07", reach, impressions: 1000, frequency: 1.5 });
  await store.upsertReach(account, [row(500)] as never);
  assertEquals(writes.period_reach, 1);
  await store.upsertReach(account, [row(500)] as never);
  assertEquals(writes.period_reach, 1);
  await store.upsertReach(account, [row(520)] as never);
  assertEquals(writes.period_reach, 2);
});
