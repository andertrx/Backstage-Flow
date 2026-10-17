import { describe, expect, it } from "vitest";
import { buildRead, nextScheduledRead, normalizeContact, parseMoney, parseSheetDate } from "./read.ts";

const fakeHash = async (c: string) => `h(${c})`;

describe("leitura da planilha (Etapa 39.2)", () => {
  it("datas no formato brasileiro, curto e ISO; inválidas viram null", () => {
    expect(parseSheetDate("10/10/2026")).toBe("2026-10-10");
    expect(parseSheetDate("1/2/26 14:30")).toBe("2026-02-01");
    expect(parseSheetDate("10/10/2026 14:33:00")).toBe("2026-10-10");
    expect(parseSheetDate("2026-10-10T14:30:00Z")).toBe("2026-10-10");
    expect(parseSheetDate("31/02/2026")).toBeNull();
    expect(parseSheetDate("ontem")).toBeNull();
    expect(parseSheetDate("10/10/1990")).toBeNull();
  });

  it("valores em reais ou com ponto decimal", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney("1234.5")).toBe(1234.5);
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(parseMoney("350")).toBe(350);
    expect(parseMoney("—")).toBeNull();
  });

  it("contato: telefone só com dígitos (55 quando falta) ou e-mail minúsculo", () => {
    expect(normalizeContact("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizeContact("+55 11 98765-4321")).toBe("5511987654321");
    expect(normalizeContact(" Ana@Loja.COM ")).toBe("ana@loja.com");
    expect(normalizeContact("123")).toBeNull();
    expect(normalizeContact("")).toBeNull();
  });

  it("monta a última leitura: sem telefone legível, ID repetido fica fora, qualidade contada", async () => {
    const headers = ["ID", "Data", "Tipo", "Campanha", "ID do anúncio", "Telefone", "Valor"];
    const mapping = { record_id: "ID", contact_date: "Data", profile: "Tipo", campaign_name: "Campanha", ad_id: "ID do anúncio", contact_key: "Telefone", sale_value: "Valor" };
    const rows = [
      ["A1", "10/10/2026", "Lojista", "Atacado", "120000000001", "(11) 90000-0001", "R$ 500,00"],
      ["A2", "31/02/2026", "Sacoleira", "", "abc", "", ""],
      ["A1", "11/10/2026", "Lojista", "Atacado", "120000000001", "(11) 90000-0001", ""],
      ["", "", "", "", "", "", ""],
      ["", "", "", "Varejo", "", "11900000003", ""],
    ];
    const { rows: out, stats } = await buildRead(headers, rows, mapping, 1, fakeHash);
    expect(out.map((r) => [r.n, r.k])).toEqual([[2, "id:A1"], [3, "id:A2"], [6, "L6"]]);
    expect(out[0]).toMatchObject({ h: "h(5511900000001)", d: "2026-10-10", p: "lojista", cn: "Atacado", aid: "120000000001", sv: 500 });
    expect(out[1]).toMatchObject({ h: null, d: null, p: "sacoleira", aid: null, cn: null });
    expect(JSON.stringify(out)).not.toContain("90000-0001");
    expect(stats).toEqual({ total: 4, stored: 3, duplicates: 1, noDate: 1, invalidDates: 1, noProfile: 1, noOrigin: 1, invalidIds: 1, noContact: 1 });
  });

  it("próxima leitura: 8h, 12h e 16h de Brasília", () => {
    expect(nextScheduledRead(new Date("2026-10-17T10:00:00Z")).toISOString()).toBe("2026-10-17T11:00:00.000Z");
    expect(nextScheduledRead(new Date("2026-10-17T11:00:00Z")).toISOString()).toBe("2026-10-17T15:00:00.000Z");
    expect(nextScheduledRead(new Date("2026-10-17T20:00:00Z")).toISOString()).toBe("2026-10-18T11:00:00.000Z");
  });
});
