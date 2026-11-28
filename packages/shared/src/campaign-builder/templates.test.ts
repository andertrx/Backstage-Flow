import { describe, expect, it } from "vitest";
import { draftFromMeta, stripAccountSpecific } from "./templates.ts";

const meta = {
  id: "120", name: "STG | CP-7.6 | ENG | WHATS", objective: "OUTCOME_ENGAGEMENT", special_ad_categories: [], daily_budget: "15000", bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  adsets: { data: [{
    id: "s1", name: "CJ-01 | INTERESSES", optimization_goal: "CONVERSATIONS", billing_event: "IMPRESSIONS", destination_type: "WHATSAPP",
    promoted_object: { page_id: "328104960376244" }, start_time: "2026-11-25T00:00:00-0300",
    targeting: { geo_locations: { countries: ["BR"], regions: [{ key: "1" }] }, age_min: 30, age_max: 65, genders: [1, 2],
      flexible_spec: [{ interests: [{ id: "6003", name: "Moda masculina" }] }], custom_audiences: [{ id: "9001" }], targeting_automation: { advantage_audience: 1 } },
  }] },
  ads: { data: [{
    id: "a1", name: "[AD-10] BLACK", adset_id: "s1",
    creative: {
      object_story_spec: { page_id: "328104960376244", instagram_user_id: "1784", video_data: { video_id: "v", message: "Texto 1", title: "Título 1", call_to_action: { type: "WHATSAPP_MESSAGE", value: { link: "https://api.whatsapp.com/send" } } } },
      asset_feed_spec: { bodies: [{ text: "Texto 1" }, { text: "Texto 2" }], titles: [{ text: "Título 1" }] },
      degrees_of_freedom_spec: { creative_features: [{ feature: "inline_comment", enroll_status: "OPT_IN" }] },
    },
  }] },
};

describe("Fase J.5 — Modelos de campanha", () => {
  it("copia campanha, conjunto e anúncio do Meta sem inventar nada", () => {
    const { draft, notes } = draftFromMeta(meta, "BRL");
    expect(draft.campaign.name).toBe("STG | CP-7.6 | ENG | WHATS (cópia)");
    expect(draft.campaign.objective).toBe("OUTCOME_ENGAGEMENT");
    expect(draft.campaign.status).toBe("");
    expect(draft.campaign.budgetLevel).toBe("campaign");
    expect(draft.campaign.budgetAmount).toBe(150);
    const s = draft.adSets[0];
    expect(s).toMatchObject({ optimizationGoal: "CONVERSATIONS", destinationType: "WHATSAPP", pageId: "328104960376244", ageMin: 30, ageMax: 65, gender: "all", advantageAudience: true });
    expect(s.interests).toEqual([{ id: "6003", name: "Moda masculina" }]);
    expect(s.audienceIds).toEqual(["9001"]);
    expect(draft.ads[0]).toMatchObject({ name: "[AD-10] BLACK", primaryText: "Texto 1", headline: "Título 1", cta: "WHATSAPP_MESSAGE", driveFileId: "" });
    const all = notes.join(" | ");
    expect(all).toMatch(/estados, CEPs/);
    expect(all).toMatch(/datas/);
    expect(all).toMatch(/escolhido de novo no Drive/);
    expect(all).toMatch(/várias opções de texto/);
    expect(all).toMatch(/DESLIGADAS/);
    expect(all).toMatch(/Advantage\+/);
  });

  it("objetivo antigo e meta que não combina viram nota, não chute", () => {
    const { draft, notes } = draftFromMeta({ ...meta, objective: "CONVERSIONS" }, "BRL");
    expect(draft.campaign.objective).toBe("");
    expect(draft.adSets[0].optimizationGoal).toBe("");
    expect(notes.join(" ")).toMatch(/versão antiga/);
  });

  it("modelo tira o que é de uma conta só", () => {
    const { draft } = draftFromMeta(meta, "BRL");
    const m = stripAccountSpecific(draft);
    expect(m.draft.adSets[0].pageId).toBe("");
    expect(m.draft.adSets[0].audienceIds).toEqual([]);
    expect(m.draft.ads[0].pageId).toBe("");
    expect(m.draft.ads[0].primaryText).toBe("Texto 1");
    expect(m.draft.adSets[0].interests).toHaveLength(1);
    expect(m.notes.join(" ")).toMatch(/Página e Instagram/);
    expect(m.notes.join(" ")).toMatch(/Públicos personalizados/);
  });
});
