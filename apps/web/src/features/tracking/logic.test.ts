import { describe, expect, it } from "vitest";
import { attributionMetrics, type AttributionRowInput, capiStatus, qualityReport, summarizeByChannel, validateWaIds, waConnectionStatus, normalizeWaCode, parseMoneyInput, emptyContainerForm, installSnippet, installSnippetWithOptions, parseContainerForm, parseDomains, periodRange, summarizeConversions } from "./logic.ts";

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

describe("WhatsApp", () => {
  it("código aceito do jeito que a equipe digitar", () => {
    expect(normalizeWaCode("ref. k7q-2m9")).toBe("K7Q2M9");
    expect(normalizeWaCode("REFA23")).toBe("REFA23");
    expect(normalizeWaCode("K7Q2M1")).toBeNull();
  });
  it("valor em reais ou dólares, com vírgula ou ponto", () => {
    expect(parseMoneyInput("1.234,56")).toBe(1234.56);
    expect(parseMoneyInput("R$ 350,5")).toBe(350.5);
    expect(parseMoneyInput("1234.56")).toBe(1234.56);
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("-5")).toBeNull();
  });
  it("código na mensagem do WhatsApp entra no código de instalação só quando pedido", () => {
    expect(installSnippetWithOptions("bf_x", "nao_exigir", { forms: false, waCode: true }, "https://x/t.js")).toContain('data-wa-code="1"');
    expect(installSnippetWithOptions("bf_x", "nao_exigir", { forms: false }, "https://x/t.js")).not.toContain("data-wa-code");
  });
});

describe("WhatsApp pela API oficial", () => {
  const base = { has_app_secret: true, enabled: true, last_webhook_at: null as string | null, last_error_at: null as string | null, last_error_message: null as string | null };
  it("mostra a situação da conexão em português", () => {
    expect(waConnectionStatus(null).label).toBe("Não configurado");
    expect(waConnectionStatus({ ...base, has_app_secret: false }).label).toBe("Falta o segredo do app");
    expect(waConnectionStatus({ ...base, enabled: false }).label).toBe("Desligado");
    expect(waConnectionStatus(base).label).toBe("Ligado, sem mensagem ainda");
    expect(waConnectionStatus({ ...base, last_webhook_at: "2026-09-27T10:00:00Z" }).label).toBe("Funcionando");
    expect(waConnectionStatus({ ...base, last_webhook_at: "2026-09-27T10:00:00Z", last_error_at: "2026-09-27T11:00:00Z", last_error_message: "assinatura" }))
      .toMatchObject({ tone: "danger", detail: "assinatura" });
    // erro antigo, mensagem depois: voltou a funcionar
    expect(waConnectionStatus({ ...base, last_webhook_at: "2026-09-27T12:00:00Z", last_error_at: "2026-09-27T11:00:00Z" }).label).toBe("Funcionando");
  });
  it("confere os IDs e o segredo antes de mandar ao servidor", () => {
    expect(validateWaIds("106540352242922", "102290129340398", "", false)).toBeNull();
    expect(validateWaIds("+55 45", "102290129340398", "", false)).toContain("ID do número");
    expect(validateWaIds("106540352242922", "abc", "", false)).toContain("conta do WhatsApp Business");
    expect(validateWaIds("106540352242922", "102290129340398", "curto", false)).toContain("segredo do app");
    expect(validateWaIds("106540352242922", "102290129340398", "", true)).toContain("antes de ligar");
  });
});

describe("atribuição e qualidade (34.4)", () => {
  const row = (over: Partial<AttributionRowInput> = {}): AttributionRowInput => ({
    client_id: "c1", channel: "meta", campaign_id: "k1", campaign_label: "Black Friday", match: "id", leads: 4, purchases: 2, confirmed: 6,
    revenue: { BRL: 600_000_000, USD: 50_000_000 }, spend_currency: "BRL", spend_micros: 200_000_000, platform_leads: 5, platform_conversions: 2,
    platform_value_micros: 300_000_000, ...over,
  });
  it("custo por lead e ROAS só na mesma moeda do investimento", () => {
    expect(attributionMetrics(row())).toEqual({ costPerLeadMicros: 50_000_000, roas: 3 });
    expect(attributionMetrics(row({ revenue: { USD: 50_000_000 } })).roas).toBeNull();
    expect(attributionMetrics(row({ spend_micros: null, spend_currency: null }))).toEqual({ costPerLeadMicros: null, roas: null });
    expect(attributionMetrics(row({ leads: 0 })).costPerLeadMicros).toBeNull();
  });
  it("soma por canal sem misturar moedas e ignora campanhas sem conversão", () => {
    const s = summarizeByChannel([row(), row({ campaign_id: "k2", leads: 1, purchases: 0, revenue: { BRL: 10 } }), row({ channel: null, leads: 2, purchases: 0, revenue: {} }),
      row({ match: "sem_conversao", leads: 0, purchases: 0, revenue: {} })]);
    expect(s).toEqual([
      { channel: "meta", leads: 5, purchases: 2, revenue: { BRL: 600_000_010, USD: 50_000_000 } },
      { channel: null, leads: 2, purchases: 0, revenue: {} },
    ]);
  });
  it("qualidade: explica os motivos, sem nota inventada", () => {
    const base = { sessions: 100, sessions_unknown: 10, paid_sessions: 40, paid_without_campaign_id: 0, leads: 10, leads_without_origin: 0,
      leads_with_contact: 8, purchases: 3, purchases_without_order: 0, purchases_without_lead: 0 };
    expect(qualityReport(base)).toEqual({ level: "boa", label: "Boa", reasons: [] });
    const a = qualityReport({ ...base, paid_without_campaign_id: 10, purchases_without_order: 1 });
    expect(a.level).toBe("atencao");
    expect(a.reasons.map((r) => r.text).join(" ")).toContain("10 de 40 visitas de anúncio vieram sem o ID da campanha");
    expect(qualityReport({ ...base, sessions_unknown: 60 }).level).toBe("fraca");
    expect(qualityReport({ ...base, leads_with_contact: 2 }).reasons[0].text).toContain("Só 20% dos leads");
    expect(qualityReport({ ...base, sessions: 0, leads: 0, purchases: 0 }).level).toBe("sem_dados");
  });
});
