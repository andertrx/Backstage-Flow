import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "./cnpj.ts";
import { formatPhone, isValidPhone, normalizePhone } from "./phone.ts";

describe("CNPJ", () => {
  it("normaliza pontuação e caixa", () => {
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });

  it("valida CNPJ numérico", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });

  it("valida o novo CNPJ alfanumérico (exemplo oficial da Receita)", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
  });

  it("recusa sequências repetidas e tamanhos errados", () => {
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
    expect(isValidCnpj("11222333000181X")).toBe(false);
  });

  it("formata para exibição", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
});

describe("telefone", () => {
  it("acrescenta 55 em números brasileiros sem DDI", () => {
    expect(normalizePhone("(45) 99999-8888")).toBe("5545999998888");
    expect(normalizePhone("(45) 3333-4444")).toBe("554533334444");
  });

  it("mantém números que já têm DDI", () => {
    expect(normalizePhone("+1 415 555 2671")).toBe("14155552671");
  });

  it("valida tamanho", () => {
    expect(isValidPhone("(45) 99999-8888")).toBe(true);
    expect(isValidPhone("1234")).toBe(false);
  });

  it("formata para exibição", () => {
    expect(formatPhone("5545999998888")).toBe("+55 (45) 99999-8888");
    expect(formatPhone("554533334444")).toBe("+55 (45) 3333-4444");
    expect(formatPhone("14155552671")).toBe("+14155552671");
  });
});
