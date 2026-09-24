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

import { creativeLabel, levelLabel, optimizationLabel, reviewInfo } from "./labels.ts";

describe("níveis e detalhes", () => {
  it("Meta chama de conjunto; Google de grupo", () => {
    expect(levelLabel("ad_group", "meta")).toBe("Conjunto de anúncios");
    expect(levelLabel("ad_group", "google")).toBe("Grupo de anúncios");
    expect(levelLabel("ad_group", "google", true)).toBe("Grupos de anúncios");
    expect(levelLabel("ad", "meta", true)).toBe("Anúncios");
  });
  it("traduz otimização, criativo e revisão; desconhecido fica como veio", () => {
    expect(optimizationLabel("LEAD_GENERATION")).toBe("Geração de cadastros");
    expect(creativeLabel("RESPONSIVE_SEARCH_AD")).toBe("Anúncio de pesquisa responsivo");
    expect(reviewInfo("DISAPPROVED")).toEqual({ label: "Reprovado", tone: "danger" });
    expect(reviewInfo("NOVO")).toEqual({ label: "NOVO", tone: "neutral" });
    expect(optimizationLabel(null)).toBeNull();
  });
});
