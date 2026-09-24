import { describe, expect, it } from "vitest";
import { validateNewPassword } from "./password.ts";

describe("validateNewPassword", () => {
  it("exige tamanho mínimo", () => expect(validateNewPassword("abc123")).toMatch(/8 caracteres/));
  it("exige letras e números", () => {
    expect(validateNewPassword("somenteletras")).toMatch(/letras e números/);
    expect(validateNewPassword("12345678")).toMatch(/letras e números/);
  });
  it("confere a confirmação", () => expect(validateNewPassword("senha1234", "senha9999")).toMatch(/não são iguais/));
  it("aceita senha válida", () => expect(validateNewPassword("senha1234", "senha1234")).toBeNull());
});
