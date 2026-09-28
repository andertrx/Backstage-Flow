import { describe, expect, it } from "vitest";
import { opsCleanViewFilters, opsDashboardRange, opsViewNameError } from "./dashboard.ts";

describe("Visões salvas", () => {
  it("guarda só filtros conhecidos e valores simples", () => {
    expect(opsCleanViewFilters({ sector_id: " s1 ", due: "", archived: false, overdue: true, priorities: ["alta", "", 3], hack: "x", obj: { a: 1 } },
      ["sector_id", "due", "archived", "overdue", "priorities", "obj"])).toEqual({ sector_id: "s1", overdue: true, priorities: ["alta"] });
  });

  it("ignora o que não é objeto", () => {
    expect(opsCleanViewFilters(null, ["a"])).toEqual({});
    expect(opsCleanViewFilters(["a"] as unknown as Record<string, unknown>, ["0"])).toEqual({});
  });

  it("confere o nome", () => {
    expect(opsViewNameError("  ")).toBe("Dê um nome à visão.");
    expect(opsViewNameError("x".repeat(61))).toBe("Use até 60 letras.");
    expect(opsViewNameError(" Atrasadas do Design ")).toBeNull();
  });
});

describe("Período do painel", () => {
  it("conta hoje como o último dia", () => {
    expect(opsDashboardRange(30, "2026-09-28")).toEqual({ from: "2026-08-30", to: "2026-09-28" });
    expect(opsDashboardRange(7, "2026-03-02")).toEqual({ from: "2026-02-24", to: "2026-03-02" });
    expect(opsDashboardRange(1, "2026-09-28")).toEqual({ from: "2026-09-28", to: "2026-09-28" });
  });
});
