import { describe, expect, it } from "vitest";
import {
  classifyVariation,
  compareSeverity,
  DEFAULT_RULES,
  evaluateComparison,
  hasMinimumVolume,
  intervalNote,
  type MonitorRule,
  type MonitorTotals,
  monitorPeriods,
  monitorValues,
  monitorVariation,
  resolveRule,
  resultKindForObjective,
  resultsFor,
  validateRule,
  worseSeverity,
} from "./monitoring.ts";

const T = (p: Partial<MonitorTotals>): MonitorTotals => ({
  spend_micros: null, impressions: null, reach: null, clicks: null, link_clicks: null,
  leads: null, messages: null, conversions: null, conversion_value_micros: null, ...p,
});

describe("variação", () => {
  it("calcula o exemplo do prompt (R$ 20 → R$ 30 = +50%)", () => {
    expect(monitorVariation(30, 20)).toEqual({ kind: "percent", percent: 50, difference: 10 });
  });
  it("nunca divide por zero", () => {
    expect(monitorVariation(5, 0).kind).toBe("new");
    expect(monitorVariation(0, 0).kind).toBe("no_change");
    expect(monitorVariation(5, null).kind).toBe("no_base");
    expect(monitorVariation(null, 5).kind).toBe("unavailable");
    expect(monitorVariation(Infinity, 5).kind).toBe("unavailable");
  });
  it("queda para zero é −100%", () => {
    expect(monitorVariation(0, 40).percent).toBe(-100);
  });
});

describe("resultado por objetivo", () => {
  it("usa o objetivo da campanha", () => {
    expect(resultKindForObjective("OUTCOME_LEADS")).toBe("leads");
    expect(resultKindForObjective("MESSAGES")).toBe("messages");
    expect(resultKindForObjective("OUTCOME_SALES")).toBe("conversions");
    expect(resultKindForObjective("OUTCOME_TRAFFIC")).toBe("link_clicks");
    expect(resultKindForObjective("OUTCOME_AWARENESS")).toBe("none");
    expect(resultKindForObjective(null)).toBe("mixed");
    expect(resultKindForObjective("SEARCH")).toBe("conversions");
  });
  it("soma leads + mensagens + conversões no nível da conta", () => {
    expect(resultsFor(T({ leads: 3, messages: 2, conversions: null }), "mixed")).toBe(5);
    expect(resultsFor(T({}), "mixed")).toBeNull();
  });
  it("calcula as métricas sem inventar", () => {
    const v = monitorValues(T({ spend_micros: 100_000_000, impressions: 10_000, clicks: 200, leads: 10, reach: 5_000 }), "leads");
    expect(v.cost_per_result).toBe(10);
    expect(v.cpc).toBe(0.5);
    expect(v.cpm).toBe(10);
    expect(v.ctr).toBe(2);
    expect(v.frequency).toBe(2);
    expect(v.roas).toBeNull();
    expect(monitorValues(T({ spend_micros: 1_000_000, leads: 0 }), "leads").cost_per_result).toBeNull();
    expect(monitorValues(T({ spend_micros: 1_000_000 }), "none").results).toBeNull();
  });
});

describe("hierarquia das regras", () => {
  const target = { client_id: "c1", account_id: "a1", campaign_id: "k1", ad_id: "d1" };
  const rule = (scope: MonitorRule["scope"], scope_id: string | null, attention: number, active = true): MonitorRule => ({
    scope, scope_id, metric: "cpc", direction: "up", attention_pct: attention, critical_pct: attention * 2, min_volume: null, active,
  });
  it("vale a mais específica", () => {
    const rules = [rule("global", null, 20), rule("client", "c1", 25), rule("campaign", "k1", 30)];
    expect(resolveRule(rules, "cpc", target)?.attention_pct).toBe(30);
    expect(resolveRule(rules, "cpc", { ...target, campaign_id: "outra" })?.attention_pct).toBe(25);
    expect(resolveRule(rules, "cpc", { ...target, client_id: "c2", campaign_id: null })?.attention_pct).toBe(20);
    expect(resolveRule(rules, "ctr", target)).toBeNull();
  });
  it("regra específica desativada desliga o alerta ali", () => {
    const rules = [rule("global", null, 20), rule("ad", "d1", 20, false)];
    const r = resolveRule(rules, "cpc", target);
    expect(r?.active).toBe(false);
    expect(classifyVariation(monitorVariation(200, 100), r, true).severity).toBe("normal");
  });
  it("valida limites", () => {
    expect(validateRule({ scope: "global", scope_id: null, attention_pct: 20, critical_pct: 40, min_volume: null })).toBeNull();
    expect(validateRule({ scope: "global", scope_id: null, attention_pct: 40, critical_pct: 20, min_volume: null })).toMatch(/crítico/);
    expect(validateRule({ scope: "global", scope_id: null, attention_pct: 0, critical_pct: 20, min_volume: null })).toMatch(/atenção/);
    expect(validateRule({ scope: "client", scope_id: null, attention_pct: 10, critical_pct: 20, min_volume: null })).toMatch(/onde/);
    expect(validateRule({ scope: "global", scope_id: null, attention_pct: 10, critical_pct: 20, min_volume: 1.5 })).toMatch(/inteiro/);
  });
  it("tem a tabela inicial do prompt", () => {
    const by = Object.fromEntries(DEFAULT_RULES.map((r) => [r.metric, [r.direction, r.attention_pct, r.critical_pct]]));
    expect(by).toEqual({
      cost_per_result: ["up", 20, 40], cpc: ["up", 20, 40], cpm: ["up", 20, 40],
      ctr: ["down", 15, 30], results: ["down", 20, 40], roas: ["down", 20, 40],
    });
  });
});

