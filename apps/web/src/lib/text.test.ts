import { describe, expect, it } from "vitest";
import { searchable } from "./text.ts";

describe("searchable", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(searchable("  Açaí da ESQUINA ")).toBe("acai da esquina");
    expect(searchable(null)).toBe("");
  });
});
