import { describe, expect, it } from "vitest";
import { describeVerify } from "./api.ts";

describe("verificar saldo: mensagem com cache", () => {
  it("sem cache", () => {
    expect(describeVerify([{ adAccountId: "a", ok: true }, { adAccountId: "b", ok: true }])).toBe("2 contas verificadas.");
  });
  it("parte do cache", () => {
    expect(describeVerify([{ adAccountId: "a", ok: true }, { adAccountId: "b", ok: true, cached: true }]))
      .toBe("2 contas verificadas: 1 consultada agora no Meta/Google e 1 já tinha saldo de menos de 10 minutos (usamos o que estava guardado).");
  });
  it("tudo do cache", () => {
    expect(describeVerify([{ adAccountId: "a", ok: true, cached: true }]))
      .toBe("1 conta verificada: 1 já tinha saldo de menos de 10 minutos (usamos o que estava guardado).");
  });
});
