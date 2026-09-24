import { describe, expect, it } from "vitest";
import { parseCompare, writeCompare } from "./compareParams.ts";

describe("escolha da comparação no endereço", () => {
  it("padrão = período anterior", () => {
    expect(parseCompare(new URLSearchParams())).toEqual({ mode: "previous", from: null, to: null });
    expect(parseCompare(new URLSearchParams("comparar=xyz")).mode).toBe("previous");
  });
  it("lê os modos", () => {
    expect(parseCompare(new URLSearchParams("comparar=ano")).mode).toBe("previous_year");
    expect(parseCompare(new URLSearchParams("comparar=mes")).mode).toBe("previous_month");
  });
  it("personalizado só aceita datas válidas", () => {
    expect(parseCompare(new URLSearchParams("comparar=personalizado&comp_de=2026-07-01&comp_ate=2026-07-31")))
      .toEqual({ mode: "custom", from: "2026-07-01", to: "2026-07-31" });
    expect(parseCompare(new URLSearchParams("comparar=personalizado&comp_de=2026-07-31&comp_ate=2026-07-01")))
      .toEqual({ mode: "custom", from: null, to: null });
  });
  it("grava sem apagar os filtros", () => {
    const next = writeCompare(new URLSearchParams("periodo=this_month&comparar=ano"), { mode: "custom", from: "2026-07-01", to: "2026-07-31" });
    expect(next.toString()).toBe("periodo=this_month&comparar=personalizado&comp_de=2026-07-01&comp_ate=2026-07-31");
    expect(writeCompare(next, { mode: "previous", from: null, to: null }).toString()).toBe("periodo=this_month");
  });
});
