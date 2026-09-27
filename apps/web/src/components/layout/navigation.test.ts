import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navGroupsFor, navItemForPath, navItemsFor } from "./navigation.ts";

const labels = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((i) => i.label);

describe("menu lateral", () => {
  it("administrador vê todos os itens", () => {
    expect(navItemsFor("admin")).toHaveLength(NAV_ITEMS.length);
  });

  it("somente administrador vê Configurações", () => {
    expect(labels("admin")).toContain("Configurações");
    for (const role of ["gestor", "operador", "visualizador", "equipe", "cliente"] as const) {
      expect(labels(role)).not.toContain("Configurações");
    }
  });

  it("cliente vê apenas o Dashboard", () => {
    expect(labels("cliente")).toEqual(["Dashboard"]);
  });

  it("Central de Operações: admin sempre; os demais só com a permissão da Central", () => {
    expect(labels("admin")).toContain("Central de Operações");
    expect(labels("gestor")).not.toContain("Central de Operações");
    expect(navItemsFor("gestor", ["ops.access"]).map((i) => i.label)).toContain("Central de Operações");
    expect(navItemsFor("gestor", ["ops.kanban.view"]).map((i) => i.label)).not.toContain("Central de Operações");
    expect(navItemsFor("cliente", ["ops.access"]).map((i) => i.label)).toEqual(["Dashboard"]);
  });

  it("papel Equipe vê só a Central de Operações", () => {
    expect(labels("equipe")).toEqual([]);
    expect(navItemsFor("equipe", ["ops.access"]).map((i) => i.label)).toEqual(["Central de Operações"]);
  });

  it("operador não vê Logs", () => {
    expect(labels("operador")).not.toContain("Logs");
    expect(labels("gestor")).toContain("Logs");
  });
});

describe("grupos do menu", () => {
  it("a ordem do menu é a da Etapa 21 (Tracking entrou depois de Alertas na Etapa 34; Central de Operações depois de Visão geral na Etapa 36)", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard", "Clientes", "Contas", "Central de Operações", "Meta Ads", "Google Ads", "Campanhas",
      "Relatórios", "Alertas", "Tracking (em construção)", "Sincronização", "Logs", "Configurações",
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
