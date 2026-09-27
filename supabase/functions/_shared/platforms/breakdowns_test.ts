import { assertEquals } from "jsr:@std/assert@1";
import { breakdownRange } from "../sync/runner.ts";
import { addGoogleRows, cityLabel, fetchGoogleBreakdowns, googleAge, googleDevice, googleGender, googleHour } from "./google/breakdowns.ts";
import { compactActions, fetchMetaBreakdowns, metaHour } from "./meta/breakdowns.ts";
import type { BreakdownMetric } from "./types.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.test("Meta: idade e gênero numa chamada viram duas divisões somadas; ações só as que o painel usa", async () => {
  const calls: string[] = [];
  const fake = (url: string | URL | Request) => {
    const u = new URL(String(url));
    const bd = u.searchParams.get("breakdowns") ?? "";
    calls.push(bd);
    const base = { date_start: "2026-09-20", date_stop: "2026-09-20" };
    if (bd === "age,gender") {
      return Promise.resolve(json({ data: [
        { ...base, age: "25-34", gender: "female", spend: "10.00", impressions: "1000", clicks: "20", inline_link_clicks: "15",
          actions: [{ action_type: "lead", value: "2" }, { action_type: "offsite_content_view_add_meta_leads", value: "9" }] },
        { ...base, age: "25-34", gender: "male", spend: "5.50", impressions: "400", clicks: "8", actions: [{ action_type: "lead", value: "1" }] },
        { ...base, age: "Unknown", gender: "unknown", spend: "1.00", impressions: "50", clicks: "0" },
      ] }));
    }
    if (bd === "hourly_stats_aggregated_by_advertiser_time_zone") {
      return Promise.resolve(json({ data: [{ ...base, hourly_stats_aggregated_by_advertiser_time_zone: "09:00:00 - 09:59:59", spend: "3", impressions: "10", clicks: "1" }] }));
    }
    if (bd === "region") return Promise.resolve(json({ error: { message: "(#100) region not supported", code: 100 } }, 400));
    return Promise.resolve(json({ data: [] }));
  };
  const out = await fetchMetaBreakdowns("tok", "123", { from: "2026-09-20", to: "2026-09-20" }, fake as typeof fetch);
  assertEquals(calls, ["age,gender", "publisher_platform", "device_platform", "hourly_stats_aggregated_by_advertiser_time_zone", "region"]);
  const find = (d: string, v: string) => out.rows.find((r) => r.dimension === d && r.value === v)!;
  assertEquals(find("age", "25-34").spendMicros, 15_500_000);
  assertEquals(find("age", "25-34").leads, 3);
  assertEquals(find("age", "25-34").actions, { lead: 3 });
  assertEquals(find("gender", "female").impressions, 1000);
  assertEquals(find("gender", "unknown").spendMicros, 1_000_000);
  assertEquals(find("age", "unknown").impressions, 50);
  assertEquals(find("hour", "09").spendMicros, 3_000_000);
  // Estado recusado: fica de fora (os números antigos dele não são mexidos).
  assertEquals(out.dimensions, ["age", "gender", "publisher_platform", "device", "hour"]);
  assertEquals(out.failed.map((f) => f.dimension), ["region"]);
});

Deno.test("Meta: horário e ações", () => {
  assertEquals(metaHour("23:00:00 - 23:59:59"), "23");
  assertEquals(metaHour(undefined), "unknown");
  assertEquals(compactActions({ actions: [{ action_type: "omni_purchase", value: "2" }, { action_type: "xyz_calls", value: "5" }, { action_type: "offsite_conversion.custom.123", value: "1" }] }),
    { omni_purchase: 2, "offsite_conversion.custom.123": 1 });
  assertEquals(compactActions({}), null);
});

Deno.test("Google: valores normalizados", () => {
  assertEquals(googleAge("AGE_RANGE_65_UP"), "65+");
  assertEquals(googleAge("AGE_RANGE_UNDETERMINED"), "unknown");
  assertEquals(googleGender("FEMALE"), "female");
  assertEquals(googleDevice("MOBILE"), "mobile");
  assertEquals(googleDevice("UNKNOWN"), "unknown");
  assertEquals(googleHour(7), "07");
  assertEquals(googleHour("x"), "unknown");
  assertEquals(cityLabel("São Paulo", "São Paulo,State of Sao Paulo,Brazil"), "São Paulo (State of Sao Paulo)");
  assertEquals(cityLabel(undefined, "x"), null);
});

