import { describe, expect, it } from "vitest";
import { bucketsFor, buildSeries, CHART_METRICS, type SeriesRow } from "./series.ts";

const metric = (k: string) => CHART_METRICS.find((m) => m.key === k)!;
const M = 1_000_000;
const row = (bucket: string, v: Partial<SeriesRow>): SeriesRow => ({
  bucket, platform_id: null, currency: "BRL", spend_micros: 0, impressions: 0, clicks: 0, leads: null, messages: null,
  conversions: null, conversion_value_micros: null, reach: null, ...v,
});

describe("períodos do gráfico", () => {
  it("diário: um ponto por dia", () => {
    expect(bucketsFor({ from: "2026-09-29", to: "2026-10-02" }, "day").map((b) => b.key)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
  it("semanal: segunda a domingo, recortado no intervalo", () => {
    const b = bucketsFor({ from: "2026-09-10", to: "2026-09-23" }, "week");
    expect(b).toEqual([
      { key: "2026-09-07", from: "2026-09-10", to: "2026-09-13" },
      { key: "2026-09-14", from: "2026-09-14", to: "2026-09-20" },
      { key: "2026-09-21", from: "2026-09-21", to: "2026-09-23" },
    ]);
  });
  it("mensal: vira o ano", () => {
    expect(bucketsFor({ from: "2026-11-15", to: "2027-01-10" }, "month")).toEqual([
      { key: "2026-11-01", from: "2026-11-15", to: "2026-11-30" },
      { key: "2026-12-01", from: "2026-12-01", to: "2026-12-31" },
      { key: "2027-01-01", from: "2027-01-01", to: "2027-01-10" },
    ]);
  });
});

describe("linhas do gráfico", () => {
  const buckets = bucketsFor({ from: "2026-09-07", to: "2026-09-09" }, "day");
  const rows = [
    row("2026-09-07", { spend_micros: 100 * M, leads: 10, clicks: 200, impressions: 10000 }),
    row("2026-09-09", { spend_micros: 50 * M, leads: 0, clicks: 0, impressions: 0 }),
    row("2026-09-07", { currency: "USD", spend_micros: 7 * M }),
  ];

  it("dia sem dados fica vazio (a linha é interrompida)", () => {
    const [s] = buildSeries(rows, buckets, metric("spend"), "BRL", false);
    expect(s.points.map((p) => p.value)).toEqual([100, null, 50]);
  });
  it("taxas sem divisor ficam vazias; moedas não se misturam", () => {
    expect(buildSeries(rows, buckets, metric("cpl"), "BRL", false)[0].points.map((p) => p.value)).toEqual([10, null, null]);
    expect(buildSeries(rows, buckets, metric("ctr"), "BRL", false)[0].points[0].value).toBe(2);
    expect(buildSeries(rows, buckets, metric("spend"), "USD", false)[0].points[0].value).toBe(7);
  });
  it("separado por plataforma: uma linha para cada", () => {
    const split = [
      row("2026-09-07", { platform_id: "meta", spend_micros: 60 * M }),
      row("2026-09-07", { platform_id: "google", spend_micros: 40 * M }),
    ];
    const series = buildSeries(split, buckets, metric("spend"), "BRL", true);
    expect(series.map((s) => [s.key, s.points[0].value])).toEqual([["google", 40], ["meta", 60]]);
  });
  it("tem as 11 métricas pedidas + mensagens", () => {
    expect(CHART_METRICS.map((m) => m.label)).toEqual(
      ["Investimento", "Leads", "CPL", "Cliques", "CTR", "CPM", "CPC", "Conversões", "ROAS", "Alcance", "Impressões", "Mensagens"],
    );
  });
});
