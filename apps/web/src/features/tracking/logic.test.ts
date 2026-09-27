import { describe, expect, it } from "vitest";
import { emptyContainerForm, installSnippet, parseContainerForm, parseDomains, periodRange } from "./logic.ts";

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
