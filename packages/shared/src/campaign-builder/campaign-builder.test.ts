import { describe, expect, it } from "vitest";
import {
  applyGoal, applyObjective, billingFor, checkDraft, checkSummary, duplicateAdSet, GOALS_BY_OBJECTIVE, newAd, newAdSet, newDraft, normalizeDraft, removeAdSet,
  type CampaignDraft, checkPublishable, publishBlockers, publishCounts, destinationsFor, leadsToWebsite,
} from "../index.ts";

function completo(): CampaignDraft {
  const d = newDraft();
  d.campaign = { ...d.campaign, name: "Black Friday", objective: "OUTCOME_TRAFFIC", status: "PAUSED", budgetLevel: "adset" };
  const s = newAdSet({ name: "Brasil 25-45", optimizationGoal: "LINK_CLICKS", billingEvent: "IMPRESSIONS", budgetAmount: 50, ageMin: 25, ageMax: 45 });
  d.adSets = [s];
  d.ads = [newAd(s.id, { name: "Anúncio 1", pageId: "123", instagramId: "456", primaryText: "Oferta", link: "https://loja.com.br", cta: "SHOP_NOW" })];
  return d;
}

describe("Campaign Builder — rascunho", () => {
  it("um rascunho completo não tem erros", () => {
    const itens = checkDraft(completo());
    expect(itens.filter((i) => i.level === "erro")).toEqual([]);
    expect(checkSummary(itens).ready).toBe(true);
  });

  it("rascunho novo: status não vem preenchido e pede o que falta", () => {
    const d = newDraft();
    expect(d.campaign.status).toBe("");
    const msgs = checkDraft(d).map((i) => i.message).join("|");
    expect(msgs).toMatch(/nome à campanha/);
    expect(msgs).toMatch(/objetivo/);
    expect(msgs).toMatch(/status/);
    expect(msgs).toMatch(/pelo menos um conjunto/);
  });

  it("meta que o objetivo não aceita é recusada; trocar o objetivo desmarca a meta inválida", () => {
    const d = completo();
    d.adSets[0].optimizationGoal = "LEAD_GENERATION";
    expect(checkDraft(d).some((i) => /não combina com o objetivo/.test(i.message))).toBe(true);
    const trocado = applyObjective(completo(), "OUTCOME_AWARENESS");
    expect(trocado.adSets[0].optimizationGoal).toBe("");
    expect(GOALS_BY_OBJECTIVE.OUTCOME_AWARENESS).toContain("REACH");
    const mantido = applyObjective(completo(), "OUTCOME_SALES");
    expect(mantido.adSets[0].optimizationGoal).toBe("LINK_CLICKS");
  });

  it("cobrança acompanha a meta", () => {
    expect(billingFor("LINK_CLICKS")).toEqual(["IMPRESSIONS", "LINK_CLICKS"]);
    expect(billingFor("REACH")).toEqual(["IMPRESSIONS"]);
    const s = applyGoal(newAdSet({ billingEvent: "LINK_CLICKS" }), "REACH");
    expect(s.billingEvent).toBe("IMPRESSIONS");
  });

  it("conversões exigem pixel e evento; leads e conversas exigem página", () => {
    const d = completo();
    d.campaign.objective = "OUTCOME_SALES";
    d.adSets[0].optimizationGoal = "OFFSITE_CONVERSIONS";
    const m = checkDraft(d).map((i) => i.message).join("|");
    expect(m).toMatch(/pixel/);
    expect(m).toMatch(/evento de conversão/);
    d.adSets[0].optimizationGoal = "CONVERSATIONS";
    expect(checkDraft(d).map((i) => i.message).join("|")).toMatch(/página \(ID\) para essa meta/);
  });

  it("orçamento: na campanha ou no conjunto, nunca sem nenhum", () => {
    const d = completo();
    d.adSets[0].budgetAmount = null;
    expect(checkDraft(d).some((i) => /orçamento do conjunto/.test(i.message))).toBe(true);
    d.campaign.budgetLevel = "campaign";
    expect(checkDraft(d).some((i) => /orçamento da campanha/.test(i.message))).toBe(true);
    d.campaign.budgetAmount = 100;
    expect(checkDraft(d).filter((i) => i.level === "erro")).toEqual([]);
  });

  it("categoria especial trava idade e gênero; vitalício exige término; datas coerentes", () => {
    const d = completo();
    d.campaign.specialAdCategories = ["CREDIT"];
    expect(checkDraft(d).some((i) => i.level === "erro" && /categoria especial/.test(i.message))).toBe(true);
    d.adSets[0].ageMin = 18;
    d.adSets[0].ageMax = 65;
    expect(checkDraft(d).filter((i) => i.level === "erro")).toEqual([]);
    d.campaign.budgetType = "lifetime";
    expect(checkDraft(d).some((i) => /data de término/.test(i.message))).toBe(true);
    d.adSets[0].startDate = "2026-12-10";
    d.adSets[0].endDate = "2026-12-01";
    expect(checkDraft(d).some((i) => /antes do início/.test(i.message))).toBe(true);
  });

  it("anúncio: link https, texto, botão e página; avisos de tamanho", () => {
    const d = completo();
    d.ads[0].link = "http://loja.com.br";
    expect(checkDraft(d).some((i) => /https/.test(i.message))).toBe(true);
    d.ads[0] = { ...d.ads[0], link: "https://x.com", primaryText: "", cta: "", pageId: "" };
    const m = checkDraft(d).map((i) => i.message).join("|");
    expect(m).toMatch(/texto principal/);
    expect(m).toMatch(/botão/);
    expect(m).toMatch(/página/);
    const longo = completo();
    longo.ads[0].headline = "x".repeat(41);
    expect(checkDraft(longo).some((i) => i.level === "aviso" && /título/.test(i.message))).toBe(true);
  });

  it("senha, token ou chave em qualquer campo é recusado; JSON avançado inválido também", () => {
    const d = completo();
    d.ads[0].primaryText = "token: EAABwzLixnjYBAKZCZB1234567890abcdef";
    expect(checkDraft(d).some((i) => /senha, token ou chave/.test(i.message))).toBe(true);
    const e = completo();
    e.advancedJson = "{ quebrado";
    expect(checkDraft(e).some((i) => /JSON válido/.test(i.message))).toBe(true);
    e.advancedJson = '{"a":1}';
    expect(checkDraft(e).filter((i) => i.level === "erro")).toEqual([]);
  });

  it("duplicar e remover conjunto levam os anúncios junto", () => {
    const d = completo();
    const dup = duplicateAdSet(d, d.adSets[0].id);
    expect(dup.adSets).toHaveLength(2);
    expect(dup.ads).toHaveLength(2);
    expect(new Set(dup.ads.map((a) => a.id)).size).toBe(2);
    expect(dup.adSets[1].name).toBe("Brasil 25-45 (cópia)");
    expect(removeAdSet(dup, dup.adSets[1].id).ads).toHaveLength(1);
  });

  it("normalizeDraft: lê JSON antigo ou estranho sem quebrar e sem inventar", () => {
    expect(normalizeDraft(null)).toEqual(newDraft());
    expect(normalizeDraft({}).campaign.status).toBe("");
    const n = normalizeDraft({ campaign: { name: "X", objective: "INVENTADO", status: "ACTIVE", budgetAmount: -5 }, adSets: [{ id: "a", name: "S", optimizationGoal: "QUALQUER", countries: ["BR", "xx", 5] }], ads: [{ adSetId: "a" }, { adSetId: "inexistente" }] });
    expect(n.campaign.objective).toBe("");
    expect(n.campaign.status).toBe("ACTIVE");
    expect(n.campaign.budgetAmount).toBeNull();
    expect(n.adSets[0].optimizationGoal).toBe("");
    expect(n.adSets[0].countries).toEqual(["BR"]);
    expect(n.ads).toHaveLength(1);
  });
});

