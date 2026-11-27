/** Fase 35.2 — modelo do rascunho de campanha (campanha → conjuntos → anúncios). Guardado em builder_drafts.data. */
import {
  AD_CTAS, billingFor, type AdCta, type BillingEvent, type CustomEvent, type ObjectiveId, type OptimizationGoal, type SpecialAdCategory,
  GOALS_BY_OBJECTIVE, OBJECTIVE_LABELS, SPECIAL_AGE_MAX, SPECIAL_AGE_MIN, CUSTOM_EVENTS, SPECIAL_AD_CATEGORIES,
} from "./catalog.ts";

export const DRAFT_SCHEMA = 1;

/** Status é escolha de quem cria: nunca vem preenchido (publicar gasta verba). */
export type DraftStatus = "" | "PAUSED" | "ACTIVE";
export type BudgetLevel = "campaign" | "adset";
export type BudgetType = "daily" | "lifetime";

export interface DraftCampaign {
  name: string;
  objective: ObjectiveId | "";
  status: DraftStatus;
  specialAdCategories: SpecialAdCategory[];
  budgetLevel: BudgetLevel;
  budgetType: BudgetType;
  /** Valor na moeda da conta (ex.: 50 = R$ 50,00). Nunca se soma moedas diferentes. */
  budgetAmount: number | null;
}
export interface DraftAdSet {
  id: string;
  name: string;
  optimizationGoal: OptimizationGoal | "";
  billingEvent: BillingEvent | "";
  budgetAmount: number | null;
  startDate: string; // AAAA-MM-DD
  endDate: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  pixelId: string;
  /** Públicos (personalizados ou salvos) da conta, escolhidos na lista que o Meta devolve. */
  audienceIds: string[];
  customEvent: CustomEvent | "";
  pageId: string;
}
export interface DraftAd {
  id: string;
  adSetId: string;
  name: string;
  pageId: string;
  instagramId: string;
  primaryText: string;
  headline: string;
  description: string;
  link: string;
  cta: AdCta | "";
}
export interface CampaignDraft {
  schema: number;
  campaign: DraftCampaign;
  adSets: DraftAdSet[];
  ads: DraftAd[];
  /** Modo avançado: JSON livre com propriedades da API que o catálogo ainda não conhece (o Meta valida). */
  advancedJson: string;
}

