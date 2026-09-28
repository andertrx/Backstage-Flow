import { describe, expect, it } from "vitest";
import { opsSumByCurrency } from "./commercial.ts";

describe("Kanban comercial", () => {
  it("soma o valor potencial por moeda, sem misturar BRL com USD", () => {
    expect(opsSumByCurrency([
      { potential_value: "1500.50", currency: "BRL" }, { potential_value: 200, currency: "USD" },
      { potential_value: 99.5, currency: "BRL" }, { potential_value: null, currency: "BRL" },
    ])).toEqual({ BRL: 1600, USD: 200 });
    expect(opsSumByCurrency([])).toEqual({});
  });
});