describe("públicos do conjunto (Fase A)", () => {
  it("guarda só ids numéricos de públicos e ignora lixo", () => {
    const d = normalizeDraft({ adSets: [{ id: "s1", audienceIds: ["9001", "abc", 5, "9002", "9001; drop"] }] });
    expect(d.adSets[0].audienceIds).toEqual(["9001", "9002"]);
  });
  it("rascunho antigo, sem públicos, abre com lista vazia", () => {
    expect(normalizeDraft({ adSets: [{ id: "s1" }] }).adSets[0].audienceIds).toEqual([]);
  });
  it("duplicar o conjunto leva os públicos junto", () => {
    const d = normalizeDraft({ adSets: [{ id: "s1", audienceIds: ["9001"] }] });
    const dup = duplicateAdSet(d, "s1");
    expect(dup.adSets[1].audienceIds).toEqual(["9001"]);
  });
});

describe("publicar (Fase B)", () => {
  it("sem endereço da imagem não publica, e diz o que fazer", () => {
    const d = completo();
    const msgs = checkPublishable(d).map((i) => i.message);
    expect(msgs.some((m) => m.includes("escolha a imagem no Google Drive"))).toBe(true);
  });
  it("imagem http (sem s) é recusada; com https libera", () => {
    const d = completo();
    d.ads[0].imageUrl = "http://x.com/a.jpg";
    expect(checkPublishable(d).some((i) => i.message.includes("precisa começar com https://"))).toBe(true);
    d.ads[0].imageUrl = "https://x.com/a.jpg";
    expect(publishBlockers(d)).toEqual([]);
  });
  it("meta que exige vídeo/post/ligação e o botão de ligar ainda não são publicados (aviso claro)", () => {
    const d = completo();
    d.ads[0].imageUrl = "https://x.com/a.jpg";
    d.adSets[0].optimizationGoal = "THRUPLAY";
    d.ads[0].cta = "CALL_NOW";
    const msgs = checkPublishable(d).map((i) => i.message).join(" | ");
    expect(msgs).toContain("ainda não é publicada");
    expect(msgs).toContain("ainda não é publicado");
  });
  it("modo avançado preenchido impede publicar (não é enviado, então não finge)", () => {
    const d = completo();
    d.ads[0].imageUrl = "https://x.com/a.jpg";
    d.advancedJson = "{\"a\":1}";
    expect(checkPublishable(d).some((i) => i.message.includes("modo avançado"))).toBe(true);
  });
  it("resumo: 1 campanha, N conjuntos, M anúncios", () => {
    expect(publishCounts(completo())).toEqual({ campaigns: 1, adSets: 1, ads: 1 });
  });
  it("a imagem do anúncio é guardada e sobrevive ao duplicar o conjunto", () => {
    const d = normalizeDraft({ adSets: [{ id: "s1" }], ads: [{ id: "a1", adSetId: "s1", imageUrl: "https://x.com/a.jpg" }] });
    expect(d.ads[0].imageUrl).toBe("https://x.com/a.jpg");
    expect(duplicateAdSet(d, "s1").ads[1].imageUrl).toBe("https://x.com/a.jpg");
  });
  it("imagem escolhida no Drive libera o publicar sem endereço, e só aceita ID válido", () => {
    const d = completo();
    d.ads[0].driveFileId = "1AbCdEfGhIjKlMnOp";
    expect(publishBlockers(d)).toEqual([]);
    const n = normalizeDraft({ adSets: [{ id: "s1" }], ads: [{ id: "a1", adSetId: "s1", driveFileId: "oi; drop", driveFileName: "ADS-01.png" }] });
    expect(n.ads[0].driveFileId).toBe("");
    const ok = normalizeDraft({ adSets: [{ id: "s1" }], ads: [{ id: "a1", adSetId: "s1", driveFileId: "1AbCdEfGhIjKlMnOp", driveFileName: "ADS-01.png" }] });
    expect(ok.ads[0].driveFileId).toBe("1AbCdEfGhIjKlMnOp");
    expect(duplicateAdSet(ok, "s1").ads[1].driveFileName).toBe("ADS-01.png");
  });
});

