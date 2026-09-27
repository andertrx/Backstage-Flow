import { describe, expect, it } from "vitest";
import type { ReportTotals } from "./clientReport.ts";
import { buildWeeklyEmail, formatPercentChange, summarySentence, weeklyEmailBlocks, type WeeklyEmailInput } from "./email.ts";

const totals = (spend: number, leads: number | null, extra: Partial<ReportTotals> = {}): ReportTotals => ({
  spend_micros: spend * 1_000_000, impressions: 10000, clicks: 200, link_clicks: 150, leads, messages: null, conversions: 3,
  conversion_value_micros: null, video_views: null, reach: null, frequency: null, actions: null, ...extra,
});
const base: WeeklyEmailInput = {
  clientName: "Loja <Teste>",
  title: "Resultados da semana",
  logoUrl: "https://x.supabase.co/storage/v1/object/public/client-logos/a/b.png",
  periodText: "20/09 a 26/09/2026",
  mainResult: { source: "leads", label: "Leads" },
  kpis: ["spend", "main_result", "cost_per_result", "reach", "ctr", "cpm"],
  accounts: [
    { name: "Conta Meta", platformLabel: "Meta Ads", platformId: "meta", currency: "BRL", cur: totals(180, 20), prev: totals(150, 25) },
    { name: "Conta sem dados", platformLabel: "Meta Ads", platformId: "meta", currency: "BRL", cur: null, prev: null },
    { name: "Conta Google", platformLabel: "Google Ads", platformId: "google", currency: "USD", cur: totals(50, null), prev: null },
  ],
  button: { url: "https://www.backstageflow.com.br/r/abc", label: "Ver dashboard completo" },
  agencyNote: "Semana <boa>.",
};
const clean = (s: string) => s.replace(/ /g, " ");

describe("e-mail semanal", () => {
  it("frase de resumo igual à do painel", () => {
    expect(clean(summarySentence({ spend: 180, result: 20, costPerResult: 9, resultChange: -20, costChange: 50 }, { source: "leads", label: "Leads" }, "BRL")))
      .toBe("Foram investidos R$ 180,00 e gerados 20 leads, a R$ 9,00 cada. Comparado ao período anterior: 20,0% menos leads e custo por resultado 50,0% maior.");
    expect(formatPercentChange(-5.26)).toBe("−5,3%");
  });

  it("uma parte por conta com dados; 4 métricas do modelo que existem; Google usa Conversões", () => {
    const blocks = weeklyEmailBlocks(base);
    expect(blocks.map((b) => b.heading)).toEqual(["Meta Ads · Conta Meta", "Google Ads · Conta Google"]);
    expect(blocks[0].kpis.map((k) => k.label)).toEqual(["Investimento", "Leads", "Custo por resultado", "CTR"]);
    const cost = blocks[0].kpis[2];
    expect([clean(cost.value), cost.change, cost.tone]).toEqual(["R$ 9,00", "+50,0%", "bad"]);
    expect(blocks[1].kpis[1].label).toBe("Conversões");
    expect(clean(blocks[1].kpis[0].value)).toBe("US$ 50,00");
    expect(blocks[1].kpis[0].change).toBeNull();
  });

  it("HTML seguro (nomes escapados), com logo, botão e análise; texto puro junto", () => {
    const e = buildWeeklyEmail(base)!;
    expect(e.subject).toBe("Loja <Teste>: resultados de 20/09 a 26/09/2026");
    expect(e.html).toContain("Loja &lt;Teste&gt;");
    expect(e.html).not.toContain("<Teste>");
    expect(e.html).toContain("Semana &lt;boa&gt;.");
    expect(e.html).toContain('href="https://www.backstageflow.com.br/r/abc"');
    expect(e.html).toContain("client-logos/a/b.png");
    expect(e.text).toContain("Ver dashboard completo: https://www.backstageflow.com.br/r/abc");
  });

  it("sem dados na semana: não monta e-mail; botão e logo só com https", () => {
    expect(buildWeeklyEmail({ ...base, accounts: [base.accounts[1]] })).toBeNull();
    const e = buildWeeklyEmail({ ...base, logoUrl: "javascript:alert(1)", button: { url: "http://x", label: "Ver" } })!;
    expect(e.html).not.toContain("javascript:");
    expect(e.html).not.toContain('href="http://x"');
  });
});
