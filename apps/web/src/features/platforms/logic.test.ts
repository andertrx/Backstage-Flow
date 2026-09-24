import { describe, expect, it } from "vitest";
import type { DashboardFilters } from "@/features/dashboard/filters.ts";
import type { FilterAccount } from "@/features/dashboard/types.ts";
import { PLATFORM_VIEWS, platformKpiLabel, REACH_REASONS, reachScope, summarizeStructure } from "./logic.ts";

const f = (patch: Partial<DashboardFilters> = {}): DashboardFilters => ({
  period: "last_7_days", from: null, to: null, clientId: null, platform: null, accountId: null, campaignId: null, status: null, currency: null, ...patch,
});
const acc = (id: string, client_id: string, platform_id = "meta"): FilterAccount =>
  ({ id, client_id, platform_id, external_id: `x${id}`, name: id, currency: "BRL" });
const accounts = [acc("a1", "c1"), acc("a2", "c1"), acc("a3", "c2"), acc("g1", "c2", "google")];

describe("alcance", () => {
  it("várias contas: não soma, explica", () => {
    expect(reachScope(f(), accounts, "meta")).toEqual({ kind: "none", reason: REACH_REASONS.manyAccounts });
    expect(reachScope(f({ clientId: "c1" }), accounts, "meta")).toEqual({ kind: "none", reason: REACH_REASONS.manyAccounts });
  });
  it("uma conta só (por cliente ou por filtro de conta)", () => {
    expect(reachScope(f({ clientId: "c2" }), accounts, "meta")).toEqual({ kind: "account", adAccountId: "a3", externalId: "xa3" });
    expect(reachScope(f({ accountId: "a1" }), accounts, "meta")).toEqual({ kind: "account", adAccountId: "a1", externalId: "xa1" });
  });
  it("campanha escolhida usa o alcance da campanha; filtro de status não soma", () => {
    expect(reachScope(f({ campaignId: "k1", status: "ativa" }), accounts, "meta")).toEqual({ kind: "campaign", campaignId: "k1" });
    expect(reachScope(f({ status: "ativa", accountId: "a1" }), accounts, "meta")).toEqual({ kind: "none", reason: REACH_REASONS.manyCampaigns });
  });
  it("conta de outra plataforma não conta", () => {
    expect(reachScope(f({ accountId: "g1" }), accounts, "meta")).toEqual({ kind: "none", reason: REACH_REASONS.noAccount });
  });
});

describe("estrutura", () => {
  it("soma por nível e separa ativas, pausadas e com erro", () => {
    const s = summarizeStructure([
      { level: "campaign", status: "ativa", total: 2 },
      { level: "campaign", status: "pausada", total: 1 },
      { level: "campaign", status: "encerrada", total: 4 },
      { level: "ad", status: "erro", total: 1 },
      { level: "ad", status: "ativa", total: 3 },
    ]);
    expect(s.campaign).toEqual({ total: 7, active: 2, paused: 1, error: 0 });
    expect(s.ad_group).toEqual({ total: 0, active: 0, paused: 0, error: 0 });
    expect(s.ad).toEqual({ total: 4, active: 3, paused: 0, error: 1 });
  });
});

describe("Google Ads", () => {
  it("mostra os indicadores pedidos, com o nome usado pelo Google", () => {
    expect(PLATFORM_VIEWS.google.kpis).toEqual(["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversions", "cpa", "conversion_value", "roas"]);
    expect(platformKpiLabel(PLATFORM_VIEWS.google, "cpa", "CPA")).toBe("Custo/conversão");
    expect(platformKpiLabel(PLATFORM_VIEWS.meta, "cpa", "CPA")).toBe("CPA");
    expect(PLATFORM_VIEWS.google.groupLabel).toBe("Grupos");
  });
});

describe("Meta Ads", () => {
  it("mostra todos os indicadores pedidos", () => {
    expect(PLATFORM_VIEWS.meta.kpis).toEqual(["spend", "reach", "impressions", "frequency", "clicks", "ctr", "cpc", "cpm", "leads", "messages", "conversions", "cpl", "cpa", "roas"]);
  });
});
