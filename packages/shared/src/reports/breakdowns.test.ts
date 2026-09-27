import { describe, expect, it } from "vitest";
import { type BreakdownRow, breakdownItems, breakdownLabel, coverageGap, defaultBreakdownMetric } from "./breakdowns.ts";

const row = (dimension: BreakdownRow["dimension"], value: string, spend: number, leads: number | null, impressions = 100): BreakdownRow => ({
  ad_account_id: "a", dimension, value, spend_micros: spend * 1_000_000, impressions, clicks: 10, link_clicks: 5,
  leads, messages: null, conversions: null, conversion_value_micros: null, actions: leads == null ? null : { lead: leads },
});
const LEADS = { source: "leads" as const, label: "Leads" };

describe("divisões", () => {
  it("idade na ordem das faixas, não informado por último, com fatia e custo", () => {
    const items = breakdownItems([row("age", "35-44", 30, 3), row("age", "unknown", 5, 0), row("age", "18-24", 20, 1)], "age", "result", LEADS);
    expect(items.map((i) => i.label)).toEqual(["18-24", "35-44", "Não informado"]);
    expect(items[1].share).toBeCloseTo(75);
    expect(items[1].costPerResult).toBe(10);
    expect(items[0].ctr).toBe(5);
  });

  it("horário sempre com as 24 horas (zero onde não houve entrega)", () => {
    const items = breakdownItems([row("hour", "09", 10, 2), row("hour", "21", 5, 1)], "hour", "spend", LEADS);
    expect(items).toHaveLength(24);
    expect(items[9].amount).toBe(10);
    expect(items[0].amount).toBe(0);
    expect(items[21].share).toBeCloseTo(33.33, 1);
  });

  it("localização: 10 maiores + Outros (soma honesta)", () => {
    const rows = Array.from({ length: 13 }, (_, i) => row("region", `Estado ${i}`, 13 - i, 1));
    const items = breakdownItems(rows, "region", "spend", LEADS);
    expect(items).toHaveLength(11);
    expect(items[10]).toMatchObject({ label: "Outros (3)", amount: 3 + 2 + 1, result: 3 });
  });

  it("nomes em português", () => {
    expect(breakdownLabel("gender", "female")).toBe("Mulheres");
    expect(breakdownLabel("publisher_platform", "instagram")).toBe("Instagram");
    expect(breakdownLabel("device", "mobile_app")).toBe("Celular (aplicativo)");
    expect(breakdownLabel("hour", "07")).toBe("07h");
    expect(breakdownLabel("city", "unknown")).toBe("Não informado");
  });

  it("métrica padrão e cobertura do período", () => {
    expect(defaultBreakdownMetric([row("age", "18-24", 10, 0)], LEADS)).toBe("impressions");
    expect(defaultBreakdownMetric([row("age", "18-24", 10, 2)], LEADS)).toBe("result");
    expect(coverageGap({ from: "2026-09-01", to: "2026-09-07" }, null)).toEqual({ kind: "none" });
    expect(coverageGap({ from: "2026-09-01", to: "2026-09-07" }, { covered_from: "2026-08-01", covered_to: "2026-09-27" })).toEqual({ kind: "full" });
    expect(coverageGap({ from: "2026-09-01", to: "2026-09-07" }, { covered_from: "2026-09-04", covered_to: "2026-09-27" })).toEqual({ kind: "partial", from: "2026-09-04" });
  });
});
