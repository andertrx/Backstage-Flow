import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navGroupsFor, navItemForPath, navItemsFor } from "./navigation.ts";

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

describe("grupos do menu", () => {
  it("a ordem do menu é exatamente a da Etapa 21", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard", "Clientes", "Contas", "Meta Ads", "Google Ads", "Campanhas",
      "Relatórios", "Alertas", "Sincronização", "Logs", "Configurações",
    ]);
  });

  it("agrupar não muda a ordem e cada grupo aparece uma vez", () => {
    const groups = navGroupsFor("admin");
    expect(groups.flatMap((g) => g.items.map((i) => i.label))).toEqual(labels("admin"));
    expect(new Set(groups.map((g) => g.group)).size).toBe(groups.length);
  });

  it("grupos sem itens visíveis somem", () => {
    expect(navGroupsFor("cliente")).toEqual([{ group: "Visão geral", items: [NAV_ITEMS[0]] }]);
  });

  it("encontra o item do menu pelo endereço", () => {
    expect(navItemForPath("/")?.label).toBe("Dashboard");
    expect(navItemForPath("/clientes/123")?.label).toBe("Clientes");
    expect(navItemForPath("/configuracoes/permissoes")?.label).toBe("Configurações");
    expect(navItemForPath("/minha-conta")).toBeUndefined();
  });
});
