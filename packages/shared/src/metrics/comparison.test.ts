import { describe, expect, it } from "vitest";
import { COMPARISON_DEFINITIONS, compareMetric, compareRange, rangesOverlap, sameLength } from "./comparison.ts";

const cur = { from: "2026-09-01", to: "2026-09-23" };
const def = (key: string) => COMPARISON_DEFINITIONS.find((d) => d.key === key)!;

describe("compareRange", () => {
  it("período anterior com a mesma quantidade de dias (exemplo do pedido)", () => {
    expect(compareRange("previous", cur)).toEqual({ from: "2026-08-09", to: "2026-08-31" });
  });
  it("mesmos dias do mês anterior", () => {
    expect(compareRange("previous_month", cur)).toEqual({ from: "2026-08-01", to: "2026-08-23" });
    expect(compareRange("previous_month", { from: "2026-03-31", to: "2026-03-31" })).toEqual({ from: "2026-02-28", to: "2026-02-28" });
  });
  it("mesmo período do ano anterior (29/02 vira 28/02)", () => {
    expect(compareRange("previous_year", cur)).toEqual({ from: "2025-09-01", to: "2025-09-23" });
    expect(compareRange("previous_year", { from: "2028-02-29", to: "2028-02-29" })).toEqual({ from: "2027-02-28", to: "2027-02-28" });
  });
  it("personalizado usa as datas escolhidas; datas inválidas caem no anterior", () => {
    expect(compareRange("custom", cur, { from: "2026-07-01", to: "2026-07-31" })).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(compareRange("custom", cur, { from: "2026-07-31", to: "2026-07-01" })).toEqual({ from: "2026-08-09", to: "2026-08-31" });
    expect(compareRange("custom", cur, null)).toEqual({ from: "2026-08-09", to: "2026-08-31" });
  });
});

describe("avisos de períodos", () => {
  it("sobreposição e tamanho", () => {
    expect(rangesOverlap(cur, { from: "2026-08-20", to: "2026-09-02" })).toBe(true);
    expect(rangesOverlap(cur, { from: "2026-08-09", to: "2026-08-31" })).toBe(false);
    expect(sameLength(cur, { from: "2026-08-09", to: "2026-08-31" })).toBe(true);
    expect(sameLength(cur, { from: "2026-08-01", to: "2026-08-31" })).toBe(false);
  });
});

describe("compareMetric", () => {
  it("diferença absoluta e percentual", () => {
    expect(compareMetric(120, 100, def("spend"))).toMatchObject({ difference: 20, percent: 20, trend: "up", tone: "neutral" });
  });
  it("custo que sobe é piora; que cai é melhora", () => {
    expect(compareMetric(12, 10, def("cpl")).tone).toBe("bad");
    expect(compareMetric(8, 10, def("cpl"))).toMatchObject({ difference: -2, percent: -20, tone: "good" });
  });
  it("CTR: diferença em pontos percentuais", () => {
    const r = compareMetric(2.5, 2, def("ctr"));
    expect(r.difference).toBeCloseTo(0.5);
    expect(r.percent).toBeCloseTo(25);
    expect(r.tone).toBe("good");
  });
  it("sem um dos valores não inventa diferença", () => {
    expect(compareMetric(10, null, def("leads"))).toMatchObject({ difference: null, percent: null });
    expect(compareMetric(null, 10, def("leads"))).toMatchObject({ difference: null, percent: null });
  });
  it("anterior zero: diferença existe, percentual não", () => {
    expect(compareMetric(5, 0, def("leads"))).toMatchObject({ difference: 5, percent: null });
  });
  it("ordem e métricas pedidas", () => {
    expect(COMPARISON_DEFINITIONS.map((d) => d.label)).toEqual(["Investimento", "Leads", "CPL", "CTR", "CPC", "CPM", "Conversões", "ROAS"]);
  });
});
