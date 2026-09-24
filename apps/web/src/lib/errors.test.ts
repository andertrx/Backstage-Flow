import { describe, expect, it, vi } from "vitest";
import { friendlyAuthError, friendlyFunctionError } from "./errors.ts";

describe("friendlyAuthError", () => {
  it("traduz códigos conhecidos", () => {
    expect(friendlyAuthError({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
    expect(friendlyAuthError({ code: "user_banned" })).toMatch(/desativado/);
  });

  it("nunca mostra a mensagem técnica", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const msg = friendlyAuthError({ code: "unexpected_failure", message: "PG_ERROR 500 stack trace" });
    expect(msg).not.toMatch(/PG_ERROR/);
  });

  it("reconhece falha de rede", () => {
    expect(friendlyAuthError({ name: "AuthRetryableFetchError" })).toMatch(/conexão/);
  });
});

describe("friendlyFunctionError", () => {
  it("usa a mensagem amigável enviada pelo servidor", async () => {
    const context = new Response(JSON.stringify({ error: { code: "EMAIL_IN_USE", message: "Já existe um usuário com este e-mail." } }), {
      status: 409,
    });
    expect(await friendlyFunctionError({ context })).toBe("Já existe um usuário com este e-mail.");
  });

  it("cai na mensagem genérica quando não há detalhe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await friendlyFunctionError(new Error("boom"))).toMatch(/Tente novamente/);
  });
});
