import { describe, expect, it } from "vitest";
import { OPS_DEFAULT_PERMISSIONS, OPS_PERMISSION_LABELS, OPS_PERMISSIONS, opsCan } from "./permissions.ts";

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
