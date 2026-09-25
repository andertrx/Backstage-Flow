import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "./errorReporting.ts";
import { errorMessage, FriendlyError, friendlyAuthError, friendlyDbError, friendlyFunctionError } from "./errors.ts";

vi.mock("./errorReporting.ts", () => ({ reportError: vi.fn() }));
beforeEach(() => vi.mocked(reportError).mockClear());

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

describe("friendlyDbError", () => {
  it("traduz erros conhecidos do banco", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "clients_cnpj_key"' })).toBe(
      "Já existe um cliente com este CNPJ.",
    );
    expect(friendlyDbError({ code: "42501", message: "new row violates row-level security policy" })).toMatch(/permissão/);
    expect(friendlyDbError({ code: "23514", message: "violates check constraint" })).toMatch(/formato inválido/);
  });

  it("usa a mensagem padrão informada, nunca o texto técnico", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyDbError({ code: "XX000", message: "internal error" }, "Falhou ao salvar.")).toBe("Falhou ao salvar.");
  });
});

describe("registro do erro técnico (Etapa 25)", () => {
  it("erro conhecido do banco não vai para o log; erro inesperado vai, com a mensagem que a pessoa viu", () => {
    friendlyDbError({ code: "23505", message: "duplicate key" });
    expect(reportError).not.toHaveBeenCalled();
    friendlyDbError({ code: "XX000", message: "internal error" }, "Falhou ao salvar.");
    expect(reportError).toHaveBeenCalledWith("DB_XX000", { code: "XX000", message: "internal error" }, { userMessage: "Falhou ao salvar." });
  });

  it("falha de rede não vai para o log (não daria para enviar)", () => {
    friendlyDbError({ message: "Failed to fetch" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("resposta amigável do servidor não é registrada de novo (o servidor já guardou)", async () => {
    const context = new Response(JSON.stringify({ error: { code: "X", message: "Não conseguimos atualizar os dados desta conta." } }), { status: 502 });
    await friendlyFunctionError({ context });
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe("errorMessage", () => {
  it("mostra a mensagem amigável e esconde a técnica", () => {
    expect(errorMessage(new FriendlyError("Não conseguimos carregar os clientes."))).toBe("Não conseguimos carregar os clientes.");
    expect(errorMessage(new TypeError("Cannot read properties of undefined (reading 'id')"))).toMatch(/Tente novamente/);
    expect(errorMessage(new Error("API_ERROR_500_EXCEPTION"), "Não conseguimos atualizar os dados desta conta.")).toBe(
      "Não conseguimos atualizar os dados desta conta.",
    );
  });
});
