import { describe, expect, it } from "vitest";
import { formatChange, formatDate, formatKpi } from "./format.ts";

const clean = (s: string) => s.replace(/ /g, " ");

describe("formatação", () => {
  it("formata no padrão brasileiro, na moeda da conta", () => {
    expect(clean(formatKpi(1250.5, "money", "BRL"))).toBe("R$ 1.250,50");
    expect(clean(formatKpi(70, "money", "USD"))).toBe("US$ 70,00");
    expect(formatKpi(10.5, "decimal", "BRL")).toBe("10,5");
    expect(formatKpi(2, "percent", "BRL")).toBe("2,00%");
    expect(formatKpi(2.5714, "ratio", "BRL")).toBe("2,57x");
    expect(formatKpi(1234, "integer", "BRL")).toBe("1.234");
  });
  it("variação e datas", () => {
    expect(formatChange(20)).toBe("+20,0%");
    expect(formatChange(-5.34)).toBe("−5,3%");
    expect(formatChange(0)).toBe("0,0%");
    expect(formatDate("2026-09-23")).toBe("23/09/2026");
  });
});