const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}${Date.now()}`);

export function newAdSet(over: Partial<DraftAdSet> = {}): DraftAdSet {
  return {
    id: newId(), name: "", optimizationGoal: "", billingEvent: "", budgetAmount: null, startDate: "", endDate: "", countries: ["BR"],
    ageMin: SPECIAL_AGE_MIN, ageMax: SPECIAL_AGE_MAX, gender: "all", pixelId: "", audienceIds: [], customEvent: "", pageId: "", ...over,
  };
}
export function newAd(adSetId: string, over: Partial<DraftAd> = {}): DraftAd {
  return { id: newId(), adSetId, name: "", pageId: "", instagramId: "", primaryText: "", headline: "", description: "", link: "", cta: "", ...over };
}
export function newDraft(): CampaignDraft {
  return {
    schema: DRAFT_SCHEMA,
    campaign: { name: "", objective: "", status: "", specialAdCategories: [], budgetLevel: "adset", budgetType: "daily", budgetAmount: null },
    adSets: [], ads: [], advancedJson: "",
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[], empty: T | "" = ""): T | "" => (list.includes(v as T) ? (v as T) : empty);

/** Lê o JSON salvo (de qualquer versão) e devolve um rascunho completo e seguro. Nunca inventa valores além dos padrões. */
export function normalizeDraft(raw: unknown): CampaignDraft {
  const base = newDraft();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const c = (r.campaign ?? {}) as Record<string, unknown>;
  const objectives = Object.keys(OBJECTIVE_LABELS) as ObjectiveId[];
  const cats = SPECIAL_AD_CATEGORIES.map((x) => x.id) as SpecialAdCategory[];
  const campaign: DraftCampaign = {
    name: str(c.name, 200),
    objective: oneOf(c.objective, objectives),
    status: oneOf(c.status, ["PAUSED", "ACTIVE"] as const),
    specialAdCategories: Array.isArray(c.specialAdCategories) ? (c.specialAdCategories.filter((x) => cats.includes(x as SpecialAdCategory)) as SpecialAdCategory[]) : [],
    budgetLevel: c.budgetLevel === "campaign" ? "campaign" : "adset",
    budgetType: c.budgetType === "lifetime" ? "lifetime" : "daily",
    budgetAmount: numOrNull(c.budgetAmount),
  };
  const adSets = (Array.isArray(r.adSets) ? r.adSets : []).slice(0, 50).map((x): DraftAdSet => {
    const s = (x ?? {}) as Record<string, unknown>;
    const goals = Object.values(GOALS_BY_OBJECTIVE).flat();
    return newAdSet({
      id: str(s.id, 80) || newId(), name: str(s.name, 200), optimizationGoal: oneOf(s.optimizationGoal, goals as OptimizationGoal[]),
      billingEvent: oneOf(s.billingEvent, ["IMPRESSIONS", "LINK_CLICKS", "THRUPLAY"] as const), budgetAmount: numOrNull(s.budgetAmount),
      startDate: str(s.startDate, 10), endDate: str(s.endDate, 10),
      countries: Array.isArray(s.countries) ? s.countries.filter((k): k is string => typeof k === "string" && /^[A-Z]{2}$/.test(k)).slice(0, 30) : ["BR"],
      ageMin: typeof s.ageMin === "number" ? s.ageMin : SPECIAL_AGE_MIN, ageMax: typeof s.ageMax === "number" ? s.ageMax : SPECIAL_AGE_MAX,
      gender: s.gender === "male" || s.gender === "female" ? s.gender : "all", pixelId: str(s.pixelId, 40),
      audienceIds: Array.isArray(s.audienceIds) ? s.audienceIds.filter((k): k is string => typeof k === "string" && /^\d{1,40}$/.test(k)).slice(0, 50) : [],
      customEvent: oneOf(s.customEvent, CUSTOM_EVENTS), pageId: str(s.pageId, 40),
    });
  });
  const ids = new Set(adSets.map((s) => s.id));
  const ctas = AD_CTAS.map((x) => x.id) as AdCta[];
  const ads = (Array.isArray(r.ads) ? r.ads : []).slice(0, 300).flatMap((x): DraftAd[] => {
    const a = (x ?? {}) as Record<string, unknown>;
    const adSetId = str(a.adSetId, 80);
    if (!ids.has(adSetId)) return [];
    return [newAd(adSetId, {
      id: str(a.id, 80) || newId(), name: str(a.name, 200), pageId: str(a.pageId, 40), instagramId: str(a.instagramId, 40),
      primaryText: str(a.primaryText, 2000), headline: str(a.headline, 200), description: str(a.description, 400), link: str(a.link, 2000),
      cta: oneOf(a.cta, ctas),
    })];
  });
  return { schema: DRAFT_SCHEMA, campaign, adSets, ads, advancedJson: str(r.advancedJson, 20000) };
}

/** Quando o objetivo muda, metas que ele não aceita são desmarcadas (nunca fica combinação inválida escolhida). */
export function applyObjective(d: CampaignDraft, objective: ObjectiveId | ""): CampaignDraft {
  const allowed = objective ? GOALS_BY_OBJECTIVE[objective] : [];
  return {
    ...d,
    campaign: { ...d.campaign, objective },
    adSets: d.adSets.map((s) => (s.optimizationGoal && !allowed.includes(s.optimizationGoal) ? { ...s, optimizationGoal: "", billingEvent: "" } : s)),
  };
}

/** Quando a meta muda, a cobrança volta ao padrão aceito. */
export function applyGoal(s: DraftAdSet, goal: OptimizationGoal | ""): DraftAdSet {
  const billing = goal ? billingFor(goal) : [];
  return { ...s, optimizationGoal: goal, billingEvent: goal ? (billing.includes(s.billingEvent as BillingEvent) ? s.billingEvent : billing[0]) : "" };
}

/** Duplica um conjunto com os anúncios (novos ids). */
export function duplicateAdSet(d: CampaignDraft, adSetId: string): CampaignDraft {
  const s = d.adSets.find((x) => x.id === adSetId);
  if (!s) return d;
  const copy = newAdSet({ ...s, id: newId(), name: s.name ? `${s.name} (cópia)` : "" });
  const ads = d.ads.filter((a) => a.adSetId === adSetId).map((a) => newAd(copy.id, { ...a, id: newId(), adSetId: copy.id }));
  return { ...d, adSets: [...d.adSets, copy], ads: [...d.ads, ...ads] };
}

export function removeAdSet(d: CampaignDraft, adSetId: string): CampaignDraft {
  return { ...d, adSets: d.adSets.filter((s) => s.id !== adSetId), ads: d.ads.filter((a) => a.adSetId !== adSetId) };
}
