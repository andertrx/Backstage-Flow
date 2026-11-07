import { describe, expect, it } from "vitest";
import { OPS_DEFAULT_PERMISSIONS, OPS_PERMISSION_LABELS, OPS_PERMISSIONS, OPS_ROLE_TEMPLATES, opsCan } from "./permissions.ts";

describe("permissões da Central de Operações", () => {
  it("toda permissão tem nome em português; padrão inclui o acesso", () => {
    for (const p of OPS_PERMISSIONS) expect(OPS_PERMISSION_LABELS[p].length).toBeGreaterThan(5);
    expect(OPS_DEFAULT_PERMISSIONS).toContain("ops.access");
  });

  it("sem 'acessar a Central' nenhuma outra vale; admin vale tudo", () => {
    expect(opsCan(["ops.tasks.create"], "ops.tasks.create")).toBe(false);
    expect(opsCan(["ops.access", "ops.tasks.create"], "ops.tasks.create")).toBe(true);
    expect(opsCan(["ops.access"], "ops.admin")).toBe(false);
    expect(opsCan(["ops.admin"], "ops.commercial")).toBe(true);
    expect(opsCan(null, "ops.access")).toBe(false);
  });
});

describe("modelos de função (43.3)", () => {
  it("são 4, todos com 'Acessar a Central' e só com permissões que existem", () => {
    expect(OPS_ROLE_TEMPLATES.map((t) => t.id)).toEqual(["gestor_trafego", "operacao", "comercial", "administrador"]);
    for (const t of OPS_ROLE_TEMPLATES) {
      expect(t.permissions).toContain("ops.access");
      for (const p of t.permissions) expect(OPS_PERMISSIONS).toContain(p);
      expect(new Set(t.permissions).size).toBe(t.permissions.length);
    }
  });
  it("só o Comercial tem leads e só o gestor e o administrador têm envios", () => {
    const has = (id: string, p: string) => OPS_ROLE_TEMPLATES.find((t) => t.id === id)!.permissions.includes(p as never);
    expect(has("comercial", "ops.commercial")).toBe(true);
    expect(has("operacao", "ops.commercial")).toBe(false);
    expect(has("gestor_trafego", "ops.envios")).toBe(true);
    expect(has("operacao", "ops.envios")).toBe(false);
    expect(has("administrador", "ops.envios") && has("administrador", "ops.commercial")).toBe(true);
  });
  it("nenhum modelo dá permissão de arquivar tarefas (precisa ser marcada à mão)", () => {
    for (const t of OPS_ROLE_TEMPLATES.filter((x) => x.id !== "administrador")) expect(t.permissions).not.toContain("ops.tasks.archive");
  });
});
