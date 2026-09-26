import { describe, expect, it } from "vitest";
import {
  computeExecutive,
  EXECUTIVE_STEPS,
  executiveCurrencies,
  executiveMissingReason,
  type ExecutiveRow,
  groupExecutive,
  sumExecutive,
  totalResults,
} from "./executive.ts";

const row = (over: Partial<ExecutiveRow>): ExecutiveRow => ({
  client_id: "c1", client_name: "Academia", platform_id: "meta", currency: "BRL",
  spend_micros: 100_000_000, leads: 10, messages: 5, conversions: 5, conversion_value_micros: 400_000_000, accounts: 1,
  ...over,
});

const ROWS: ExecutiveRow[] = [
  row({}),
  row({ platform_id: "google", spend_micros: 50_000_000, leads: null, messages: null, conversions: 5, conversion_value_micros: 100_000_000 }),
  row({ client_id: "c2", client_name: "Clínica", spend_micros: 300_000_000, leads: 30, messages: 0, conversions: 0, conversion_value_micros: 0 }),
  row({ client_id: "c3", client_name: "Loja EUA", currency: "USD", spend_micros: 999_000_000, leads: 1, messages: null, conversions: 9, conversion_value_micros: 5_000_000_000 }),
];

describe("dashboard executivo", () => {
  it("a cadeia segue a ordem pedida", () => {
    expect(EXECUTIVE_STEPS.map((s) => s.label)).toEqual(["Investimento total", "Resultados", "Custo por resultado", "Conversões", "ROAS"]);
  });

  it("resultados = leads + mensagens + conversões, ignorando o que a plataforma não informa", () => {
    expect(totalResults({ leads: 10, messages: 5, conversions: 5 })).toBe(20);
    expect(totalResults({ leads: null, messages: null, conversions: 5 })).toBe(5);
    expect(totalResults({ leads: null, messages: null, conversions: null })).toBeNull();
  });

  it("calcula a cadeia do consolidado", () => {
    const brl = sumExecutive(ROWS.filter((r) => r.currency === "BRL"));
    const k = computeExecutive(brl);
    expect(k.spend).toBe(450);
    expect(k.results).toBe(55); // 20 + 5 + 30
    expect(k.cost_per_result).toBeCloseTo(450 / 55);
    expect(k.conversions).toBe(10);
    expect(k.roas).toBeCloseTo(500 / 450);
    expect(brl.accounts).toBe(3);
  });

  it("nunca mistura moedas: cada moeda tem o seu consolidado", () => {
    expect(executiveCurrencies(ROWS)).toEqual(["USD", "BRL"]);
    const byClientBRL = groupExecutive(ROWS, "BRL", "client");
    expect(byClientBRL.map((g) => g.name)).toEqual(["Clínica", "Academia"]);
    expect(byClientBRL.some((g) => g.name === "Loja EUA")).toBe(false);
  });

  it("agrupa por cliente e por plataforma (visão individual)", () => {
    const academia = groupExecutive(ROWS, "BRL", "client").find((g) => g.id === "c1")!;
    expect(computeExecutive(academia.totals).spend).toBe(150);
    const byPlatform = groupExecutive(ROWS, "BRL", "platform", (id) => (id === "meta" ? "Meta Ads" : "Google Ads"));
    expect(byPlatform.map((g) => [g.name, computeExecutive(g.totals).spend])).toEqual([["Meta Ads", 400], ["Google Ads", 50]]);
  });

  it("sem resultados ou sem dado: explica em vez de inventar", () => {
    const t = sumExecutive([row({ leads: 0, messages: 0, conversions: 0, conversion_value_micros: null })]);
    expect(computeExecutive(t).cost_per_result).toBeNull();
    expect(executiveMissingReason("cost_per_result", t)).toBe("Sem resultados no período.");
    expect(computeExecutive(t).roas).toBeNull();
    expect(executiveMissingReason("roas", t)).toBe("Informação não disponível pela API.");
    expect(computeExecutive(sumExecutive([])).spend).toBeNull();
    const semValor = sumExecutive([row({ conversion_value_micros: 0 })]);
    expect(computeExecutive(semValor).roas).toBeNull();
    expect(executiveMissingReason("roas", semValor)).toBe("Sem valor de conversão informado no período.");
  });
});
