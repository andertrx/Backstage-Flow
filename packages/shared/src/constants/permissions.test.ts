import { describe, expect, it } from "vitest";
import { can, PERMISSIONS } from "./permissions.ts";
import { isRole, ROLES } from "./roles.ts";

describe("papéis", () => {
  it("reconhece somente os 5 papéis válidos", () => {
    expect(ROLES).toHaveLength(5);
    expect(isRole("admin")).toBe(true);
    expect(isRole("superadmin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("permissões", () => {
  it("administrador pode tudo", () => {
    for (const permission of PERMISSIONS) expect(can("admin", permission)).toBe(true);
  });

  it("somente administrador gerencia usuários", () => {
    expect(ROLES.filter((role) => can(role, "users.manage"))).toEqual(["admin"]);
  });

  it("cliente não vê nada interno da agência", () => {
    for (const permission of PERMISSIONS) expect(can("cliente", permission)).toBe(false);
  });

  it("visualizador só lê", () => {
    expect(can("visualizador", "clients.view")).toBe(true);
    expect(can("visualizador", "clients.edit")).toBe(false);
    expect(can("visualizador", "sync.run")).toBe(false);
  });

  it("sem papel, sem permissão", () => {
    expect(can(null, "clients.view")).toBe(false);
  });
});
