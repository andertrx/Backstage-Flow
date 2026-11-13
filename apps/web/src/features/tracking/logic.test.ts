import { describe, expect, it } from "vitest";
import { siteReadiness, attributionMetrics, type AttributionRowInput, capiStatus, qualityReport, summarizeByChannel, validateWaIds, waConnectionStatus, normalizeWaCode, parseMoneyInput, emptyContainerForm, installSnippet, installSnippetWithOptions, parseContainerForm, parseDomains, periodRange, summarizeConversions, marketingCampaigns, marketingTotals, marketingOrigins, mergeJourneySummaries, siteRecemCriado, usoRecente } from "./logic.ts";

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
    // T5.2: cliques em botões e campos escondidos
    expect(installSnippetWithOptions("bf_x", "nao_exigir", { forms: false, clicks: true, fields: true }, "https://x/t.js")).toContain('data-clicks="on" data-fields="on"');
    expect(installSnippetWithOptions("bf_x", "nao_exigir", { forms: false }, "https://x/t.js")).not.toMatch(/data-clicks|data-fields/);
  });
});

describe("WhatsApp pela API oficial", () => {
  const base = { has_app_secret: true, enabled: true, last_webhook_at: null as string | null, last_error_at: null as string | null, last_error_message: null as string | null };
  it("mostra a situação da conexão em português", () => {
    expect(waConnectionStatus(null).label).toBe("Não configurado");
    expect(waConnectionStatus({ ...base, has_app_secret: false }).label).toBe("Falta o segredo do app");
    expect(waConnectionStatus({ ...base, has_app_secret: false, mode: "coexistencia", last_webhook_at: null }).label).toBe("Ligado, sem mensagem ainda");
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

describe("lista pronto para cliente (T5.5)", () => {
  const NOW = Date.UTC(2026, 10, 8, 12);
  const base = {
    container: { status: "ativo", test_mode: false, consent_mode: "nao_exigir", rules_version: null },
    nowMs: NOW,
    lastEventAt: new Date(NOW - 3600_000).toISOString(),
    quality: { sessions: 10, sessions_unknown: 1, paid_sessions: 5, paid_without_campaign_id: 0, leads: 2, leads_without_origin: 0, leads_with_contact: 2, purchases: 0, purchases_without_order: 0, purchases_without_lead: 0 },
    leads: 2,
    destination: { has_token: true, enabled: true, last_error_message: null, test_event_code: null },
    capi: { pending: 0, sent_24h: 2, errors_24h: 0, last_sent_at: new Date(NOW - 1000).toISOString() },
    whatsapp: undefined,
  } as Parameters<typeof siteReadiness>[0];
  const state = (r: ReturnType<typeof siteReadiness>, id: string) => r.items.find((x) => x.id === id)?.state;

  it("site pronto: tudo certo", () => {
    const r = siteReadiness(base);
    expect(r.summary).toBe("pronto");
    expect(state(r, "whatsapp")).toBe("na");
  });
  it("site novo, sem nada: faltam itens, com o motivo", () => {
    const r = siteReadiness({ ...base, lastEventAt: null, quality: undefined, leads: 0, destination: undefined, capi: undefined });
    expect(r.summary).toBe("faltam");
    expect(state(r, "codigo")).toBe("fail");
    expect(state(r, "pixel")).toBe("fail");
    expect(state(r, "envio")).toBe("na");
    expect(state(r, "lead")).toBe("warn");
  });
  it("modo teste, evento antigo e envio ainda sem resposta: quase pronto", () => {
    const r = siteReadiness({ ...base, container: { ...base.container, test_mode: true }, lastEventAt: new Date(NOW - 30 * 3600_000).toISOString(),
      capi: { pending: 2, sent_24h: 0, errors_24h: 0, last_sent_at: null } });
    expect(r.summary).toBe("quase");
    expect(state(r, "teste")).toBe("warn");
    expect(state(r, "codigo")).toBe("warn");
    expect(state(r, "envio")).toBe("warn");
  });
  it("Meta recusando, pixel sem token e origem fraca viram falha", () => {
    expect(state(siteReadiness({ ...base, capi: { pending: 0, sent_24h: 0, errors_24h: 3, last_sent_at: null }, destination: { ...base.destination!, last_error_message: "Token vencido" } }), "envio")).toBe("fail");
    expect(state(siteReadiness({ ...base, destination: { ...base.destination!, has_token: false } }), "pixel")).toBe("fail");
    expect(state(siteReadiness({ ...base, quality: { ...base.quality!, sessions_unknown: 8 } }), "origem")).toBe("fail");
  });
  it("WhatsApp ligado entra na lista pela situação da conexão", () => {
    const wa = { has_app_secret: false, enabled: true, last_webhook_at: new Date(NOW).toISOString(), last_error_at: null, last_error_message: null, mode: "nao_oficial" as const };
    expect(state(siteReadiness({ ...base, whatsapp: wa }), "whatsapp")).toBe("ok");
    expect(state(siteReadiness({ ...base, whatsapp: { ...wa, last_webhook_at: null } }), "whatsapp")).toBe("warn");
  });
});

describe("visão de marketing (T5.35 etapa 4)", () => {
  const row = (p: Partial<AttributionRowInput> & { leads: number }): AttributionRowInput => ({
    client_id: "c1", channel: "meta", campaign_id: "k1", campaign_label: "Campanha", match: "id", confirmed: 0, purchases: 0,
    revenue: {}, spend_currency: null, spend_micros: null, platform_leads: null, platform_conversions: null, platform_value_micros: null, ...p,
  });

  it("conta o investimento da campanha uma vez, mesmo com a campanha em duas origens", () => {
    const rows = [
      row({ leads: 4, purchases: 1, spend_micros: 200_000_000, spend_currency: "BRL" }),
      row({ channel: "whatsapp", leads: 1, spend_micros: 200_000_000, spend_currency: "BRL" }),
    ];
    const campanhas = marketingCampaigns(rows);
    expect(campanhas).toHaveLength(1);
    expect(campanhas[0].leads).toBe(5);
    expect(campanhas[0].spend_micros).toBe(200_000_000);
    expect(marketingTotals(rows).spend).toEqual({ BRL: 200_000_000 });
  });

  it("separa as moedas: nunca soma BRL com USD", () => {
    const rows = [
      row({ leads: 2, purchases: 1, revenue: { BRL: 100_000_000 }, spend_micros: 50_000_000, spend_currency: "BRL" }),
      row({ campaign_id: "k2", campaign_label: "Outra", channel: "google", leads: 1, revenue: { USD: 20_000_000 }, spend_micros: 10_000_000, spend_currency: "USD" }),
    ];
    const t = marketingTotals(rows);
    expect(t.revenue).toEqual({ BRL: 100_000_000, USD: 20_000_000 });
    expect(t.spend).toEqual({ BRL: 50_000_000, USD: 10_000_000 });
    expect(t.roas.BRL).toBe(2);
    expect(t.roas.USD).toBe(2);
    // Com duas moedas, o custo por lead não é calculado (misturaria moedas).
    expect(t.costPerLeadMicros).toBeNull();
  });

  it("acha a campanha que gastou e não trouxe lead", () => {
    const rows = [
      row({ leads: 3, spend_micros: 100_000_000, spend_currency: "BRL" }),
      row({ campaign_id: "k9", campaign_label: "Sem lead", leads: 0, spend_micros: 80_000_000, spend_currency: "BRL", match: "sem_conversao" }),
    ];
    expect(marketingTotals(rows).sem_lead.map((c) => c.label)).toEqual(["Sem lead"]);
  });

  it("junta o caminho de vários clientes sem inventar a média", () => {
    const j = mergeJourneySummaries([
      { leads: 10, purchases: 2, toques_0: 0, toques_1: 8, toques_2_3: 2, toques_4p: 0, media_toques: 1.2, media_dias: 2, mais_rapido_dias: 1, origem_paga: 6 },
      { leads: 4, purchases: 1, toques_0: 0, toques_1: 0, toques_2_3: 4, toques_4p: 0, media_toques: 3, media_dias: 5, mais_rapido_dias: 2, origem_paga: 4 },
    ]);
    expect(j.leads).toBe(14);
    expect(j.toques_1).toBe(8);
    expect(j.toques_2_3).toBe(6);
    expect(j.origem_paga).toBe(10);
    expect(j.mais_rapido_dias).toBe(1);
    // Média ponderada: (1,2×10 + 3×4) ÷ 14 = 1,71…
    expect(j.media_toques).toBe(1.7);
  });

  it("dá o peso de cada canal (em % dos leads e compras)", () => {
    const origens = marketingOrigins([
      row({ channel: "meta", leads: 3, purchases: 1 }),
      row({ campaign_id: "k2", channel: "google", leads: 1, purchases: 0 }),
    ]);
    expect(origens[0].channel).toBe("meta");
    expect(origens[0].share).toBe(80);
    expect(origens[1].share).toBe(20);
  });
});

describe("site (ou conexão) sem uso (T5.35 etapa 5)", () => {
  const agora = Date.parse("2026-11-12T12:00:00Z");
  const dias = (n: number) => new Date(agora - n * 86400000).toISOString();

  it("nunca recebeu evento", () => {
    expect(usoRecente(null, agora)).toEqual({ level: "nunca", dias: null });
  });
  it("avisa quando está parado há mais de 7 dias", () => {
    expect(usoRecente(dias(3), agora).level).toBe("ok");
    expect(usoRecente(dias(7), agora).level).toBe("atencao");
    expect(usoRecente(dias(20), agora)).toEqual({ level: "atencao", dias: 20 });
  });
  it("data inválida não quebra a tela", () => {
    expect(usoRecente("data furada", agora).level).toBe("nunca");
  });
  it("site recém-criado ainda não é 'sem uso'", () => {
    expect(siteRecemCriado(dias(1), agora)).toBe(true);
    expect(siteRecemCriado(dias(3), agora)).toBe(false);
    expect(siteRecemCriado(null, agora)).toBe(false);
  });
});