describe("volume mínimo e gravidade", () => {
  const cpcRule = DEFAULT_RULES.find((r) => r.metric === "cpc")!;
  const resultsRule = DEFAULT_RULES.find((r) => r.metric === "results")!;
  it("poucos cliques não geram alerta conclusivo", () => {
    const prev = T({ clicks: 5, impressions: 900 });
    expect(hasMinimumVolume("cpc", T({ clicks: 50 }), prev, "mixed")).toBe(false);
    const c = classifyVariation(monitorVariation(2, 1), cpcRule, false);
    expect(c).toEqual({ severity: "informativo", quality: "amostra_pequena", worsening_pct: 100 });
  });
  it("taxas exigem volume nos dois períodos; resultados só na base", () => {
    expect(hasMinimumVolume("cpc", T({ clicks: 5 }), T({ clicks: 50 }), "mixed")).toBe(false);
    expect(hasMinimumVolume("results", T({ leads: 0 }), T({ leads: 30 }), "leads")).toBe(true);
    expect(hasMinimumVolume("results", T({ leads: 0 }), T({ leads: 30 }), "leads", 40)).toBe(false);
  });
  it("classifica atenção e crítico pelo sentido ruim", () => {
    expect(classifyVariation(monitorVariation(1.25, 1), cpcRule, true).severity).toBe("atencao");
    expect(classifyVariation(monitorVariation(1.4, 1), cpcRule, true).severity).toBe("critico");
    expect(classifyVariation(monitorVariation(0.5, 1), cpcRule, true).severity).toBe("normal"); // CPC caiu = melhorou
    expect(classifyVariation(monitorVariation(70, 100), resultsRule, true).severity).toBe("atencao");
    expect(classifyVariation(monitorVariation(0, 100), resultsRule, true).severity).toBe("critico");
    expect(classifyVariation(monitorVariation(150, 100), resultsRule, true).severity).toBe("normal");
  });
  it("sem base é informativo; investimento nunca passa de informativo", () => {
    expect(classifyVariation(monitorVariation(1, null), cpcRule, true)).toMatchObject({ severity: "informativo", quality: "sem_base" });
    expect(classifyVariation(monitorVariation(null, null), cpcRule, true)).toMatchObject({ severity: "normal", quality: "sem_base" });
    expect(classifyVariation(monitorVariation(null, 10), cpcRule, true).severity).toBe("normal");
    const spend: MonitorRule = { ...cpcRule, metric: "spend", direction: "both" };
    expect(classifyVariation(monitorVariation(50, 100), spend, true).severity).toBe("informativo");
  });
});

