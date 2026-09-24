import { describe, expect, it } from "vitest";
import { emptyClientForm, parseClientForm } from "./form.ts";

describe("formulário de cliente", () => {
  it("exige o nome", () => {
    expect(parseClientForm(emptyClientForm)).toEqual({ error: "Informe o nome do cliente." });
  });

  it("aceita só o nome e transforma campos vazios em null", () => {
    const result = parseClientForm({ ...emptyClientForm, name: "  Excalibur Fitness  " });
    expect(result).toEqual({
      data: {
        name: "Excalibur Fitness",
        company: null,
        cnpj: null,
        owner_name: null,
        phone: null,
        email: null,
        notes: null,
        status: "ativo",
        timezone: "America/Sao_Paulo",
      },
    });
  });

  it("normaliza CNPJ, telefone e e-mail", () => {
    const result = parseClientForm({
      ...emptyClientForm,
      name: "Excalibur",
      cnpj: "11.222.333/0001-81",
      phone: "(45) 99999-8888",
      email: "Contato@Excalibur.com.br",
    });
    expect("data" in result && result.data).toMatchObject({
      cnpj: "11222333000181",
      phone: "5545999998888",
      email: "contato@excalibur.com.br",
    });
  });

  it("mostra mensagens claras para dados inválidos", () => {
    expect(parseClientForm({ ...emptyClientForm, name: "X Y", cnpj: "11.222.333/0001-82" })).toEqual({
      error: "CNPJ inválido. Confira os números.",
    });
    expect(parseClientForm({ ...emptyClientForm, name: "X Y", email: "sem-arroba" })).toEqual({ error: "E-mail inválido." });
    expect(parseClientForm({ ...emptyClientForm, name: "X Y", phone: "123" })).toEqual({
      error: "Telefone inválido. Use DDD + número.",
    });
  });
});
