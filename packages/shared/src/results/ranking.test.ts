import { describe, expect, it } from "vitest";
import { classifiedShare, costPerContact, orderRanked, profileShare, rankItems, type RiResultItem, topFor } from "./ranking.ts";

const item = (name: string, p: Partial<RiResultItem>): RiResultItem => ({
  id: name, name, status: null, platform_id: "meta", campaign_id: null, campaign_name: null, ad_group_id: null, ad_group_name: null,
  thumbnail_url: null, contacts: 0, by_name: 0, spend: [], lojista: 0, sacoleiro: 0, consumidor_final: 0, nao_identificado: 0, ...p,
});

const items = [
  item("Varejo", { contacts: 10, lojista: 1, consumidor_final: 9, spend: [{ currency: "BRL", spend_micros: 100_000_000 }] }),
  item("Atacado SP", { contacts: 5, lojista: 4, sacoleiro: 1, spend: [{ currency: "BRL", spend_micros: 80_000_000 }] }),
  item("Atacado RJ", { contacts: 4, lojista: 4, spend: [{ currency: "BRL", spend_micros: 40_000_000 }] }),
  item("Sem lojista", { contacts: 3, sacoleiro: 3 }),
  item("Duas moedas", { contacts: 2, lojista: 1, spend: [{ currency: "BRL", spend_micros: 1 }, { currency: "USD", spend_micros: 1 }] }),
];

describe("ranking por perfil (Etapa 39.3)", () => {
  it("ordena pela quantidade do perfil, marca empate e tira quem não tem o perfil", () => {
    const r = rankItems(items, "lojista");
    expect(r.map((x) => `${x.position}:${x.name}${x.tied ? "=" : ""}`)).toEqual(["1:Atacado RJ=", "1:Atacado SP=", "3:Duas moedas=", "3:Varejo="]);
    expect(topFor(items, "lojista").map((x) => x.name)).toEqual(["Atacado RJ", "Atacado SP"]);
  });

  it("da menor para a maior: lista virada, posição continua a mesma (21/10/2026)", () => {
    const r = rankItems(items, "lojista");
    expect(orderRanked(r, "asc").map((x) => `${x.position}:${x.name}`)).toEqual(["3:Duas moedas", "3:Varejo", "1:Atacado RJ", "1:Atacado SP"]);
    expect(orderRanked(r, "desc")).toBe(r);
  });

  it("% do perfil no item", () => {
    expect(profileShare(items[1], "lojista")).toBe(80);
    expect(rankItems(items, "lojista", "share").map((x) => x.name)).toEqual(["Atacado RJ", "Atacado SP", "Duas moedas", "Varejo"]);
  });

  it("custo por contato: menor primeiro; sem investimento ou com duas moedas fica sem valor e vai para o fim", () => {
    expect(costPerContact([{ currency: "BRL", spend_micros: 80_000_000 }], 4)).toEqual({ currency: "BRL", micros: 20_000_000 });
    expect(costPerContact([], 3)).toBeNull();
    expect(costPerContact([{ currency: "BRL", spend_micros: 1 }, { currency: "USD", spend_micros: 1 }], 1)).toBeNull();
    const r = rankItems(items, "lojista", "cost");
    expect(r.map((x) => `${x.name}:${x.value}`)).toEqual(["Atacado RJ:10000000", "Atacado SP:20000000", "Varejo:100000000", "Duas moedas:null"]);
  });

  it("% classificados", () => {
    expect(classifiedShare({ contacts: 8, nao_identificado: 2 })).toBe(75);
    expect(classifiedShare({ contacts: 0, nao_identificado: 0 })).toBeNull();
  });
});
