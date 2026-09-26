import { describe, expect, it } from "vitest";
import { KPI_DEFINITIONS } from "../metrics/kpis.ts";
import {
  BUSINESS_LABELS,
  formatAccountId,
  getPlatform,
  isPlatformId,
  PLATFORM_ID_PATTERN,
  PLATFORM_IDS,
  PLATFORM_LABELS,
  PLATFORM_OPTIONS,
  platformName,
  PLATFORMS,
} from "./catalog.ts";

describe("catálogo de plataformas", () => {
  it("Meta e Google, nesta ordem (ordem do menu)", () => {
    expect(PLATFORM_IDS).toEqual(["meta", "google"]);
  });

  it("ids no formato aceito pelo banco e sem repetição", () => {
    for (const p of PLATFORMS) expect(PLATFORM_ID_PATTERN.test(p.id)).toBe(true);
    expect(new Set(PLATFORM_IDS).size).toBe(PLATFORMS.length);
    expect(new Set(PLATFORMS.map((p) => p.path)).size).toBe(PLATFORMS.length);
    for (const p of PLATFORMS) expect(p.path).toMatch(/^\/[a-z0-9-]+$/);
  });

  it("todo indicador da plataforma existe no sistema", () => {
    const known = new Set(KPI_DEFINITIONS.map((k) => k.key));
    for (const p of PLATFORMS) for (const k of p.kpis) expect(known.has(k)).toBe(true);
  });

  it("indicadores que a plataforma não oferece não aparecem na tela dela", () => {
    for (const p of PLATFORMS) {
      if (!p.capabilities.reach) expect(p.kpis).not.toContain("reach");
      if (!p.capabilities.leads) expect(p.kpis).not.toContain("leads");
      if (!p.capabilities.messages) expect(p.kpis).not.toContain("messages");
      if (p.result === "leads") expect(p.capabilities.leads).toBe(true);
    }
  });

  it("listas derivadas acompanham o catálogo", () => {
    expect(PLATFORM_LABELS).toEqual({ meta: "Meta Ads", google: "Google Ads" });
    expect(BUSINESS_LABELS).toEqual({ meta: "Business Manager", google: "MCC (conta administradora)" });
    expect(PLATFORM_OPTIONS.map((o) => o.value)).toEqual(PLATFORM_IDS);
  });

  it("plataforma desconhecida não quebra a tela", () => {
    expect(getPlatform("tiktok")).toBeUndefined();
    expect(isPlatformId("tiktok")).toBe(false);
    expect(isPlatformId("meta")).toBe(true);
    expect(platformName("tiktok")).toBe("tiktok");
    expect(formatAccountId("tiktok", "7001")).toBe("7001");
  });
});

describe("formatAccountId", () => {
  it("Meta usa o prefixo act_", () => expect(formatAccountId("meta", "123")).toBe("act_123"));
  it("Google usa 123-456-7890", () => expect(formatAccountId("google", "1234567890")).toBe("123-456-7890"));
  it("mantém IDs fora do padrão", () => expect(formatAccountId("google", "12")).toBe("12"));
});
