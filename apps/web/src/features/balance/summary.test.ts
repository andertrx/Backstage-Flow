import { describe, expect, it } from "vitest";
import { summarizeBalances } from "./summary.ts";
import type { AccountBalance } from "./types.ts";

const M = 1_000_000;
const row = (over: Partial<AccountBalance>): AccountBalance => ({
  ad_account_id: crypto.randomUUID(), client_id: "c", client_name: "Cliente", platform_id: "meta", external_id: "1", name: "Conta",
  currency: "BRL", status: "ativa", is_prepay: null, low_balance_days: 3, low_balance_amount_micros: null, captured_at: null,
  available_micros: null, available_basis: null, amount_spent_micros: null, amount_due_micros: null, spend_cap_micros: null,
  budget_micros: null, budget_end_at: null, funding_description: null, issues: [], spend_last_7_days_micros: null, spend_days: 0, ...over,
});

describe("resumo do saldo", () => {
  it("soma só contas da mesma moeda que informam o disponível", () => {
    const s = summarizeBalances([
      row({ available_micros: 300 * M }),
      row({ available_micros: 200 * M }),
      row({}),
      row({ currency: "USD", available_micros: 50 * M }),
    ], null);
    expect(s).toEqual({ currency: "BRL", availableMicros: 500 * M, reporting: 2, total: 3, alerts: 0, critical: 0 });
  });

  it("respeita a moeda escolhida e conta alertas de todas as contas", () => {
    const s = summarizeBalances([row({ available_micros: 0 }), row({ currency: "USD", issues: ["pagamento_pendente"] }), row({ status: "restrita" })], "USD");
    expect(s.currency).toBe("USD");
    expect(s.availableMicros).toBeNull();
    expect(s.alerts).toBe(3);
    expect(s.critical).toBe(2);
  });

  it("sem contas → nada inventado", () => {
    expect(summarizeBalances([], "BRL")).toEqual({ currency: null, availableMicros: null, reporting: 0, total: 0, alerts: 0, critical: 0 });
  });
});
