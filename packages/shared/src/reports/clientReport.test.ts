import { describe, expect, it } from "vitest";
import {
  actionResultOptions, actionRows, computeReportKpis, funnelStages, mainResultFor, mainResultValue, normalizeReportSettings,
  type ReportTotals, summaryParts, toReportTotals,
} from "./clientReport.ts";

const base: ReportTotals = {
  spend_micros: 700_000_000, impressions: 100_000, clicks: 2_000, link_clicks: 1_500, leads: 50, messages: 20, conversions: 10,
  conversion_value_micros: 2_100_000_000, video_views: null, reach: 40_000, frequency: 2.5,
  actions: { link_click: 1500, landing_page_view: 900, omni_landing_page_view: 900, purchase: 8, omni_purchase: 10, lead: 50, "offsite_conversion.custom.123456789": 4, weird_add_20_s_calls: 99 },
};

describe("dashboard do cliente — métricas", () => {
  it("resultado principal por fonte, sem inventar", () => {
    expect(mainResultValue(base, { source: "leads", label: "Leads" })).toBe(50);
    expect(mainResultValue(base, { source: "action", label: "Compras", action_type: "omni_purchase" })).toBe(10);
    // Conta do Meta com ações, mas sem esta: zero.
    expect(mainResultValue(base, { source: "action", label: "X", action_type: "schedule" })).toBe(0);
    // Sem ações (Google): não informado.
    expect(mainResultValue({ ...base, actions: null }, { source: "action", label: "X", action_type: "lead" })).toBeNull();
    expect(mainResultValue({ ...base, leads: null }, { source: "leads", label: "Leads" })).toBeNull();
  });

  it("no Google o resultado é sempre Conversões", () => {
    expect(mainResultFor({ source: "leads", label: "Leads" }, "google")).toEqual({ source: "conversions", label: "Conversões" });
    expect(mainResultFor({ source: "leads", label: "Leads" }, "meta")).toEqual({ source: "leads", label: "Leads" });
  });

  it("calcula custos e taxas; null quando falta base", () => {
    const k = computeReportKpis(base, { source: "leads", label: "Leads" });
    expect(k.spend).toBe(700);
    expect(k.cost_per_result).toBe(14);
    expect(k.ctr).toBe(2);
    expect(k.link_ctr).toBe(1.5);
    expect(k.cpm).toBe(7);
    expect(k.roas).toBe(3);
    expect(k.video_views).toBeNull();
    const zero = computeReportKpis({ ...base, leads: 0, reach: null, frequency: null }, { source: "leads", label: "Leads" });
    expect(zero.cost_per_result).toBeNull();
    expect(zero.reach).toBeNull();
    expect(zero.frequency).toBeNull();
  });

  it("ações sem contar duas vezes, com nomes em português e sem tipos desconhecidos", () => {
    const rows = actionRows(base.actions, { omni_purchase: 5, lead: 40 });
    const purchase = rows.find((r) => r.id === "purchase")!;
    expect(purchase).toMatchObject({ type: "omni_purchase", value: 10, previous: 5, label: "Compras" });
    expect(rows.filter((r) => r.id === "landing_page_view")).toHaveLength(1);
    expect(rows.find((r) => r.type.startsWith("offsite_conversion.custom"))?.label).toBe("Conversão personalizada (…6789)");
    expect(rows.some((r) => r.type === "weird_add_20_s_calls")).toBe(false);
    expect(actionRows(null, null)).toEqual([]);
    expect(actionResultOptions({ "onsite_conversion.messaging_block": 3, lead: 2 })).toEqual([{ type: "lead", label: "Leads (todos)" }]);
  });

  it("funil com taxas entre etapas", () => {
    const f = funnelStages(base, { source: "leads", label: "Leads" });
    expect(f.map((s) => s.label)).toEqual(["Impressões", "Cliques no link", "Visualizações da página", "Leads"]);
    expect(f[1].rate).toBeCloseTo(1.5);
    expect(f[2].rate).toBeCloseTo(60);
    expect(f[3].rate).toBeCloseTo((50 / 900) * 100);
    // Mensagens: sem a etapa de página. Google (sem link_clicks): usa cliques.
    const g = funnelStages({ ...base, link_clicks: null, actions: null }, { source: "conversions", label: "Conversões" });
    expect(g.map((s) => s.label)).toEqual(["Impressões", "Cliques", "Conversões"]);
    // Etapa maior que a anterior: sem taxa.
    const odd = funnelStages({ ...base, leads: 5000, actions: null }, { source: "leads", label: "Leads" });
    expect(odd[2].rate).toBeNull();
  });

  it("resumo com variação só quando há base", () => {
    const s = summaryParts(base, { ...base, leads: 40, spend_micros: 700_000_000 }, { source: "leads", label: "Leads" });
    expect(s.resultChange).toBeCloseTo(25);
    expect(s.costChange).toBeCloseTo(-20);
    expect(summaryParts(base, null, { source: "leads", label: "Leads" }).resultChange).toBeNull();
  });

  it("modelo: padrão, seções novas ligadas, métricas desconhecidas fora", () => {
    const s = normalizeReportSettings({ kpis: ["spend", "nada" as never], sections: { funnel: false } as never, default_period: "x" as never }, "Loja");
    expect(s.kpis).toEqual(["spend"]);
    expect(s.sections.funnel).toBe(false);
    expect(s.sections.kpis).toBe(true);
    expect(s.default_period).toBe("last_7_days");
    expect(normalizeReportSettings(null, "Loja").title).toBe("Relatório de anúncios · Loja");
  });

  it("converte a linha do banco", () => {
    const t = toReportTotals({ spend_micros: "1000", leads: null, actions: { lead: "3" }, reach: 10 })!;
    expect(t.spend_micros).toBe(1000);
    expect(t.leads).toBeNull();
    expect(t.actions).toEqual({ lead: 3 });
    expect(toReportTotals({ actions: {} })!.actions).toBeNull();
  });
});
