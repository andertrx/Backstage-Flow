import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissToast, getToasts, resetToasts, toast } from "./toastStore.ts";

afterEach(() => { resetToasts(); vi.useRealTimers(); });

describe("avisos rápidos", () => {
  it("mostra, fecha sozinho e deixa o erro mais tempo na tela", () => {
    vi.useFakeTimers();
    toast.success("Salvo!");
    toast.error("Erro ao salvar");
    expect(getToasts().map((t) => t.tone)).toEqual(["success", "error"]);
    vi.advanceTimersByTime(4100);
    expect(getToasts().map((t) => t.tone)).toEqual(["error"]);
    vi.advanceTimersByTime(3000);
    expect(getToasts()).toEqual([]);
  });
  it("não empilha a mesma mensagem e limita a 4 na tela", () => {
    toast.success("Salvo!");
    toast.success("Salvo!");
    expect(getToasts()).toHaveLength(1);
    for (let i = 0; i < 6; i++) toast.info(`Aviso ${i}`);
    expect(getToasts()).toHaveLength(4);
    expect(getToasts().at(-1)?.message).toBe("Aviso 5");
  });
  it("ignora mensagem vazia e fecha pelo X", () => {
    expect(toast.success("   ")).toBe(-1);
    const id = toast.info("Olá");
    dismissToast(id);
    expect(getToasts()).toEqual([]);
  });
});
