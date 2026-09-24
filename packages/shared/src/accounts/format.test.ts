import { describe, expect, it } from "vitest";
import { formatAccountId } from "./format.ts";

describe("formatAccountId", () => {
  it("Meta usa o prefixo act_", () => expect(formatAccountId("meta", "123")).toBe("act_123"));
  it("Google usa 123-456-7890", () => expect(formatAccountId("google", "1234567890")).toBe("123-456-7890"));
  it("mantém IDs fora do padrão", () => expect(formatAccountId("google", "12")).toBe("12"));
});
