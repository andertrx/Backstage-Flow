import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navItemsFor } from "./navigation.ts";

const labels = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((i) => i.label);

describe("menu lateral", () => {
  it("administrador vê todos os itens", () => {
    expect(navItemsFor("admin")).toHaveLength(NAV_ITEMS.length);
  });

  it("somente administrador vê Configurações", () => {
    expect(labels("admin")).toContain("Configurações");
    for (const role of ["gestor", "operador", "visualizador", "cliente"] as const) {
      expect(labels(role)).not.toContain("Configurações");
    }
  });

  it("cliente vê apenas o Dashboard", () => {
    expect(labels("cliente")).toEqual(["Dashboard"]);
  });

  it("operador não vê Logs", () => {
    expect(labels("operador")).not.toContain("Logs");
    expect(labels("gestor")).toContain("Logs");
  });
});
