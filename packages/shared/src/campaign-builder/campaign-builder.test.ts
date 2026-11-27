import { describe, expect, it } from "vitest";
import {
  applyGoal, applyObjective, billingFor, checkDraft, checkSummary, duplicateAdSet, GOALS_BY_OBJECTIVE, newAd, newAdSet, newDraft, normalizeDraft, removeAdSet,
  type CampaignDraft,
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
    d.adSets[0].optimizationGoal = "THRUPLAY";
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

