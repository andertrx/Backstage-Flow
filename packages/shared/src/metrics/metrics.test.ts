import { describe, expect, it } from "vitest";
import { amountToMicros, cpa, cpc, cpl, cpm, ctr, frequency, microsToAmount, percentChange, roas } from "./formulas.ts";
import { addMonths, daysInRange, isValidRange, previousPeriod, resolvePeriod, samePeriodLastYear, todayIn } from "./periods.ts";

describe("fórmulas", () => {
  it("calcula com micros", () => {
    expect(microsToAmount(12_340_000)).toBe(12.34);
    expect(amountToMicros(12.34)).toBe(12_340_000);
    expect(ctr(5, 200)).toBe(2.5);
    expect(cpc(10_000_000, 4)).toBe(2.5);
    expect(cpm(5_000_000, 1000)).toBe(5);
    expect(cpl(100_000_000, 8)).toBe(12.5);
    expect(cpa(90_000_000, 3)).toBe(30);
    expect(roas(350_000_000, 100_000_000)).toBe(3.5);
    expect(frequency(3000, 1000)).toBe(3);
  });

  it("retorna null quando não dá para calcular (nunca inventa)", () => {
    expect(ctr(0, 0)).toBeNull();
    expect(cpl(100_000_000, 0)).toBeNull();
    expect(cpl(100_000_000, null)).toBeNull();
    expect(roas(null, 1_000_000)).toBeNull();
    expect(frequency(100, null)).toBeNull();
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(null, 10)).toBeNull();
  });

  it("zero de verdade continua zero", () => {
    expect(cpl(0, 5)).toBe(0);
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
  });
});

describe("períodos", () => {
  // 24/09/2026 01:30 UTC = 23/09/2026 22:30 em São Paulo.
  const now = new Date("2026-09-24T01:30:00Z");

  it("respeita o fuso horário", () => {
    expect(todayIn("America/Sao_Paulo", now)).toBe("2026-09-23");
    expect(todayIn("UTC", now)).toBe("2026-09-24");
  });

  it("resolve os períodos prontos sem incluir hoje nos 'últimos N dias'", () => {
    expect(resolvePeriod("today", "America/Sao_Paulo", now)).toEqual({ from: "2026-09-23", to: "2026-09-23" });
    expect(resolvePeriod("yesterday", "America/Sao_Paulo", now)).toEqual({ from: "2026-09-22", to: "2026-09-22" });
    const last7 = resolvePeriod("last_7_days", "America/Sao_Paulo", now);
    expect(last7).toEqual({ from: "2026-09-16", to: "2026-09-22" });
    expect(daysInRange(last7)).toBe(7);
    expect(daysInRange(resolvePeriod("last_30_days", "America/Sao_Paulo", now))).toBe(30);
    expect(resolvePeriod("this_month", "America/Sao_Paulo", now)).toEqual({ from: "2026-09-01", to: "2026-09-23" });
    expect(resolvePeriod("last_month", "America/Sao_Paulo", now)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });

  it("mês anterior em janeiro volta para dezembro do ano anterior", () => {
    expect(resolvePeriod("last_month", "UTC", new Date("2027-01-15T12:00:00Z"))).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("compara com período anterior e com o ano anterior", () => {
    expect(previousPeriod({ from: "2026-09-16", to: "2026-09-22" })).toEqual({ from: "2026-09-09", to: "2026-09-15" });
    expect(samePeriodLastYear({ from: "2028-02-01", to: "2028-02-29" })).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("recusa datas inválidas", () => {
    expect(isValidRange({ from: "2026-02-30", to: "2026-03-01" })).toBe(false);
    expect(isValidRange({ from: "2026-09-10", to: "2026-09-01" })).toBe(false);
    expect(isValidRange({ from: "2026-09-01", to: "2026-09-01" })).toBe(true);
  });
});
