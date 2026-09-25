import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportError, resetErrorReporting, technicalText } from "./errorReporting.ts";
import { supabase } from "./supabase.ts";

vi.mock("./supabase.ts", () => ({ supabase: { rpc: vi.fn(() => Promise.resolve({ error: null })) } }));

beforeEach(() => {
  resetErrorReporting();
  vi.mocked(supabase.rpc).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reportError", () => {
  it("envia o erro técnico sem segredos para log_client_error", () => {
    reportError("SITE_RENDER_ERROR", new Error("falhou ?access_token=EAAsegredo123"), { userMessage: "Não conseguimos mostrar esta tela.", context: { conta: "a1", vazio: null } });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = vi.mocked(supabase.rpc).mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("log_client_error");
    expect(args.p_code).toBe("SITE_RENDER_ERROR");
    expect(args.p_user_message).toBe("Não conseguimos mostrar esta tela.");
    expect(String(args.p_technical)).toContain("falhou");
    expect(String(args.p_technical)).not.toContain("EAAsegredo123");
    expect(args.p_context).toMatchObject({ conta: "a1" });
    expect(args.p_context).not.toHaveProperty("vazio");
  });

  it("não repete o mesmo erro e para depois de 20 envios", () => {
    reportError("X", "igual");
    reportError("X", "igual");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 40; i++) reportError("Y", `erro ${i}`);
    expect(supabase.rpc).toHaveBeenCalledTimes(20);
  });

  it("nunca lança, mesmo se o envio falhar", () => {
    vi.mocked(supabase.rpc).mockImplementationOnce(() => {
      throw new Error("offline");
    });
    expect(() => reportError("Z", "x")).not.toThrow();
  });
});

describe("technicalText", () => {
  it("limita o tamanho e aceita qualquer coisa", () => {
    expect(technicalText("x".repeat(5000))).toHaveLength(4000);
    expect(technicalText({ code: "42P01" })).toBe('{"code":"42P01"}');
    expect(technicalText(null)).toBe("");
  });
});