Deno.test("Google: soma grupos de anúncio da mesma idade e troca o id da cidade pelo nome", async () => {
  const target = new Map<string, BreakdownMetric>();
  addGoogleRows(target, "age", [
    { segments: { date: "2026-09-20" }, adGroupCriterion: { ageRange: { type: "AGE_RANGE_25_34" } }, metrics: { costMicros: "1000000", impressions: "10", clicks: "1", conversions: 0.5 } },
    { segments: { date: "2026-09-20" }, adGroupCriterion: { ageRange: { type: "AGE_RANGE_25_34" } }, metrics: { costMicros: "2000000", impressions: "5", clicks: "2", conversions: 1 } },
  ], (r) => googleAge(r.adGroupCriterion?.ageRange?.type));
  const row = [...target.values()][0];
  assertEquals([row.spendMicros, row.impressions, row.conversions, row.leads], [3_000_000, 15, 1.5, null]);

  const queries: string[] = [];
  const fake = (_url: string | URL | Request, init?: RequestInit) => {
    const q = JSON.parse(String(init?.body)).query as string;
    queries.push(q);
    if (q.includes("FROM geographic_view")) {
      return Promise.resolve(json({ results: [
        { segments: { date: "2026-09-20", geoTargetCity: "geoTargetConstants/1001773" }, metrics: { costMicros: "5000000", impressions: "100", clicks: "4" } },
        { segments: { date: "2026-09-20" }, metrics: { costMicros: "1000000", impressions: "10", clicks: "0" } },
      ] }));
    }
    if (q.includes("FROM geo_target_constant")) {
      return Promise.resolve(json({ results: [{ geoTargetConstant: { resourceName: "geoTargetConstants/1001773", name: "São Paulo", canonicalName: "São Paulo,State of Sao Paulo,Brazil" } }] }));
    }
    return Promise.resolve(json({ results: [] }));
  };
  Deno.env.set("GOOGLE_ADS_DEVELOPER_TOKEN", "dev");
  const out = await fetchGoogleBreakdowns("1234567890", { from: "2026-09-20", to: "2026-09-20" }, { accessToken: "t", fetchImpl: fake as typeof fetch });
  assertEquals(out.dimensions, ["age", "gender", "device", "hour", "city"]);
  assertEquals(out.rows.filter((r) => r.dimension === "city").map((r) => [r.value, r.spendMicros]), [["São Paulo (State of Sao Paulo)", 5_000_000], ["unknown", 1_000_000]]);
  assertEquals(queries.some((q) => q.includes("LOCATION_OF_PRESENCE")), true);
});

Deno.test("divisões: 30 dias na primeira vez, depois no máximo a cada 6 horas", () => {
  const now = new Date("2026-09-27T15:00:00Z");
  const sync = { from: "2026-09-21", to: "2026-09-27" };
  assertEquals(breakdownRange(null, "America/Sao_Paulo", now, sync), { from: "2026-08-29", to: "2026-09-27" });
  const cov = { from: "2026-08-29", to: "2026-09-27", syncedAt: "2026-09-27T12:00:00Z" };
  assertEquals(breakdownRange(cov, "America/Sao_Paulo", now, sync), null);
  assertEquals(breakdownRange({ ...cov, syncedAt: "2026-09-27T08:00:00Z" }, "America/Sao_Paulo", now, sync), sync);
  // Parou por dias: continua de onde parou.
  assertEquals(breakdownRange({ ...cov, to: "2026-09-15", syncedAt: "2026-09-15T08:00:00Z" }, "America/Sao_Paulo", now, sync), { from: "2026-09-15", to: "2026-09-27" });
  // Cobertura menor que 30 dias: completa.
  assertEquals(breakdownRange({ ...cov, from: "2026-09-20", syncedAt: "2026-09-27T14:00:00Z" }, "America/Sao_Paulo", now, sync), { from: "2026-08-29", to: "2026-09-27" });
});
