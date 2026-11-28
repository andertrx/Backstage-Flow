/** Fase 35.2 — modelo do rascunho de campanha (campanha → conjuntos → anúncios). Guardado em builder_drafts.data. */
import {
  AD_CTAS, billingFor, DESTINATION_TYPES, destinationsFor, type AdCta, type BillingEvent, type DestinationType, type CustomEvent, type ObjectiveId, type OptimizationGoal, type SpecialAdCategory,
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
  /** Para onde o anúncio leva (só quando o Meta oferece escolha para a meta). Vazio = site. */
  destinationType: DestinationType | "";
  /** Públicos (personalizados ou salvos) da conta, escolhidos na lista que o Meta devolve. */
  audienceIds: string[];
  customEvent: CustomEvent | "";
  pageId: string;
  /** Interesses escolhidos na busca do Meta (id e nome que o Meta devolveu). */
  interests: TargetingInterest[];
  /** Cidades escolhidas na busca do Meta (chave do Meta, nome e raio em km). Com cidades, o país sozinho não vale. */
  cities: TargetingCity[];
  /** Público Advantage+: o Meta pode ampliar o público além do definido. Desligado por padrão. */
  advantageAudience: boolean;
}
export interface TargetingInterest { id: string; name: string }
export interface TargetingCity { key: string; name: string; radius: number }
export const CITY_RADIUS_MIN = 17;
export const CITY_RADIUS_MAX = 80;
export const MAX_INTERESTS = 25;
export const MAX_CITIES = 25;
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
  /** ID do formulário de cadastro (só quando o destino é "Formulário no próprio anúncio"). */
  leadFormId: string;
  /** Endereço https da imagem do anúncio (enquanto o envio direto do Drive não existe). */
  imageUrl: string;
  /** Imagem escolhida no Google Drive (id e nome do arquivo). Tem prioridade sobre o endereço. */
  driveFileId: string;
  driveFileName: string;
  /** O arquivo do Drive é imagem ou vídeo. */
  driveKind: "image" | "video";
  /** Post do Instagram que já existe (id do Meta) e um rótulo para mostrar na tela. Só para destinos de post existente. */
  igMediaId: string;
  igMediaLabel: string;
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
    ageMin: SPECIAL_AGE_MIN, ageMax: SPECIAL_AGE_MAX, gender: "all", pixelId: "", destinationType: "", audienceIds: [], customEvent: "", pageId: "", interests: [], cities: [], advantageAudience: false, ...over,
  };
}
export function newAd(adSetId: string, over: Partial<DraftAd> = {}): DraftAd {
  return { id: newId(), adSetId, name: "", pageId: "", instagramId: "", primaryText: "", headline: "", description: "", link: "", leadFormId: "", imageUrl: "", driveFileId: "", driveFileName: "", driveKind: "image", igMediaId: "", igMediaLabel: "", cta: "", ...over };
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
      destinationType: oneOf(s.destinationType, DESTINATION_TYPES),
      audienceIds: Array.isArray(s.audienceIds) ? s.audienceIds.filter((k): k is string => typeof k === "string" && /^\d{1,40}$/.test(k)).slice(0, 50) : [],
      customEvent: oneOf(s.customEvent, CUSTOM_EVENTS), pageId: str(s.pageId, 40),
      interests: (Array.isArray(s.interests) ? s.interests : []).flatMap((i): TargetingInterest[] => {
        const o = (i ?? {}) as Record<string, unknown>;
        return /^\d{1,30}$/.test(str(o.id, 30)) && str(o.name, 200) ? [{ id: str(o.id, 30), name: str(o.name, 200) }] : [];
      }).slice(0, MAX_INTERESTS),
      cities: (Array.isArray(s.cities) ? s.cities : []).flatMap((i): TargetingCity[] => {
        const o = (i ?? {}) as Record<string, unknown>;
        const radius = typeof o.radius === "number" && Number.isFinite(o.radius) ? Math.min(CITY_RADIUS_MAX, Math.max(CITY_RADIUS_MIN, Math.round(o.radius))) : CITY_RADIUS_MIN;
        return /^\d{1,30}$/.test(str(o.key, 30)) && str(o.name, 200) ? [{ key: str(o.key, 30), name: str(o.name, 200), radius }] : [];
      }).slice(0, MAX_CITIES),
      advantageAudience: s.advantageAudience === true,
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
      primaryText: str(a.primaryText, 2000), headline: str(a.headline, 200), description: str(a.description, 400), link: str(a.link, 2000), leadFormId: /^\d{5,30}$/.test(str(a.leadFormId, 30)) ? str(a.leadFormId, 30) : "", imageUrl: str(a.imageUrl, 2000),
      driveFileId: /^[A-Za-z0-9_-]{10,100}$/.test(str(a.driveFileId, 100)) ? str(a.driveFileId, 100) : "", driveFileName: str(a.driveFileName, 200), driveKind: a.driveKind === "video" ? "video" : "image",
      igMediaId: /^\d{5,30}$/.test(str(a.igMediaId, 30)) ? str(a.igMediaId, 30) : "", igMediaLabel: str(a.igMediaLabel, 120),
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
    adSets: d.adSets.map((s) => (s.optimizationGoal && !allowed.includes(s.optimizationGoal) ? { ...s, optimizationGoal: "", billingEvent: "", destinationType: "" } : { ...s, destinationType: destinationsFor(s.optimizationGoal, objective).includes(s.destinationType as DestinationType) ? s.destinationType : (destinationsFor(s.optimizationGoal, objective)[0] ?? "") })),
  };
}

/** Quando a meta muda, a cobrança volta ao padrão aceito. */
export function applyGoal(s: DraftAdSet, goal: OptimizationGoal | "", objective: ObjectiveId | "" = ""): DraftAdSet {
  const billing = goal ? billingFor(goal) : [];
  // Destino: se o Meta oferece escolha para a meta nova, mantém o atual quando ainda vale; senão, o primeiro (padrão). Sem escolha, volta ao site.
  const options = destinationsFor(goal, objective);
  const destinationType = options.length ? (options.includes(s.destinationType as DestinationType) ? s.destinationType : options[0]) : "";
  return { ...s, optimizationGoal: goal, destinationType, billingEvent: goal ? (billing.includes(s.billingEvent as BillingEvent) ? s.billingEvent : billing[0]) : "" };
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
