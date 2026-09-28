import { describe, expect, it } from "vitest";
import { assessBalance, type BalanceInput, describeForecast, PAYMENT_LABELS, paymentKind, shownAvailableMicros } from "./balance.ts";

const M = 1_000_000;
const base: BalanceInput = {
  status: "ativa",
  available_micros: 500 * M,
  spend_last_7_days_micros: 700 * M,
  spend_days: 7,
  low_balance_days: 3,
  low_balance_amount_micros: null,
  issues: [],
  captured_at: "2026-09-24T10:00:00Z",
};
const now = new Date("2026-09-24T12:00:00Z");

describe("saldo", () => {
  it("prevê a duração pelo gasto médio", () => {
    const r = assessBalance(base, now);
    expect(r.avgDailySpendMicros).toBe(100 * M);
    expect(r.forecastDays).toBe(5);
    expect(r.alerts).toEqual([]);
    expect(r.stale).toBe(false);
  });

  it("média usa só os dias com dados", () => {
    expect(assessBalance({ ...base, spend_last_7_days_micros: 300 * M, spend_days: 3 }, now).forecastDays).toBe(5);
  });

  it("saldo baixo por dias ou por valor", () => {
    expect(assessBalance({ ...base, available_micros: 200 * M }, now).alerts.map((a) => a.code)).toEqual(["saldo_baixo"]);
    expect(assessBalance({ ...base, low_balance_amount_micros: 500 * M }, now).alerts.map((a) => a.code)).toEqual(["saldo_baixo"]);
  });

  it("sem saldo é crítico e não vira 'saldo baixo'", () => {
    const r = assessBalance({ ...base, available_micros: 0 }, now);
    expect(r.alerts).toEqual([{ code: "sem_saldo", label: "Sem saldo", severity: "critical" }]);
  });

  it("não inventa: sem disponível informado → sem previsão e sem alerta de saldo", () => {
    const r = assessBalance({ ...base, available_micros: null }, now);
    expect(r.forecastDays).toBeNull();
    expect(r.alerts).toEqual([]);
  });

  it("sem gasto recente → sem previsão", () => {
    expect(assessBalance({ ...base, spend_last_7_days_micros: 0 }, now).forecastDays).toBeNull();
    expect(assessBalance({ ...base, spend_last_7_days_micros: null, spend_days: 0 }, now).avgDailySpendMicros).toBeNull();
  });

  it("problemas da plataforma e do status viram alertas, críticos primeiro", () => {
    const r = assessBalance({ ...base, status: "restrita", issues: ["pagamento_pendente", "sem_forma_pagamento", "desconhecido"] }, now);
    expect(r.alerts.map((a) => a.code)).toEqual(["pagamento_pendente", "sem_forma_pagamento", "conta_limitada"]);
    expect(assessBalance({ ...base, status: "pagamento_pendente", issues: ["pagamento_pendente"] }, now).alerts).toHaveLength(1);
  });

  it("marca fotografia antiga", () => {
    expect(assessBalance({ ...base, captured_at: "2026-09-22T10:00:00Z" }, now).stale).toBe(true);
  });

  it("descreve a previsão", () => {
    expect(describeForecast(0.4)).toBe("menos de 1 dia");
    expect(describeForecast(1.9)).toBe("cerca de 1 dia");
    expect(describeForecast(5.2)).toBe("cerca de 5 dias");
    expect(describeForecast(400)).toBe("mais de 1 ano");
  });
});

describe("forma de pagamento e valor disponível", () => {
  const base = { available_micros: null, is_prepay: false, funding_description: null };
  it("saldo pré-pago (PIX/boleto) mostra o saldo real", () => {
    const b = { ...base, available_basis: "meta_prepaid_balance", available_micros: 1345_320_000, is_prepay: true };
    expect(paymentKind(b)).toBe("pre_pago");
    expect(shownAvailableMicros(b)).toBe(1345_320_000);
  });
  it("cartão mostra R$ 0,00 (o limite nunca vira disponível)", () => {
    const b = { ...base, available_basis: "meta_card", funding_description: "Mastercard *2596" };
    expect(paymentKind(b)).toBe("cartao");
    expect(shownAvailableMicros(b)).toBe(0);
  });
  it("cartão numa conta pré-paga: as duas formas, saldo só se informado", () => {
    const b = { ...base, available_basis: "meta_card", is_prepay: true };
    expect(paymentKind(b)).toBe("cartao_pre_pago");
    expect(PAYMENT_LABELS[paymentKind(b)]).toBe("Cartão + saldo pré-pago");
    expect(shownAvailableMicros(b)).toBeNull();
  });
  it("sem informação e orçamento do Google", () => {
    expect(paymentKind({ ...base, available_basis: null })).toBe("nao_informado");
    expect(shownAvailableMicros({ ...base, available_basis: null })).toBeNull();
    expect(paymentKind({ ...base, available_basis: "google_account_budget", available_micros: 5 })).toBe("orcamento");
  });
  it("cartão não gera alerta de sem saldo", () => {
    expect(assessBalance({ status: "ativa", available_micros: null, spend_last_7_days_micros: 100, spend_days: 2, low_balance_days: 3,
      low_balance_amount_micros: null, issues: [], captured_at: null }).alerts).toEqual([]);
  });
});
