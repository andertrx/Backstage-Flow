import { describe, expect, it } from "vitest";
import { applyCopySet, copySetFromEsteira, copySetPayload, copySetProblems, emptyCopySet } from "./copy-sets.ts";
import { newEsteira } from "./esteira.ts";

const pacote = { bodies: ["A", "B", "C"], titles: ["T1", "T2"], description: "D", link: "https://loja.com.br", cta: "SHOP_NOW", url_tags: "utm_source=meta" };

describe("Fase J.3 — Biblioteca de textos", () => {
  it("confere nome, limites, link e UTM antes de salvar", () => {
    expect(copySetProblems({ ...emptyCopySet(), name: "Black" })).toEqual([]);
    const p = copySetProblems({ ...emptyCopySet(), name: "x", bodies: ["1", "2", "3", "4", "5", "6"], link: "http://x", url_tags: "?a=b" });
    expect(p.join(" ")).toMatch(/nome/);
    expect(p.join(" ")).toMatch(/Até 5 textos/);
    expect(p.join(" ")).toMatch(/https/);
    expect(p.join(" ")).toMatch(/rastreio/);
  });

  it("tira os vazios e repetidos ao salvar", () => {
    expect(copySetPayload({ ...emptyCopySet(), name: "X", bodies: ["A", "", " A ", "B"], messages: ["", "Oi"] })).toMatchObject({ bodies: ["A", "B"], messages: ["Oi"] });
  });

  it("aplica o pacote na esteira: link e botão só em conjunto de site", () => {
    const d = newEsteira();
    d.target = { adSetId: "1", adSetName: "", campaignId: "", campaignName: "", destinationType: "WHATSAPP" };
    const w = applyCopySet(d, pacote);
    expect(w.defaults.bodies).toEqual(["A", "B", "C"]);
    expect(w.link).toBe("");
    expect(w.cta).toBe("");
    expect(w.control.urlTags).toBe("utm_source=meta");
    d.target.destinationType = "WEBSITE";
    const s = applyCopySet(d, pacote);
    expect(s.link).toBe("https://loja.com.br");
    expect(s.cta).toBe("SHOP_NOW");
  });

  it("textos padrão da esteira viram um pacote", () => {
    const d = newEsteira();
    d.defaults = { bodies: ["A", "", "B"], titles: ["T"], description: " D " };
    expect(copySetFromEsteira(d, "Novo")).toMatchObject({ name: "Novo", bodies: ["A", "B"], titles: ["T"], description: "D", messages: [] });
  });
});
