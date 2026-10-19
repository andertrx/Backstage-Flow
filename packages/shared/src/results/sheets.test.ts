import { describe, expect, it } from "vitest";
import { classifyProfile, customKey, customParams, distinctValues, normalizeText, parseSpreadsheetId, suggestMapping, suggestProfile } from "./sheets.ts";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

describe("planilha (Etapa 39)", () => {
  it("lê o ID do link ou do próprio ID", () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toBe(ID);
    expect(parseSpreadsheetId(`  ${ID} `)).toBe(ID);
    expect(parseSpreadsheetId("https://exemplo.com/planilha")).toBeNull();
    expect(parseSpreadsheetId("")).toBeNull();
  });

  it("normaliza texto (acento, maiúscula, espaços)", () => {
    expect(normalizeText("  Consumidor   FINAL ")).toBe("consumidor final");
    expect(normalizeText("Ánúncio")).toBe("anuncio");
    expect(normalizeText(null)).toBe("");
  });

  it("sugere o mapeamento pelos nomes das colunas, sem repetir coluna", () => {
    const m = suggestMapping(["ID", "Data", "Tipo de Cliente", "Campaign Name", "Ad Set Name", "Ad Name", "Ad ID", "Telefone", "Observação"]);
    expect(m).toEqual({
      record_id: "ID", contact_date: "Data", profile: "Tipo de Cliente", campaign_name: "Campaign Name",
      adset_name: "Ad Set Name", ad_name: "Ad Name", ad_id: "Ad ID", contact_key: "Telefone",
    });
    expect(suggestMapping(["Coluna A", ""])).toEqual({});
  });

  it("perfis: só os nomes exatos são sugeridos; o resto a pessoa confirma", () => {
    expect(suggestProfile("Lojista")).toBe("lojista");
    expect(suggestProfile("SACOLEIRO")).toBe("sacoleiro");
    expect(suggestProfile("Consumidor Final")).toBe("consumidor_final");
    expect(suggestProfile("Sacoleira")).toBeNull();
    expect(suggestProfile("Loja física")).toBeNull();
  });

  it("classifica pelas regras do cliente; vazio ou desconhecido = não identificado", () => {
    const rules = { lojista: "lojista", sacoleira: "sacoleiro", "consumidor final": "consumidor_final" };
    expect(classifyProfile(" Sacoleira ", rules)).toBe("sacoleiro");
    expect(classifyProfile("Loja física", rules)).toBe("nao_identificado");
    expect(classifyProfile("", rules)).toBe("nao_identificado");
    expect(classifyProfile("lojista", { lojista: "atacadista" })).toBe("nao_identificado");
  });

  it("valores distintos de uma coluna, com contagem", () => {
    const rows = [["1", "Lojista"], ["2", "lojista "], ["3", "Sacoleira"], ["4"], ["5", ""]];
    expect(distinctValues(rows, 1)).toEqual([
      { value: "", example: "", count: 2 },
      { value: "lojista", example: "Lojista", count: 2 },
      { value: "sacoleira", example: "Sacoleira", count: 1 },
    ]);
  });

  it("reconhece os parâmetros novos pelo nome da coluna (19/10)", () => {
    const m = suggestMapping(["Nome", "Número", "Perfil de Lojista (SQL)", "Data", "utm_source", "utm_medium", "utm_campaign", "utm_content",
      "utm_term", "campaign_id", "adset_id", "ad_id", "gclid", "fbclid"]);
    expect(m).toEqual({ contact_name: "Nome", contact_key: "Número", profile: "Perfil de Lojista (SQL)", contact_date: "Data",
      utm_source: "utm_source", utm_medium: "utm_medium", campaign_name: "utm_campaign", ad_name: "utm_content", adset_name: "utm_term",
      campaign_id: "campaign_id", adset_id: "adset_id", ad_id: "ad_id", gclid: "gclid", fbclid: "fbclid" });
  });

  it("parâmetros personalizados", () => {
    expect(customKey("  Cidade  do   cliente ")).toBe("x:Cidade do cliente");
    expect(customKey("")).toBeNull();
    expect(customKey("x".repeat(41))).toBeNull();
    expect(customParams({ profile: "SQL", "x:Cidade": "Cidade", "x:Vazio": "" })).toEqual([{ key: "x:Cidade", label: "Cidade", column: "Cidade" }]);
  });
});
