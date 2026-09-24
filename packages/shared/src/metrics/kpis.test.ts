import { describe, expect, it } from "vitest";
import { computeKpis, KPI_DEFINITIONS, kpiVariation } from "./kpis.ts";
import { comparisonPeriod } from "./periods.ts";

const base = { spend_micros: 350_000_000, impressions: 35_000, clicks: 700, leads: 30, messages: 10, conversions: 35, conversion_value_micros: 900_000_000 };

describe("indicadores", () => {
  it("calcula a partir dos totais", () => {
    const k = computeKpis(base);
    expect(k.spend).toBe(350);
    expect(k.cpl).toBeCloseTo(11.6667, 3);
    expect(k.cpc).toBe(0.5);
    expect(k.cpm).toBe(10);
    expect(k.ctr).toBe(2);
    expect(k.roas).toBeCloseTo(2.5714, 3);
  });

  it("não inventa: sem leads, sem valor de conversão ou sem dados → null", () => {
    const k = computeKpis({ ...base, leads: null, messages: null, conversion_value_micros: 0 });
    expect(k.leads).toBeNull();
    expect(k.cpl).toBeNull();
    expect(k.messages).toBeNull();
    expect(k.roas).toBeNull();
    expect(computeKpis({ ...base, impressions: 0, clicks: 0 }).ctr).toBeNull();
  });

  it("alcance, frequência e CPA", () => {
    const k = computeKpis({ ...base, reach: 14_000 });
    expect(k.reach).toBe(14_000);
    expect(k.frequency).toBe(2.5);
    expect(k.impressions).toBe(35_000);
    expect(k.clicks).toBe(700);
    expect(k.cpa).toBe(10);
    // Frequência informada pela plataforma tem prioridade
    expect(computeKpis({ ...base, reach: 14_000, frequency: 2.4817 }).frequency).toBe(2.4817);
  });

  it("sem alcance do período: alcance e frequência ficam indisponíveis (nunca somados)", () => {
    const k = computeKpis(base);
    expect(k.reach).toBeNull();
    expect(k.frequency).toBeNull();
    expect(computeKpis({ ...base, conversions: 0 }).cpa).toBeNull();
  });

  it("todos os cards têm explicação", () => {
    expect(KPI_DEFINITIONS).toHaveLength(14);
    expect(new Set(KPI_DEFINITIONS.map((d) => d.key)).size).toBe(14);
    for (const d of KPI_DEFINITIONS) expect(d.description.length).toBeGreaterThan(20);
  });
});

describe("variação", () => {
  it("custo subindo é ruim; leads subindo é bom; investimento é neutro", () => {
    expect(kpiVariation(12, 10, "down")).toEqual({ percent: 20, trend: "up", tone: "bad" });
    expect(kpiVariation(8, 10, "down").tone).toBe("good");
    expect(kpiVariation(15, 10, "up")).toEqual({ percent: 50, trend: "up", tone: "good" });
    expect(kpiVariation(15, 10, "neutral").tone).toBe("neutral");
  });

  it("sem base de comparação → sem variação", () => {
    expect(kpiVariation(10, 0, "up")).toEqual({ percent: null, trend: null, tone: "neutral" });
    expect(kpiVariation(10, null, "up").percent).toBeNull();
    expect(kpiVariation(10, 10, "up")).toEqual({ percent: 0, trend: "flat", tone: "neutral" });
  });
});

describe("período de comparação", () => {
  it("mês atual compara com os mesmos dias do mês anterior", () => {
    expect(comparisonPeriod("this_month", { from: "2026-09-01", to: "2026-09-23" })).toEqual({ from: "2026-08-01", to: "2026-08-23" });
    expect(comparisonPeriod("this_month", { from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("mês anterior compara com o mês antes dele", () => {
    expect(comparisonPeriod("last_month", { from: "2026-08-01", to: "2026-08-31" })).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });
  it("demais: mesmo número de dias imediatamente antes", () => {
    expect(comparisonPeriod("yesterday", { from: "2026-09-22", to: "2026-09-22" })).toEqual({ from: "2026-09-21", to: "2026-09-21" });
    expect(comparisonPeriod("custom", { from: "2026-09-01", to: "2026-09-10" })).toEqual({ from: "2026-08-22", to: "2026-08-31" });
  });
});
