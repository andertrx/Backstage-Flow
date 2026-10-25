import { describe, expect, it } from "vitest";
import { extractMessageValue, matchTriggers, normalizeTriggerText, normalizeWhatsAppNumber, type WaTrigger } from "./waTriggers.ts";

const T: WaTrigger[] = [
  { id: "v", phrase: "Parabéns pela sua compra", kind: "venda", currency: "BRL" },
  { id: "l", phrase: "cadastro de lojista", kind: "perfil", currency: "BRL" },
  { id: "q", phrase: "orçamento enviado", kind: "etapa", currency: "BRL" },
];

describe("frases do WhatsApp (como no Tintim)", () => {
  it("compara sem acento, maiúscula ou pontuação", () => {
    expect(normalizeTriggerText("  Orçamento ENVIADO!! ")).toBe(" orcamento enviado ");
    expect(matchTriggers("Prontinho, orcamento enviado.", T)).toEqual([{ trigger_id: "q", kind: "etapa" }]);
    expect(matchTriggers("Oi, tudo bem?", T)).toEqual([]);
  });

  it("frase só vale inteira (não pega pedaço de palavra)", () => {
    expect(matchTriggers("subcadastro de lojistas", T)).toEqual([]);
  });

  it("venda lê o valor da própria mensagem", () => {
    expect(matchTriggers("Parabéns pela sua compra de R$ 1.297,50! Pedido 4455.", T)).toEqual([{ trigger_id: "v", kind: "venda", value: 1297.5, currency: "BRL" }]);
    expect(matchTriggers("parabens pela sua compra, foram 297 reais", T)[0]).toMatchObject({ value: 297, currency: "BRL" });
    expect(matchTriggers("Parabéns pela sua compra de US$ 50.00", T)[0]).toMatchObject({ value: 50, currency: "USD" });
  });

  it("número solto não vira valor (nada inventado)", () => {
    expect(matchTriggers("Parabéns pela sua compra! Pedido 4455", T)).toEqual([{ trigger_id: "v", kind: "venda" }]);
    expect(extractMessageValue("me liga no 45 99999-8888")).toBeNull();
  });

  it("perfil e venda na mesma mensagem: perfil primeiro; uma venda só", () => {
    const two: WaTrigger[] = [...T, { id: "v2", phrase: "compra confirmada", kind: "venda", currency: "BRL" }];
    const r = matchTriggers("Cadastro de lojista ok. Parabéns pela sua compra de R$ 500, compra confirmada", two);
    expect(r.map((m) => m.trigger_id)).toEqual(["l", "v"]);
  });

  it("número do WhatsApp sem o 9 ganha o 9 (Brasil)", () => {
    expect(normalizeWhatsAppNumber("554599998888")).toBe("5545999998888");
    expect(normalizeWhatsAppNumber("5545999998888")).toBe("5545999998888");
    expect(normalizeWhatsAppNumber("554532221111")).toBe("554532221111");
    expect(normalizeWhatsAppNumber("14155550123")).toBe("14155550123");
  });
});
