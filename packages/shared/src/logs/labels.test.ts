import { describe, expect, it } from "vitest";
import { auditActionLabel, describeAuditDetails, formatAuditValue } from "./labels.ts";

describe("logs: nomes em português", () => {
  it("ações conhecidas e desconhecidas", () => {
    expect(auditActionLabel("auth.login")).toBe("Entrou no sistema");
    expect(auditActionLabel("client.insert")).toBe("Cadastrou cliente");
    expect(auditActionLabel("algo.novo")).toBe("algo.novo");
  });

  it("valores", () => {
    expect(formatAuditValue("active", true)).toBe("Sim");
    expect(formatAuditValue("role", "gestor")).toBe("Gestor");
    expect(formatAuditValue("low_balance_amount_micros", 150_500_000)).toBe("150,50");
    expect(formatAuditValue("status", null)).toBe("vazio");
  });

  it("alteração pelo banco: só campos que importam", () => {
    expect(describeAuditDetails("ad_account.update", {
      status: { before: "ativa", after: "pagamento_pendente" },
      details_updated_at: { before: "a", after: "b" },
    })).toEqual(["Status: Ativa → Pagamento pendente"]);
  });

  it("alteração de usuário (antes/depois)", () => {
    expect(describeAuditDetails("user.update", {
      before: { full_name: "Maria", role: "operador", active: true },
      after: { role: "gestor" },
    })).toEqual(["Papel: Operador → Gestor"]);
  });

  it("cadastro: campos principais, nunca ids internos", () => {
    const lines = describeAuditDetails("client.insert", { id: "x", name: "Excalibur", created_by: "y", status: "ativo" });
    expect(lines).toEqual(["Nome: Excalibur", "Status: Ativo"]);
  });
});
