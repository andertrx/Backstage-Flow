import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  decimalToMicros,
  fetchMetaDailyMetrics,
  fetchMetaPeriodReach,
  mapMetaAd,
  mapMetaCampaign,
  mapMetaEntityStatus,
  mapMetaInsight,
  splitRange,
} from "./meta/sync.ts";
import { mapGoogleAd, mapGoogleCampaign, mapGoogleEntityStatus, mapGoogleMetrics } from "./google/sync.ts";

// ------------------------------------------------------------------ Meta

Deno.test("Meta: dinheiro decimal vira micros sem erro de arredondamento", () => {
  assertEquals(decimalToMicros("12.34"), 12_340_000);
  assertEquals(decimalToMicros("0.1"), 100_000);
  assertEquals(decimalToMicros("1234567.89"), 1_234_567_890_000);
  assertEquals(decimalToMicros("5"), 5_000_000);
  assertEquals(decimalToMicros(""), null);
  assertEquals(decimalToMicros(undefined), null);
});

Deno.test("Meta: status efetivo vira status do sistema; término no passado = encerrada", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  assertEquals(mapMetaEntityStatus("ACTIVE", null, now), "ativa");
  assertEquals(mapMetaEntityStatus("CAMPAIGN_PAUSED", null, now), "pausada");
  assertEquals(mapMetaEntityStatus("DISAPPROVED", null, now), "erro");
  assertEquals(mapMetaEntityStatus("ARCHIVED", null, now), "arquivada");
  assertEquals(mapMetaEntityStatus("ACTIVE", "2026-09-01T00:00:00-0300", now), "encerrada");
  assertEquals(mapMetaEntityStatus("PENDING_REVIEW", null, now), "desconhecida");
});

Deno.test("Meta: campanha com orçamento diário em centavos", () => {
  const c = mapMetaCampaign({ id: "1", name: " Leads ", objective: "OUTCOME_LEADS", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "5000" }, "BRL");
  assertEquals(c.budgetMicros, 50_000_000);
  assertEquals(c.budgetPeriod, "diario");
  assertEquals(c.name, "Leads");
  const noBudget = mapMetaCampaign({ id: "2", effective_status: "PAUSED" }, "BRL");
  assertEquals(noBudget.budgetMicros, null);
  assertEquals(noBudget.name, "Campanha 2");
});

Deno.test("Meta: anúncio com criativo, revisão e miniatura só https", () => {
  const a = mapMetaAd({ id: "9", adset_id: "8", campaign_id: "7", effective_status: "DISAPPROVED", creative: { object_type: "PHOTO", thumbnail_url: "http://x" } });
  assertEquals(a.creativeType, "IMAGE");
  assertEquals(a.reviewStatus, "DISAPPROVED");
  assertEquals(a.status, "erro");
  assertEquals(a.thumbnailUrl, null);
  assertEquals(mapMetaAd({ id: "10", effective_status: "ACTIVE", creative: { thumbnail_url: "https://cdn/x.jpg" } }).thumbnailUrl, "https://cdn/x.jpg");
});

Deno.test("Meta: insights do dia → leads, mensagens, compras e valor", () => {
  const m = mapMetaInsight({
    date_start: "2026-09-20", campaign_id: "7", spend: "150.25", impressions: "10000", reach: "8000", clicks: "300", inline_link_clicks: "250",
    actions: [{ action_type: "lead", value: "12" }, { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "4" }, { action_type: "omni_purchase", value: "3" }, { action_type: "purchase", value: "2" }],
    action_values: [{ action_type: "omni_purchase", value: "450.50" }],
  }, "campaign", "111");
  assertEquals(m.spendMicros, 150_250_000);
  assertEquals(m.entityExternalId, "7");
  assertEquals(m.campaignExternalId, "7");
  assertEquals([m.leads, m.messages, m.conversions], [12, 4, 3]);
  assertEquals(m.conversionValueMicros, 450_500_000);
  assertEquals(m.reach, 8000);
  assertEquals(m.linkClicks, 250);
});

Deno.test("Meta: ação ausente no dia = zero (o Meta não devolve zeros)", () => {
  const m = mapMetaInsight({ date_start: "2026-09-20", spend: "10", impressions: "100", clicks: "2" }, "account", "111");
  assertEquals([m.leads, m.messages, m.conversions, m.conversionValueMicros], [0, 0, 0, 0]);
  assertEquals(m.entityExternalId, "111");
  assertEquals(m.campaignExternalId, null);
  assertEquals(m.rawActions, null);
});

Deno.test("Meta: período dividido em janelas de até 10 dias", () => {
  assertEquals(splitRange({ from: "2026-09-01", to: "2026-09-25" }, 10), [
    { from: "2026-09-01", to: "2026-09-10" },
    { from: "2026-09-11", to: "2026-09-20" },
    { from: "2026-09-21", to: "2026-09-25" },
  ]);
  assertEquals(splitRange({ from: "2026-09-01", to: "2026-09-01" }, 10), [{ from: "2026-09-01", to: "2026-09-01" }]);
});

