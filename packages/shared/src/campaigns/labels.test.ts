import { describe, expect, it } from "vitest";
import { CAMPAIGN_STATUS_FILTERS, ENTITY_STATUS_LABELS, objectiveLabel } from "./labels.ts";

describe("textos de campanhas", () => {
  it("traduz objetivos conhecidos e mantém os desconhecidos", () => {
    expect(objectiveLabel("OUTCOME_LEADS")).toBe("Cadastros (leads)");
    expect(objectiveLabel("PERFORMANCE_MAX")).toBe("Performance Max");
    expect(objectiveLabel("NOVO_OBJETIVO")).toBe("NOVO_OBJETIVO");
    expect(objectiveLabel(null)).toBeNull();
  });
  it("filtro 'encerrada' inclui arquivadas", () => {
    expect(CAMPAIGN_STATUS_FILTERS.encerrada).toEqual(["encerrada", "arquivada"]);
    expect(ENTITY_STATUS_LABELS.erro).toBe("Com erro");
  });
});
