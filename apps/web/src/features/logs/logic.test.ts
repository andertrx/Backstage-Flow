import { describe, expect, it } from "vitest";
import { actorLabel, auditCsvRows, periodStart, toCsv } from "./logic.ts";

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