describe("opções iguais às do Meta (28/11/2026)", () => {
  it("as metas de cada objetivo seguem a lista do Meta, na ordem dele (a primeira é a padrão)", () => {
    expect(GOALS_BY_OBJECTIVE.OUTCOME_TRAFFIC[0]).toBe("LINK_CLICKS");
    expect(GOALS_BY_OBJECTIVE.OUTCOME_LEADS.slice(0, 2)).toEqual(["OFFSITE_CONVERSIONS", "LEAD_GENERATION"]);
    expect(GOALS_BY_OBJECTIVE.OUTCOME_SALES).not.toContain("LEAD_GENERATION");
    expect(GOALS_BY_OBJECTIVE.OUTCOME_AWARENESS).toContain("TWO_SECOND_CONTINUOUS_VIDEO_VIEWS");
  });
  it("Conversas: WhatsApp, Messenger ou Direct; em Cadastros só WhatsApp; formulário vai no anúncio", () => {
    expect(destinationsFor("CONVERSATIONS", "OUTCOME_TRAFFIC")).toEqual(["WHATSAPP", "MESSENGER", "INSTAGRAM_DIRECT"]);
    expect(destinationsFor("CONVERSATIONS", "OUTCOME_LEADS")).toEqual(["WHATSAPP"]);
    expect(destinationsFor("LEAD_GENERATION", "OUTCOME_LEADS")).toEqual(["ON_AD"]);
    expect(destinationsFor("LINK_CLICKS", "OUTCOME_TRAFFIC")).toEqual([]);
  });
  it("escolher a meta já põe o destino padrão; trocar para meta sem escolha volta ao site", () => {
    const s = applyGoal(newAdSet(), "CONVERSATIONS", "OUTCOME_TRAFFIC");
    expect(s.destinationType).toBe("WHATSAPP");
    expect(applyGoal({ ...s, destinationType: "MESSENGER" }, "CONVERSATIONS", "OUTCOME_TRAFFIC").destinationType).toBe("MESSENGER");
    expect(applyGoal(s, "LINK_CLICKS", "OUTCOME_TRAFFIC").destinationType).toBe("");
  });
  it("destino de mensagem: o anúncio não precisa de link nem botão; formulário exige o ID", () => {
    const d = completo();
    d.adSets[0].optimizationGoal = "CONVERSATIONS";
    d.adSets[0].destinationType = "WHATSAPP";
    d.adSets[0].pageId = "123";
    d.ads[0].link = "";
    d.ads[0].cta = "";
    expect(checkDraft(d).filter((i) => i.level === "erro").map((i) => i.message).join("|")).not.toMatch(/link|botão/);
    d.adSets[0].optimizationGoal = "LEAD_GENERATION";
    d.adSets[0].destinationType = "ON_AD";
    expect(checkDraft(d).some((i) => i.message.includes("ID do formulário"))).toBe(true);
    d.ads[0].leadFormId = "123456789012";
    expect(checkDraft(d).some((i) => i.message.includes("ID do formulário"))).toBe(false);
    expect(leadsToWebsite("ON_AD")).toBe(false);
  });
  it("Conversas e Geração de leads agora publicam; as metas que exigem vídeo/post/ligação seguem avisando", () => {
    const d = completo();
    d.ads[0].imageUrl = "https://x.com/a.jpg";
    d.adSets[0].optimizationGoal = "CONVERSATIONS";
    expect(checkPublishable(d).some((i) => i.message.includes("ainda não é publicada"))).toBe(false);
    d.adSets[0].optimizationGoal = "QUALITY_LEAD";
    expect(checkPublishable(d).some((i) => i.message.includes("Leads de qualidade"))).toBe(true);
  });
  it("destino e ID do formulário só guardam valores válidos", () => {
    const n = normalizeDraft({ adSets: [{ id: "s1", destinationType: "WHATSAPP" }, { id: "s2", destinationType: "qualquer" }], ads: [{ id: "a1", adSetId: "s1", leadFormId: "12345678; x" }, { id: "a2", adSetId: "s1", leadFormId: "987654321" }] });
    expect(n.adSets.map((x) => x.destinationType)).toEqual(["WHATSAPP", ""]);
    expect(n.ads.map((x) => x.leadFormId)).toEqual(["", "987654321"]);
  });
});