describe("períodos", () => {
  // 30/09/2026 é quarta-feira; 15h em São Paulo.
  const now = new Date("2026-09-30T18:00:00Z");
  it("últimos 7 dias × 7 anteriores, sem hoje", () => {
    expect(monitorPeriods("last_7_days", "America/Sao_Paulo", now)).toMatchObject({
      current: { from: "2026-09-23", to: "2026-09-29" }, previous: { from: "2026-09-16", to: "2026-09-22" }, partial: false, same_length: true,
    });
    expect(monitorPeriods("last_3_days", "America/Sao_Paulo", now).previous).toEqual({ from: "2026-09-24", to: "2026-09-26" });
  });
  it("hoje é parcial", () => {
    const p = monitorPeriods("today", "America/Sao_Paulo", now);
    expect(p.partial).toBe(true);
    expect(p.note).toMatch(/parcial/);
    expect(p.previous).toEqual({ from: "2026-09-29", to: "2026-09-29" });
  });
  it("semana atual respeita os dias decorridos", () => {
    const p = monitorPeriods("this_week", "America/Sao_Paulo", now);
    expect(p.current).toEqual({ from: "2026-09-28", to: "2026-09-30" });
    expect(p.previous).toEqual({ from: "2026-09-21", to: "2026-09-23" });
    expect(monitorPeriods("last_week", "America/Sao_Paulo", now).current).toEqual({ from: "2026-09-21", to: "2026-09-27" });
  });
  it("mês atual × mesmos dias do mês anterior, avisando durações diferentes", () => {
    const p = monitorPeriods("this_month", "America/Sao_Paulo", now);
    expect(p.current).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(p.previous).toEqual({ from: "2026-08-01", to: "2026-08-30" });
    const mar31 = monitorPeriods("this_month", "America/Sao_Paulo", new Date("2026-03-31T15:00:00Z"));
    expect(mar31.previous).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(mar31.same_length).toBe(false);
    expect(mar31.note).toMatch(/durações diferentes/);
  });
  it("mês anterior e personalizado", () => {
    expect(monitorPeriods("last_month", "America/Sao_Paulo", now)).toMatchObject({
      current: { from: "2026-08-01", to: "2026-08-31" }, previous: { from: "2026-07-01", to: "2026-07-31" },
    });
    expect(monitorPeriods("custom", "America/Sao_Paulo", now, { from: "2026-09-10", to: "2026-09-19" }).previous)
      .toEqual({ from: "2026-08-31", to: "2026-09-09" });
  });
  it("fuso da conta decide o que é hoje", () => {
    const late = new Date("2026-10-01T01:00:00Z"); // 22h de 30/09 em SP, 01/10 em UTC
    expect(monitorPeriods("yesterday", "America/Sao_Paulo", late).current.from).toBe("2026-09-29");
    expect(monitorPeriods("yesterday", "UTC", late).current.from).toBe("2026-09-30");
  });
  it("avisa quando a avaliação é mais frequente que a atualização", () => {
    expect(intervalNote(15)).toMatch(/dados novos/);
    expect(intervalNote(60)).toBeNull();
  });
});

describe("avaliação de uma comparação", () => {
  const base = { level: "campaign" as const, objective: "OUTCOME_LEADS", coverage: "completa" as const, partial: false,
    target: { client_id: "c1", account_id: "a1", campaign_id: "k1", ad_id: null } };
  const prev = T({ spend_micros: 200_000_000, impressions: 20_000, clicks: 400, leads: 20 });
  it("custo por lead +60% e leads −50% = crítico", () => {
    const e = evaluateComparison({ ...base, previous: prev, current: T({ spend_micros: 160_000_000, impressions: 20_000, clicks: 400, leads: 10 }) }, DEFAULT_RULES);
    expect(e.resultKind).toBe("leads");
    expect(e.metrics.cost_per_result.current).toBe(16);
    expect(e.metrics.cost_per_result.previous).toBe(10);
    expect(e.metrics.cost_per_result.severity).toBe("critico");
    expect(e.metrics.results.severity).toBe("critico");
    expect(e.metrics.spend.severity).toBe("normal"); // sem regra de investimento por padrão
    expect(e.metrics.roas.variation.kind).toBe("unavailable");
    expect(e.worst).toBe("critico");
  });
  it("período parcial e histórico incompleto viram informativo", () => {
    const cur = T({ spend_micros: 160_000_000, impressions: 20_000, clicks: 400, leads: 10 });
    const p = evaluateComparison({ ...base, partial: true, previous: prev, current: cur }, DEFAULT_RULES);
    expect(p.metrics.results).toMatchObject({ severity: "informativo", quality: "periodo_parcial" });
    const h = evaluateComparison({ ...base, coverage: "parcial", previous: prev, current: cur }, DEFAULT_RULES);
    expect(h.metrics.results).toMatchObject({ severity: "informativo", quality: "historico_incompleto" });
    expect(h.worst).toBe("informativo");
  });
  it("conta soma leads + mensagens + conversões; alcance sem custo por resultado", () => {
    const acc = evaluateComparison({ ...base, level: "account", previous: T({ leads: 5, messages: 5 }), current: T({ leads: 5, messages: 5, conversions: 2 }) }, DEFAULT_RULES);
    expect(acc.resultKind).toBe("mixed");
    expect(acc.metrics.results.current).toBe(12);
    const aw = evaluateComparison({ ...base, objective: "OUTCOME_AWARENESS", previous: prev, current: prev }, DEFAULT_RULES);
    expect(aw.metrics.cost_per_result.variation.kind).toBe("unavailable");
  });
  it("ordena gravidades", () => {
    expect((["normal", "critico", "informativo", "atencao"] as const).slice().sort(compareSeverity)).toEqual(["critico", "atencao", "informativo", "normal"]);
    expect(worseSeverity("atencao", "informativo")).toBe("atencao");
  });
});