Deno.test("Meta: métricas diárias consultam os 4 níveis, por dia, na API oficial", async () => {
  const calls: URL[] = [];
  const fetchImpl = ((input: URL) => {
    calls.push(new URL(input));
    const level = new URL(input).searchParams.get("level");
    const data = level === "account" ? [{ date_start: "2026-09-20", spend: "10", impressions: "100", clicks: "1" }] : [];
    return Promise.resolve(new Response(JSON.stringify({ data })));
  }) as typeof fetch;
  const out = await fetchMetaDailyMetrics("tok", "111", { from: "2026-09-18", to: "2026-09-20" }, fetchImpl);
  assertEquals(calls.map((u) => u.searchParams.get("level")), ["account", "campaign", "adset", "ad"]);
  for (const u of calls) {
    assert(u.pathname.endsWith("/act_111/insights"));
    assertEquals(u.searchParams.get("time_increment"), "1");
    assertEquals(JSON.parse(u.searchParams.get("time_range")!), { since: "2026-09-18", until: "2026-09-20" });
  }
  assertEquals(out.length, 1);
  assertEquals(out[0].spendMicros, 10_000_000);
});

Deno.test("Meta: alcance de vários períodos numa chamada por nível (time_ranges)", async () => {
  const calls: URL[] = [];
  const fetchImpl = ((input: URL) => {
    const u = new URL(input);
    calls.push(u);
    const level = u.searchParams.get("level");
    const data = level === "account"
      ? [{ date_start: "2026-09-17", date_stop: "2026-09-23", reach: "12000", impressions: "30000", frequency: "2.5" }]
      : [{ campaign_id: "7", date_start: "2026-09-17", date_stop: "2026-09-23", reach: "8000", impressions: "16000", frequency: "2" }];
    return Promise.resolve(new Response(JSON.stringify({ data })));
  }) as typeof fetch;
  const out = await fetchMetaPeriodReach("tok", "111", [{ from: "2026-09-17", to: "2026-09-23" }, { from: "2026-09-10", to: "2026-09-16" }], fetchImpl);
  assertEquals(calls.length, 2);
  assertEquals(JSON.parse(calls[0].searchParams.get("time_ranges")!).length, 2);
  assertEquals(out, [
    { level: "account", entityExternalId: "111", from: "2026-09-17", to: "2026-09-23", reach: 12000, impressions: 30000, frequency: 2.5 },
    { level: "campaign", entityExternalId: "7", from: "2026-09-17", to: "2026-09-23", reach: 8000, impressions: 16000, frequency: 2 },
  ]);
});

// ------------------------------------------------------------------ Google

Deno.test("Google: status + serving_status + aprovação", () => {
  assertEquals(mapGoogleEntityStatus("ENABLED"), "ativa");
  assertEquals(mapGoogleEntityStatus("PAUSED"), "pausada");
  assertEquals(mapGoogleEntityStatus("REMOVED"), "arquivada");
  assertEquals(mapGoogleEntityStatus("ENABLED", "ENDED"), "encerrada");
  assertEquals(mapGoogleEntityStatus("ENABLED", undefined, "DISAPPROVED"), "erro");
  assertEquals(mapGoogleEntityStatus(undefined), "desconhecida");
});

Deno.test("Google: campanha com orçamento diário (micros) e tipo", () => {
  const c = mapGoogleCampaign({ campaign: { id: "55", name: "Pesquisa Marca", status: "ENABLED", servingStatus: "SERVING", advertisingChannelType: "SEARCH" }, campaignBudget: { amountMicros: "30000000", period: "DAILY" } });
  assertEquals([c.externalId, c.objective, c.status, c.budgetMicros, c.budgetPeriod], ["55", "SEARCH", "ativa", 30_000_000, "diario"]);
});

Deno.test("Google: anúncio em análise e reprovado", () => {
  const underReview = mapGoogleAd({ adGroupAd: { status: "ENABLED", ad: { id: "1", type: "RESPONSIVE_SEARCH_AD" }, policySummary: { approvalStatus: "APPROVED", reviewStatus: "REVIEW_IN_PROGRESS" } }, adGroup: { id: "2" }, campaign: { id: "3" } });
  assertEquals([underReview.reviewStatus, underReview.status, underReview.name], ["UNDER_REVIEW", "ativa", "Anúncio 1"]);
  const bad = mapGoogleAd({ adGroupAd: { status: "ENABLED", ad: { id: "4" }, policySummary: { approvalStatus: "DISAPPROVED" } }, adGroup: { id: "2" }, campaign: { id: "3" } });
  assertEquals([bad.reviewStatus, bad.status], ["DISAPPROVED", "erro"]);
});

Deno.test("Google: métricas do dia; sem leads/mensagens/alcance (null, nunca zero)", () => {
  const m = mapGoogleMetrics({ segments: { date: "2026-09-20" }, campaign: { id: "55" }, metrics: { costMicros: "45670000", impressions: "900", clicks: "30", conversions: 2.5, conversionsValue: 120.5 } }, "campaign", "1234567890");
  assertEquals([m.spendMicros, m.impressions, m.clicks, m.conversions, m.conversionValueMicros], [45_670_000, 900, 30, 2.5, 120_500_000]);
  assertEquals([m.leads, m.messages, m.reach], [null, null, null]);
  assertEquals(m.entityExternalId, "55");
  const acc = mapGoogleMetrics({ segments: { date: "2026-09-20" }, metrics: { costMicros: "0" } }, "account", "1234567890");
  assertEquals([acc.entityExternalId, acc.conversions, acc.conversionValueMicros], ["1234567890", 0, 0]);
});
