import { describe, expect, it } from "vitest";
import { buildHealthItems, countByStatus, filterHealthItems } from "./rows.ts";
import type { AccountHealthRow } from "./types.ts";

const now = new Date("2026-09-24T12:00:00Z");
const row = (over: Partial<AccountHealthRow>): AccountHealthRow => ({
  ad_account_id: crypto.randomUUID(), client_id: "c1", client_name: "Excalibur", platform_id: "meta", external_id: "111", name: "Conta",
  currency: "BRL", status: "ativa", raw_status: null, status_reason: null, is_test_account: null, details_updated_at: null,
  low_balance_days: 3, low_balance_amount_micros: null, captured_at: null, available_micros: null, issues: [],
  spend_last_7_days_micros: null, spend_days: 0, sync_status: "sucesso", last_attempt_at: null, last_success_at: "2026-09-24T10:00:00Z",
  last_error_message: null, connection_id: "x", connection_status: "ativa", connection_error: null, ...over,
});

const rows = [
  row({ name: "Boa", client_name: "Zeta" }),
  row({ name: "Pendente", status: "pagamento_pendente" }),
  row({ name: "Nova", platform_id: "google", external_id: "1234567890", last_success_at: null, client_id: "c2", client_name: "Alfa" }),
];

describe("lista de saúde", () => {
  it("ordena pelos piores primeiro", () => {
    expect(buildHealthItems(rows, now).map((i) => i.name)).toEqual(["Pendente", "Nova", "Boa"]);
  });

  it("filtra por status, cliente, plataforma e busca (inclusive pelo ID formatado)", () => {
    const items = buildHealthItems(rows, now);
    const base = { query: "", clientId: null, platform: null, status: null };
    expect(filterHealthItems(items, { ...base, status: "atencao" }).map((i) => i.name)).toEqual(["Nova"]);
    expect(filterHealthItems(items, { ...base, clientId: "c2" })).toHaveLength(1);
    expect(filterHealthItems(items, { ...base, platform: "meta" })).toHaveLength(2);
    expect(filterHealthItems(items, { ...base, query: "123-456" }).map((i) => i.name)).toEqual(["Nova"]);
    expect(filterHealthItems(items, { ...base, query: "zeta" }).map((i) => i.name)).toEqual(["Boa"]);
  });

  it("conta por status", () => {
    const c = countByStatus(buildHealthItems(rows, now));
    expect(c).toMatchObject({ ativa: 1, atencao: 1, pagamento_pendente: 1, desativada: 0 });
  });
});