describe("Fase E — interesses, cidades e Advantage+", () => {
  it("normalizeDraft guarda só interesses/cidades válidos, limita o raio e mantém Advantage+ desligado por padrão", () => {
    const d = normalizeDraft({
      adSets: [{
        id: "s1", interests: [{ id: "6003", name: "Academia" }, { id: "abc", name: "inválido" }, { id: "7", name: "" }],
        cities: [{ key: "2673660", name: "Fortaleza", radius: 500 }, { key: "x", name: "ruim", radius: 20 }, { key: "9", name: "Perto", radius: 1 }],
      }],
    });
    expect(d.adSets[0].interests).toEqual([{ id: "6003", name: "Academia" }]);
    expect(d.adSets[0].cities).toEqual([{ key: "2673660", name: "Fortaleza", radius: 80 }, { key: "9", name: "Perto", radius: 17 }]);
    expect(d.adSets[0].advantageAudience).toBe(false);
  });

  it("a conferência aceita cidade sem país, mas exige um dos dois", () => {
    const base = normalizeDraft({ campaign: { name: "X", objective: "OUTCOME_TRAFFIC", status: "PAUSED" }, adSets: [{ id: "s1", name: "Conj", optimizationGoal: "LINK_CLICKS", budgetAmount: 10, countries: [] }], ads: [] });
    expect(checkDraft(base).some((i) => i.message.includes("um país ou uma cidade"))).toBe(true);
    base.adSets[0].cities = [{ key: "2673660", name: "Fortaleza", radius: 17 }];
    expect(checkDraft(base).some((i) => i.message.includes("um país ou uma cidade"))).toBe(false);
  });
});
