import type { RiResultItem, RiResults } from "@backstage/shared";
import { describe, expect, it } from "vitest";
import { reportCsvRows } from "@/features/reports/export.ts";
import { resultsFileName, resultsReport } from "./export.ts";

const item = (name: string, p: Partial<RiResultItem>): RiResultItem => ({
  id: name, name, status: null, platform_id: "meta", campaign_id: null, campaign_name: "Atacado SP", ad_group_id: null, ad_group_name: "Lojistas",
  thumbnail_url: null, contacts: 0, by_name: 0, spend: [], lojista: 0, sacoleiro: 0, consumidor_final: 0, nao_identificado: 0, ...p,
});
const results = (items: RiResultItem[]): RiResults => ({
  read_at: "2026-10-17T11:00:00Z", sources: 1, level: "campaign", scope_contacts: 8, scope_without_level: 0, outside: { no_date: 1, all_rows: 10 },
  totals: { rows: 8, contacts: 8, lojista: 5, sacoleiro: 1, consumidor_final: 1, nao_identificado: 1, with_origin: 6, origin_ad: 6, origin_ad_group: 0,
    origin_campaign: 0, origin_by_name: 0, no_origin: 1, not_found: 0, ambiguous: 1 },
  items,
});
const camps = results([
  item("Atacado SP", { contacts: 3, lojista: 2, sacoleiro: 1, spend: [{ currency: "BRL", spend_micros: 100_000_000 }] }),
  item("Revenda RJ", { contacts: 2, lojista: 2, spend: [{ currency: "BRL", spend_micros: 30_000_000 }] }),
  item("Global", { contacts: 1, lojista: 1, spend: [{ currency: "BRL", spend_micros: 1 }, { currency: "USD", spend_micros: 1 }] }),
  item("Varejo", { contacts: 1, consumidor_final: 1 }),
]);
const base = { clientName: "Excalibur Moda", range: { from: "2026-10-10", to: "2026-10-16" }, campaigns: camps, adGroups: results([]), ads: results([]), generatedAt: new Date("2026-10-18T12:00:00Z") };

describe("exportação da Inteligência de Resultados (Etapa 39.5)", () => {
  it("por perfil: ranking com posição, empate, custo e sem misturar moedas", () => {
    const r = resultsReport({ ...base, profile: "lojista" });
    const t = r.tables.find((x) => x.sheet === "Campanhas")!;
    expect(t.columns.slice(0, 4)).toEqual(["Posição", "Empate", "Campanha", "Lojistas"]);
    expect(t.rows.map((row) => [row[0].value, row[1].value, row[2].value, row[3].value])).toEqual([
      [1, "sim", "Atacado SP", 2], [1, "sim", "Revenda RJ", 2], [3, "não", "Global", 1],
    ]);
    const custo = t.columns.indexOf("Custo por lojista");
    expect(t.rows[1][custo].value).toBe(15);
    const global = t.rows[2];
    expect(global[t.columns.indexOf("Investimento")].value).toBeNull();
    expect(global[t.columns.indexOf("Moeda")].value).toBe("BRL + USD");
    expect(global[custo].value).toBeNull();
    expect(t.rows.some((row) => row[2].value === "Varejo")).toBe(false);
  });

  it("todos os perfis: uma coluna por perfil, ordem por contatos; resumo e cabeçalho sem dados pessoais", () => {
    const r = resultsReport({ ...base, profile: "todos" });
    const t = r.tables.find((x) => x.sheet === "Campanhas")!;
    expect(t.columns).toContain("Não identificados");
    expect(t.rows.map((row) => row[0].value)).toEqual(["Atacado SP", "Revenda RJ", "Global", "Varejo"]);
    const csv = reportCsvRows(r).map((l) => l.join(";")).join("\n");
    expect(csv).toContain("Cliente: Excalibur Moda");
    expect(csv).toContain("Contatos classificados (%);87,50");
    expect(csv).toContain("Sem dados pessoais");
  });

  it("nome do arquivo", () => {
    expect(resultsFileName("Excalibur Moda", "consumidor_final", base.range, "xlsx")).toBe("inteligencia-excalibur-moda-consumidores-finais-2026-10-10-a-2026-10-16.xlsx");
  });
});
