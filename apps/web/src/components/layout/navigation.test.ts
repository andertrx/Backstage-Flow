import { describe, expect, it } from "vitest";
import { gruposRecolhidosPadrao, menuPorPapel, NAV_ITEMS, navGroupsFor, navItemForPath, navItemsFor } from "./navigation.ts";

const labels = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((i) => i.label);

describe("menu lateral", () => {
  it("administrador vê todos os itens", () => {
    expect(navItemsFor("admin")).toHaveLength(NAV_ITEMS.filter((i) => !i.hiddenFor?.includes("admin")).length);
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

  it("papel Equipe vê só Onboarding, Central de Operações, Notificações, Reuniões e (T5.6) Vendas sugeridas", () => {
    expect(labels("equipe")).toEqual(["Vendas sugeridas"]);
    expect(navItemsFor("equipe", ["ops.access"]).map((i) => i.label)).toEqual(["Onboarding", "Central de Operações", "Notificações", "Reuniões", "Vendas sugeridas"]);
    for (const r of ["admin", "gestor", "operador", "visualizador"] as const) expect(labels(r)).not.toContain("Vendas sugeridas"); // esses veem na aba do Tracking
  });

  it("papel Vendedor (T3.1) não vê nenhum item do menu: só a tela de Contatos, que abre sozinha", () => {
    expect(labels("vendedor")).toEqual([]);
    expect(navItemsFor("vendedor", ["ops.access"]).map((i) => i.label)).toEqual([]);
  });

  it("Criador de Anúncios: administrador, gestor e operador (Etapa 42)", () => {
    for (const r of ["admin", "gestor", "operador"] as const) expect(labels(r)).toContain("Criador de Anúncios");
    for (const r of ["visualizador", "equipe", "vendedor", "cliente"] as const) expect(labels(r)).not.toContain("Criador de Anúncios");
  });

  it("operador não vê Logs", () => {
    expect(labels("operador")).not.toContain("Logs");
    expect(labels("gestor")).toContain("Logs");
  });
});

describe("grupos do menu", () => {
  it("a ordem do menu é a da Etapa 21 (Tracking entrou depois de Alertas na Etapa 34; Central de Operações depois de Visão geral na Etapa 36; Monitoramento antes de Alertas na Etapa 37; Inteligência de Resultados depois de Monitoramento na Etapa 39; Criador de Anúncios depois de Campanhas na Etapa 42; Reuniões, Comercial e Envios semanais depois da Central na 43.6/43.7)", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard", "Clientes", "Contas", "Painel", "Comercial", "Onboarding", "Central de Operações", "Notificações", "Reuniões", "Vendas sugeridas", "Configurações da Central", "Envios semanais", "Meta Ads", "Google Ads", "Campanhas", "Criador de Anúncios",
      "Relatórios", "Monitoramento", "Inteligência de Resultados", "Alertas", "Tracking", "Sincronização", "Logs", "Configurações",
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

describe("mapa do menu por papel (43.3)", () => {
  it("admin vê tudo e a Central sempre; equipe só tem a Central com permissão", () => {
    const admin = menuPorPapel("admin");
    expect(admin.central).toBe("sempre");
    expect(admin.groups.flatMap((g) => g.items)).toContain("Configurações");
    const equipe = menuPorPapel("equipe");
    expect(equipe.central).toBe("com_permissao");
    expect(equipe.groups.flatMap((g) => g.items)).toEqual(["Vendas sugeridas"]);
  });
  it("visualizador não vê Relatórios nem Criador de Anúncios; gestor vê Logs mas não Configurações", () => {
    const vis = menuPorPapel("visualizador").groups.flatMap((g) => g.items);
    expect(vis).not.toContain("Relatórios");
    expect(vis).not.toContain("Criador de Anúncios");
    const gestor = menuPorPapel("gestor").groups.flatMap((g) => g.items);
    expect(gestor).toContain("Logs");
    expect(gestor).not.toContain("Configurações");
  });
  it("vendedor e cliente nunca têm a Central", () => {
    expect(menuPorPapel("vendedor").central).toBe("nunca");
    expect(menuPorPapel("cliente").central).toBe("nunca");
  });
  it("a ordem dos grupos do menu continua a mesma", () => {
    const grupos = menuPorPapel("admin").groups.map((g) => g.group);
    expect(grupos).toEqual(["Visão geral", "Anúncios", "Análise", "Sistema"]);
  });
});

describe("grupos recolhidos por padrão (43.3 A)", () => {
  it("só quem acompanha anúncios começa com Sistema recolhido; admin e equipe veem tudo aberto", () => {
    expect(gruposRecolhidosPadrao("gestor")).toEqual(["Sistema"]);
    expect(gruposRecolhidosPadrao("operador")).toEqual(["Sistema"]);
    expect(gruposRecolhidosPadrao("admin")).toEqual([]);
    expect(gruposRecolhidosPadrao("equipe")).toEqual([]);
    expect(gruposRecolhidosPadrao(null)).toEqual([]);
  });
});

describe("Comercial e Envios semanais separados da Central (43.6)", () => {
  it("aparecem logo depois da Central, só para quem tem a permissão de cada um", () => {
    const l = (role: Parameters<typeof navItemsFor>[0], ops: string[]) => navItemsFor(role, ops).map((i) => i.label);
    expect(l("gestor", ["ops.access"])).toContain("Central de Operações");
    expect(l("gestor", ["ops.access"])).not.toContain("Comercial");
    expect(l("gestor", ["ops.access", "ops.commercial"])).toContain("Comercial");
    expect(l("gestor", ["ops.access", "ops.commercial"])).not.toContain("Envios semanais");
    expect(l("equipe", ["ops.access", "ops.envios"])).toContain("Envios semanais");
    expect(l("admin", [])).toEqual(expect.arrayContaining(["Central de Operações", "Comercial", "Envios semanais"]));
    expect(l("cliente", ["ops.access", "ops.commercial"])).not.toContain("Comercial");
    expect(l("vendedor", ["ops.access", "ops.commercial"])).not.toContain("Comercial");
  });
  it("sem a permissão da Central (ops.access) nenhum dos três aparece (só Vendas sugeridas, T5.6)", () => {
    expect(navItemsFor("equipe", ["ops.commercial", "ops.envios"]).map((i) => i.label)).toEqual(["Vendas sugeridas"]);
  });
  it("o item do menu corresponde ao endereço novo", () => {
    expect(navItemForPath("/comercial")?.label).toBe("Comercial");
    expect(navItemForPath("/envios")?.label).toBe("Envios semanais");
    expect(navItemForPath("/operacoes/tarefas")?.label).toBe("Central de Operações");
  });
});
