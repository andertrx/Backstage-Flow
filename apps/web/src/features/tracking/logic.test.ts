import { describe, expect, it } from "vitest";
import { capiStatus, emptyContainerForm, installSnippet, installSnippetWithOptions, parseContainerForm, parseDomains, periodRange, summarizeConversions } from "./logic.ts";

describe("domínios autorizados", () => {
  it("aceita um por linha, limpa o endereço e tira repetidos", () => {
    expect(parseDomains("https://www.Loja.com.br/produto\nloja.com.br, loja.com.br")).toEqual({ domains: ["www.loja.com.br", "loja.com.br"], invalid: [] });
  });
  it("aponta o que não é domínio", () => {
    expect(parseDomains("loja.com.br\nlocalhost").invalid).toEqual(["localhost"]);
  });
});

describe("formulário do container", () => {
  const ok = { ...emptyContainerForm, client_id: "c1", name: "Loja", domains: "loja.com.br" };
  it("monta o que vai para o banco", () => {
    expect(parseContainerForm(ok)).toEqual({
      data: { client_id: "c1", name: "Loja", allowed_domains: ["loja.com.br"], status: "ativo", test_mode: true, consent_mode: "nao_exigir", retention_days: 180 },
    });
  });
  it("explica o erro em português", () => {
    expect(parseContainerForm({ ...ok, client_id: "" })).toEqual({ error: "Escolha o cliente." });
    expect(parseContainerForm({ ...ok, domains: "" })).toMatchObject({ error: expect.stringContaining("pelo menos um domínio") });
    expect(parseContainerForm({ ...ok, domains: "não é" })).toMatchObject({ error: expect.stringContaining("Domínio inválido") });
  });
});

describe("código de instalação", () => {
  it("leva só a chave pública (nunca segredo)", () => {
    expect(installSnippet("bf_abc", "nao_exigir", "https://x/t.js")).toBe('<script async src="https://x/t.js" data-key="bf_abc"></script>');
    expect(installSnippet("bf_abc", "aguardar_consentimento", "https://x/t.js")).toContain('data-consent="aguardar"');
  });
});

describe("período", () => {
  it("hoje começa à meia-noite local", () => {
    const now = new Date(2026, 8, 27, 15, 30);
    const { from } = periodRange("hoje", now);
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(periodRange("7d", now).from).getDate()).toBe(21);
  });
});

describe("conversões", () => {
  it("soma só os sites visíveis e separa a receita por moeda", () => {
    const rows = [
      { container_id: "a", currency: null, leads: 2, conversions: 4, purchases: 0, revenue_micros: 0 },
      { container_id: "a", currency: "BRL", leads: 0, conversions: 0, purchases: 1, revenue_micros: 199_900_000 },
      { container_id: "a", currency: "USD", leads: 0, conversions: 0, purchases: 1, revenue_micros: 50_000_000 },
      { container_id: "b", currency: "BRL", leads: 0, conversions: 0, purchases: 9, revenue_micros: 9 },
    ];
    expect(summarizeConversions(rows, new Set(["a"]))).toEqual({
      leads: 2, conversions: 4, purchases: 2, revenue: [{ currency: "BRL", micros: 199_900_000 }, { currency: "USD", micros: 50_000_000 }],
    });
  });

  it("captura de formulários entra no código só quando pedida", () => {
    expect(installSnippetWithOptions("bf_x", "nao_exigir", { forms: true }, "https://x/t.js")).toBe('<script async src="https://x/t.js" data-key="bf_x" data-forms="lead"></script>');
    expect(installSnippetWithOptions("bf_x", "nao_exigir", { forms: false }, "https://x/t.js")).not.toContain("data-forms");
  });
});

describe("Meta CAPI", () => {
  const base = { has_token: true, enabled: true, test_event_code: null, last_success_at: null, last_error_at: null, last_error_message: null };
  it("situação em português, sem inventar sucesso", () => {
    expect(capiStatus(null).label).toBe("Não configurado");
    expect(capiStatus({ ...base, has_token: false }).label).toBe("Falta o token");
    expect(capiStatus({ ...base, enabled: false }).label).toBe("Desligado");
    expect(capiStatus(base).label).toBe("Ligado, sem envio ainda");
    expect(capiStatus({ ...base, last_success_at: "2026-09-27T10:00:00Z" })).toMatchObject({ tone: "success", label: "Funcionando" });
    expect(capiStatus({ ...base, last_success_at: "2026-09-27T10:00:00Z", last_error_at: "2026-09-27T11:00:00Z", last_error_message: "Token inválido" }))
      .toMatchObject({ tone: "danger", detail: "Token inválido" });
    expect(capiStatus({ ...base, test_event_code: "TEST1" }).label).toBe("Ligado (teste)");
  });

  it("Pixel no navegador entra no código só com ID válido", () => {
    expect(installSnippetWithOptions("bf_x", "nao_exigir", { forms: false, pixelId: "123456789" }, "https://x/t.js")).toContain('data-pixel="123456789"');
    expect(installSnippetWithOptions("bf_x", "nao_exigir", { forms: false, pixelId: "abc" }, "https://x/t.js")).not.toContain("data-pixel");
  });
});
