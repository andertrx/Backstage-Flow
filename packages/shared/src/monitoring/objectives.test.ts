import { describe, expect, it } from "vitest";
import { matchesObjectives, OBJECTIVE_GROUP_LABELS, OBJECTIVE_GROUPS, objectiveGroup } from "./objectives.ts";

describe("grupos de objetivo do monitoramento", () => {
  it("objetivos atuais do Meta", () => {
    expect(objectiveGroup("OUTCOME_SALES")).toBe("vendas");
    expect(objectiveGroup("OUTCOME_LEADS")).toBe("leads");
    expect(objectiveGroup("OUTCOME_ENGAGEMENT")).toBe("engajamento");
    expect(objectiveGroup("OUTCOME_TRAFFIC")).toBe("trafego");
    expect(objectiveGroup("OUTCOME_AWARENESS")).toBe("reconhecimento");
    expect(objectiveGroup("OUTCOME_APP_PROMOTION")).toBe("app");
  });
  it("nomes antigos entram no objetivo equivalente", () => {
    expect(objectiveGroup("CONVERSIONS")).toBe("vendas");
    expect(objectiveGroup("MESSAGES")).toBe("engajamento");
    expect(objectiveGroup("LINK_CLICKS")).toBe("trafego");
    expect(objectiveGroup("post_engagement")).toBe("engajamento");
  });
  it("sem objetivo ou Google = outros", () => {
    expect(objectiveGroup(null)).toBe("outros");
    expect(objectiveGroup("")).toBe("outros");
    expect(objectiveGroup("SEARCH")).toBe("outros");
  });
  it("filtro com vários objetivos; vazio = todos", () => {
    expect(matchesObjectives("OUTCOME_SALES", ["vendas", "leads"])).toBe(true);
    expect(matchesObjectives("OUTCOME_TRAFFIC", ["vendas", "leads"])).toBe(false);
    expect(matchesObjectives("OUTCOME_TRAFFIC", [])).toBe(true);
  });
  it("todo grupo tem nome", () => {
    for (const g of OBJECTIVE_GROUPS) expect(OBJECTIVE_GROUP_LABELS[g]).toBeTruthy();
  });
});
