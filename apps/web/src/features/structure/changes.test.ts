import { describe, expect, it } from "vitest";
import { describeChange } from "./changes.ts";

const base = { id: 1, source: "sync", changed_at: null, detected_at: "2026-09-24T10:00:00Z" };
const clean = (s: string) => s.replace(/ /g, " ");

describe("histórico de alterações", () => {
  it("traduz campos e valores", () => {
    expect(describeChange({ ...base, field: "status", old_value: "ativa", new_value: "pausada" }, "BRL"))
      .toEqual({ label: "Status", from: "Ativa", to: "Pausada" });
    const b = describeChange({ ...base, field: "budget_micros", old_value: 50_000_000, new_value: 80_000_000 }, "BRL");
    expect([b.label, clean(b.from), clean(b.to)]).toEqual(["Orçamento", "R$ 50,00", "R$ 80,00"]);
    expect(describeChange({ ...base, field: "review_status", old_value: null, new_value: "DISAPPROVED" }, null))
      .toEqual({ label: "Revisão", from: "(vazio)", to: "Reprovado" });
    expect(describeChange({ ...base, field: "end_date", old_value: "2026-09-30", new_value: "2026-10-31" }, "BRL").to).toBe("31/10/2026");
  });
  it("campo desconhecido aparece como veio", () => {
    expect(describeChange({ ...base, field: "novo_campo", old_value: 1, new_value: 2 }, "BRL")).toEqual({ label: "novo_campo", from: "1", to: "2" });
  });
});
