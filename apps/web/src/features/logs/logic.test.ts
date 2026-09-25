import { describe, expect, it } from "vitest";
import { actorLabel, auditCsvRows, errorCsvRows, errorWhere, periodStart, toCsv } from "./logic.ts";

describe("logs", () => {
  it("quem fez", () => {
    expect(actorLabel({ actor_id: null, actor_name: null, actor_email: null })).toBe("Sistema (automático)");
    expect(actorLabel({ actor_id: "u", actor_name: null, actor_email: "a@b.com" })).toBe("a@b.com");
    expect(actorLabel({ actor_id: "u", actor_name: "Ana", actor_email: "a@b.com" })).toBe("Ana");
  });

  it("período", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(periodStart("7", now)).toBe("2026-09-17T12:00:00.000Z");
    expect(periodStart("todos", now)).toBeNull();
  });

  it("planilha com ponto e vírgula e aspas", () => {
    expect(toCsv([["a", 'diz "oi"; tchau']])).toBe('﻿a;"diz ""oi""; tchau"');
    const rows = auditCsvRows([{ id: 1, created_at: "2026-09-24T12:00:00Z", actor_id: null, actor_name: null, actor_email: null,
      action: "client.insert", target_type: "client", target_id: "c", target_label: "Excalibur", details: { name: "Excalibur" } }]);
    expect(rows[1].slice(1)).toEqual(["Sistema (automático)", "", "Cadastrou cliente", "Excalibur", "Nome: Excalibur"]);
  });
});

describe("erros técnicos", () => {
  const row = {
    id: 1, occurred_at: "2026-09-25T12:00:00Z", source: "sincronizacao", code: "RATE_LIMITED",
    user_message: "Não conseguimos atualizar os dados desta conta.", technical: "RATE_LIMITED — Error: pausa",
    context: { periodo: "2026-09-01..2026-09-25", pagina: "/" }, user_id: null, user_name: null,
    ad_account_id: "a", account_name: "Conta A", client_id: "c", client_name: "Cliente C",
  };

  it("onde aconteceu", () => {
    expect(errorWhere(row)).toBe("Cliente: Cliente C · Conta: Conta A · Tela: /");
    expect(errorWhere({ ...row, client_name: null, account_name: null, context: {} })).toBe("");
  });

  it("planilha", () => {
    const rows = errorCsvRows([row]);
    expect(rows[0]).toContain("Detalhe técnico");
    expect(rows[1].slice(1, 4)).toEqual(["Sincronização", "RATE_LIMITED", "Não conseguimos atualizar os dados desta conta."]);
    expect(rows[1][6]).toBe("periodo: 2026-09-01..2026-09-25 | pagina: /");
  });
});
