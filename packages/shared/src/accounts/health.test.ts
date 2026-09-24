import { describe, expect, it } from "vitest";
import { accountHealth, type HealthInput } from "./health.ts";

const now = new Date("2026-09-24T12:00:00Z");
const ok: HealthInput = {
  status: "ativa", available_micros: null, spend_last_7_days_micros: null, spend_days: 0, low_balance_days: 3,
  low_balance_amount_micros: null, issues: [], captured_at: "2026-09-24T10:00:00Z",
  sync_status: "sucesso", last_success_at: "2026-09-24T09:00:00Z", last_error_message: null,
  connection_id: "c1", connection_status: "ativa", connection_error: null,
};

describe("saúde da conta", () => {
  it("tudo em ordem → Ativa, sem motivos", () => {
    expect(accountHealth(ok, now)).toEqual({ status: "ativa", reasons: [] });
  });

  it("nunca sincronizada → Atenção", () => {
    expect(accountHealth({ ...ok, sync_status: "pendente", last_success_at: null }, now)).toEqual({ status: "atencao", reasons: ["Ainda não sincronizada."] });
  });

  it("sincronização atrasada e saldo baixo → Atenção com os dois motivos", () => {
    const h = accountHealth({ ...ok, last_success_at: "2026-09-21T09:00:00Z", available_micros: 100, spend_last_7_days_micros: 700, spend_days: 7 }, now);
    expect(h.status).toBe("atencao");
    expect(h.reasons).toEqual(["Saldo baixo.", "Sincronização atrasada (mais de 48 horas)."]);
  });

  it("erro de sincronização mostra a mensagem do servidor", () => {
    expect(accountHealth({ ...ok, sync_status: "erro", last_error_message: "O token do Meta expirou." }, now))
      .toEqual({ status: "erro_sincronizacao", reasons: ["O token do Meta expirou."] });
    expect(accountHealth({ ...ok, connection_status: "revogada" }, now).status).toBe("erro_sincronizacao");
    expect(accountHealth({ ...ok, connection_id: null, connection_status: null }, now).status).toBe("erro_sincronizacao");
  });

  it("conexão invisível para o papel (null) não vira erro", () => {
    expect(accountHealth({ ...ok, connection_status: null }, now).status).toBe("ativa");
  });

  it("o pior status vence, e todos os motivos aparecem (piores primeiro), sem repetição", () => {
    const h = accountHealth({ ...ok, status: "pagamento_pendente", issues: ["pagamento_pendente", "cobranca_problema"], sync_status: "erro", last_error_message: "Falhou." }, now);
    expect(h.status).toBe("pagamento_pendente");
    expect(h.reasons).toEqual(["A plataforma informa pagamento pendente.", "Problema na cobrança.", "Falhou."]);
    expect(accountHealth({ ...ok, status: "restrita", issues: ["conta_limitada"] }, now).reasons).toEqual(["Conta restrita ou em análise pela plataforma."]);
    expect(accountHealth({ ...ok, issues: ["conta_limitada"] }, now).reasons).toEqual(["Conta limitada."]);
  });

  it("status da plataforma: restrita, desativada, encerrada, desconhecida", () => {
    expect(accountHealth({ ...ok, status: "restrita" }, now).status).toBe("restrita");
    expect(accountHealth({ ...ok, status: "desativada" }, now).status).toBe("desativada");
    expect(accountHealth({ ...ok, status: "encerrada" }, now).status).toBe("desativada");
    expect(accountHealth({ ...ok, status: "desconhecida" }, now).status).toBe("atencao");
    expect(accountHealth({ ...ok, issues: ["cobranca_problema"] }, now).status).toBe("pagamento_pendente");
    expect(accountHealth({ ...ok, available_micros: 0 }, now)).toEqual({ status: "atencao", reasons: ["Sem saldo (limite atingido)."] });
  });
});
