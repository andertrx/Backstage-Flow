import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { CampaignRow } from "@/features/campaigns/types.ts";
import type { SummaryRow } from "@/features/dashboard/types.ts";
import { reportCsvRows, reportXlsx } from "./export.ts";
import { buildReport, formatCell, reportFileName } from "./model.ts";

const summary = (currency: string, spend: number, leads: number | null, extra: Partial<SummaryRow> = {}): SummaryRow => ({
  currency, source_level: "account", spend_micros: spend * 1_000_000, impressions: 10_000, clicks: 250, link_clicks: null, leads,
  messages: null, conversions: 0, conversion_value_micros: 0, accounts: 1, campaigns: 2, days_with_data: 7, last_synced_at: null, ...extra,
});
const campaign = (name: string, currency: string, spend: number): CampaignRow => ({
  campaign_id: name, client_id: "c", client_name: "Excalibur", ad_account_id: "a", account_name: "Conta", objective: null,
  name, external_id: "1", platform_id: "meta", currency, status: "ativa", raw_status: null, budget_micros: null, budget_period: null,
  has_data: true, spend_micros: spend * 1_000_000, impressions: 1000, reach: null, frequency: null, clicks: 20, ctr: 2, cpc_micros: 5_000_000,
  cpm_micros: null, leads: 4, messages: null, conversions: null, conversion_value_micros: null, cpl_micros: 25_000_000, cpa_micros: null,
  roas: null, total_count: 1,
});

const report = buildReport({
  filters: ["Cliente: Excalibur", "Período: 17/09/2026 a 23/09/2026"],
  summary: { current: [summary("BRL", 1000, 40), summary("USD", 200, null)], previous: [summary("BRL", 800, 50)] },
  campaigns: [campaign("Leads Setembro", "BRL", 100), campaign("US Launch", "USD", 50)],
  daily: [
    { bucket: "2026-09-18", platform_id: null, currency: "BRL", spend_micros: 150_000_000, impressions: 1000, reach: null, clicks: 10, leads: 3, messages: null, conversions: null, conversion_value_micros: null },
    { bucket: "2026-09-17", platform_id: null, currency: "BRL", spend_micros: 100_000_000, impressions: 1000, reach: null, clicks: 0, leads: 0, messages: null, conversions: null, conversion_value_micros: null },
  ],
  generatedAt: new Date("2026-09-24T12:00:00Z"),
});

describe("relatório", () => {
  it("uma tabela por moeda e por parte (nunca soma BRL com USD)", () => {
    expect(report.tables.map((t) => t.title)).toEqual(["Resumo (BRL)", "Resumo (USD)", "Campanhas (BRL)", "Campanhas (USD)", "Dia a dia (BRL)"]);
  });

  it("resumo: período, anterior e variação; sem valor explica o motivo", () => {
    const brl = report.tables[0];
    const spend = brl.rows[0];
    expect(spend.map((c) => formatCell(c, "BRL")).map((s) => s.replace(/ /g, " "))).toEqual(["Investimento", "R$ 1.000,00", "R$ 800,00", "+25,0%"]);
    const usdCpl = report.tables[1].rows.find((r) => r[0].value === "CPL")!;
    expect(usdCpl[1].value).toBe("Informação não disponível pela API.");
    expect(formatCell(usdCpl[2], "USD")).toBe("—");
  });

  it("dia a dia em ordem de data; CTR/CPC sem clique ficam vazios", () => {
    const daily = report.tables[4];
    expect(daily.rows.map((r) => r[0].value)).toEqual(["17/09/2026", "18/09/2026"]);
    expect(daily.rows[0][4].value).toBe(0);
    expect(daily.rows[0][5].value).toBeNull();
  });

  it("CSV: número em português sem símbolo; vazio quando não há dado", () => {
    const rows = reportCsvRows(report);
    expect(rows[0]).toEqual(["Relatório de desempenho"]);
    const leads = rows.find((r) => r[0] === "Leads Setembro")!;
    expect(leads.slice(5, 10)).toEqual(["100,00", "1000", "", "20", "2,00"]);
  });

  it("Excel: arquivo .xlsx válido com as abas e números de verdade", () => {
    const files = unzipSync(reportXlsx(report));
    expect(Object.keys(files)).toContain("xl/worksheets/sheet3.xml");
    const workbook = strFromU8(files["xl/workbook.xml"]);
    expect(workbook).toContain('name="Resumo"');
    expect(workbook).toContain('name="Campanhas"');
    expect(workbook).toContain('name="Dia a dia"');
    const campaigns = strFromU8(files["xl/worksheets/sheet2.xml"]);
    expect(campaigns).toContain("Leads Setembro");
    expect(campaigns).toMatch(/<c r="F3" s="2"><v>100<\/v><\/c>/); // investimento como número (formato dinheiro)
    expect(campaigns).toMatch(/<c r="J3" s="5"><v>0.02<\/v><\/c>/); // CTR 2% como fração
  });

  it("nome do arquivo sem acentos nem espaços", () => {
    expect(reportFileName(["Excalibur Fitness", "Últimos 7 dias"], "pdf")).toBe("relatorio-excalibur-fitness-ultimos-7-dias.pdf");
    expect(reportFileName([], "csv")).toBe("relatorio-geral.csv");
  });
});
