/**
 * Fase J.5 — Modelos de campanha.
 *  (A) Copiar uma campanha que já existe no Meta para um rascunho do Criador (só leitura no Meta).
 *  (B) Guardar um rascunho como MODELO reutilizável em qualquer conta (tabela builder_templates).
 * O que não dá para copiar fica listado em "notas", nunca é inventado.
 */
import { DESTINATION_TYPES, type DestinationType, GOALS_BY_OBJECTIVE, OBJECTIVE_LABELS, type ObjectiveId, type OptimizationGoal, AD_CTAS, type AdCta, CUSTOM_EVENTS, type CustomEvent, SPECIAL_AD_CATEGORIES } from "./catalog.ts";
import { type CampaignDraft, CITY_RADIUS_MAX, CITY_RADIUS_MIN, MAX_CITIES, MAX_INTERESTS, newAd, newAdSet, newDraft, normalizeDraft } from "./model.ts";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : Array.isArray(obj(v).data) ? (obj(v).data as unknown[]) : []);
const s = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const zeroDecimal = new Set(["JPY", "KRW", "CLP", "VND", "ISK", "HUF", "TWD", "UGX", "PYG"]);
const fromMinor = (v: unknown, currency: string): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return zeroDecimal.has(currency.toUpperCase()) ? n : n / 100;
};

export interface ImportResult {
  draft: CampaignDraft;
  /** O que não foi copiado ou precisa ser escolhido de novo (em português). */
  notes: string[];
}

/**
 * Campanha lida do Meta (campaign com `adsets` e `ads`, cada um com `creative`) → rascunho do Criador.
 * Status nunca vem preenchido; imagens e vídeos precisam ser escolhidos de novo; as melhorias automáticas do original NÃO são copiadas.
 */
export function draftFromMeta(raw: unknown, currency: string): ImportResult {
  const c = obj(raw);
  const notes: string[] = [];
  const d = newDraft();
  const objective = s(c.objective, 40);
  d.campaign.name = `${s(c.name, 180)} (cópia)`.trim();
  if ((Object.keys(OBJECTIVE_LABELS) as string[]).includes(objective)) d.campaign.objective = objective as ObjectiveId;
  else notes.push(`O objetivo "${objective || "—"}" é de uma versão antiga do Meta: escolha o objetivo de novo.`);
  const cats = SPECIAL_AD_CATEGORIES.map((x) => x.id) as string[];
  d.campaign.specialAdCategories = arr(c.special_ad_categories).filter((x): x is string => typeof x === "string" && cats.includes(x)) as CampaignDraft["campaign"]["specialAdCategories"];
  const cDaily = fromMinor(c.daily_budget, currency);
  const cLife = fromMinor(c.lifetime_budget, currency);
  if (cDaily || cLife) {
    d.campaign.budgetLevel = "campaign";
    d.campaign.budgetType = cLife ? "lifetime" : "daily";
    d.campaign.budgetAmount = cLife ?? cDaily;
  }
  if (s(c.bid_strategy) && s(c.bid_strategy) !== "LOWEST_COST_WITHOUT_CAP") notes.push(`A estratégia de lance "${s(c.bid_strategy)}" não é copiada: o Criador usa o menor custo.`);

  const goals = d.campaign.objective ? GOALS_BY_OBJECTIVE[d.campaign.objective] : [];
  const sets = arr(c.adsets).map(obj);
  const adSetIds = new Map<string, string>();
  let lostMedia = 0;
  let extraTexts = 0;
  let enhancementsOn = false;
  for (const a of sets.slice(0, 10)) {
    const t = obj(a.targeting);
    const ns = newAdSet({ name: s(a.name, 200) });
    const goal = s(a.optimization_goal, 60);
    if ((goals as string[]).includes(goal)) ns.optimizationGoal = goal as OptimizationGoal;
    else if (goal) notes.push(`${ns.name}: a meta "${goal}" não combina com o objetivo no Criador; escolha de novo.`);
    const billing = s(a.billing_event, 30);
    if (["IMPRESSIONS", "LINK_CLICKS", "THRUPLAY"].includes(billing)) ns.billingEvent = billing as typeof ns.billingEvent;
    const daily = fromMinor(a.daily_budget, currency);
    const life = fromMinor(a.lifetime_budget, currency);
    if (d.campaign.budgetLevel === "adset") {
      ns.budgetAmount = life ?? daily;
      if (life) d.campaign.budgetType = "lifetime";
    }
    const dest = s(a.destination_type, 40);
    if ((DESTINATION_TYPES as string[]).includes(dest)) ns.destinationType = dest as DestinationType;
    const po = obj(a.promoted_object);
    if (s(po.pixel_id)) ns.pixelId = s(po.pixel_id, 40);
    if ((CUSTOM_EVENTS as readonly string[]).includes(s(po.custom_event_type))) ns.customEvent = s(po.custom_event_type) as CustomEvent;
    if (s(po.page_id)) ns.pageId = s(po.page_id, 40);
    // Público
    const geo = obj(t.geo_locations);
    const countries = arr(geo.countries).filter((x): x is string => typeof x === "string" && /^[A-Z]{2}$/.test(x));
    const cities = arr(geo.cities).map(obj).filter((x) => /^\d{1,30}$/.test(s(x.key))).slice(0, MAX_CITIES).map((x) => {
      const r = typeof x.radius === "number" ? x.radius : CITY_RADIUS_MIN;
      const km = s(x.distance_unit) === "mile" ? Math.round(r * 1.609) : r;
      return { key: s(x.key, 30), name: s(x.name, 200) || s(x.key, 30), radius: Math.min(CITY_RADIUS_MAX, Math.max(CITY_RADIUS_MIN, Math.round(km))) };
    });
    ns.countries = countries.length ? countries : cities.length ? [] : ["BR"];
    ns.cities = cities;
    if (arr(geo.regions).length || arr(geo.zips).length || arr(geo.custom_locations).length) notes.push(`${ns.name}: estados, CEPs e pontos no mapa não são copiados; confira a localização.`);
    if (typeof t.age_min === "number") ns.ageMin = t.age_min;
    if (typeof t.age_max === "number") ns.ageMax = t.age_max;
    const genders = arr(t.genders);
    ns.gender = genders.length === 1 ? (genders[0] === 1 ? "male" : genders[0] === 2 ? "female" : "all") : "all";
    const flex = arr(t.flexible_spec).map(obj);
    ns.interests = flex.flatMap((f) => arr(f.interests).map(obj)).filter((i) => /^\d{1,30}$/.test(s(i.id)) && s(i.name)).slice(0, MAX_INTERESTS).map((i) => ({ id: s(i.id, 30), name: s(i.name, 200) }));
    if (flex.some((f) => Object.keys(f).some((k) => k !== "interests"))) notes.push(`${ns.name}: comportamentos e dados demográficos detalhados não são copiados (só interesses).`);
    ns.audienceIds = arr(t.custom_audiences).map(obj).map((x) => s(x.id, 40)).filter((x) => /^\d{1,40}$/.test(x)).slice(0, 50);
    if (arr(t.excluded_custom_audiences).length) notes.push(`${ns.name}: públicos excluídos não são copiados.`);
    ns.advantageAudience = obj(t.targeting_automation).advantage_audience === 1;
    if (ns.advantageAudience) notes.push(`${ns.name}: o original usa Público Advantage+ (copiado assim; desligue se quiser).`);
    if (!arr(t.publisher_platforms).length) notes.push(`${ns.name}: o original usa posicionamentos automáticos; o Criador sobe com os escolhidos (Feed, Explorar, Stories e Reels).`);
    if (s(a.start_time) || s(a.end_time)) notes.push(`${ns.name}: datas de início e fim não são copiadas.`);
    d.adSets.push(ns);
    adSetIds.set(s(a.id), ns.id);
  }
  if (sets.length > 10) notes.push(`Só os 10 primeiros conjuntos foram copiados (a campanha tem ${sets.length}).`);

  const ctas = AD_CTAS.map((x) => x.id) as string[];
  for (const a of arr(c.ads).map(obj).slice(0, 30)) {
    const setId = adSetIds.get(s(a.adset_id));
    if (!setId) continue;
    const cr = obj(a.creative);
    const oss = obj(cr.object_story_spec);
    const afs = obj(cr.asset_feed_spec);
    const ld = obj(oss.link_data);
    const vd = obj(oss.video_data);
    const cta = obj(ld.call_to_action ?? vd.call_to_action);
    const bodies = arr(afs.bodies).map((x) => s(obj(x).text)).filter(Boolean);
    const titles = arr(afs.titles).map((x) => s(obj(x).text, 255)).filter(Boolean);
    const ctaType = s(cta.type, 40) || s(arr(afs.call_to_action_types)[0], 40);
    const ad = newAd(setId, {
      name: s(a.name, 200), pageId: s(oss.page_id, 40), instagramId: s(oss.instagram_user_id, 40),
      primaryText: s(ld.message) || s(vd.message) || bodies[0] || "",
      headline: s(ld.name, 200) || s(vd.title, 200) || titles[0] || "",
      description: s(ld.description, 400) || s(vd.link_description, 400),
      link: s(ld.link) || s(obj(cta.value).link) || s(obj(arr(afs.link_urls)[0]).website_url),
      cta: ctas.includes(ctaType) ? (ctaType as AdCta) : "",
    });
    const set = d.adSets.find((x) => x.id === setId);
    if (set && !set.pageId && ad.pageId) set.pageId = ad.pageId;
    d.ads.push(ad);
    lostMedia++;
    if (bodies.length > 1 || titles.length > 1) extraTexts++;
    const dof = obj(cr.degrees_of_freedom_spec);
    if (arr(dof.creative_features).map(obj).some((f) => f.enroll_status === "OPT_IN") || Object.values(obj(dof.creative_features_spec)).some((f) => obj(f).enroll_status === "OPT_IN")) enhancementsOn = true;
  }
  if (arr(c.ads).length > 30) notes.push(`Só os 30 primeiros anúncios foram copiados (a campanha tem ${arr(c.ads).length}).`);
  if (lostMedia) notes.push(`${lostMedia} anúncio(s): a imagem ou o vídeo precisa ser escolhido de novo no Drive.`);
  if (extraTexts) notes.push(`${extraTexts} anúncio(s) tinham várias opções de texto: só a primeira foi copiada (para várias, use a esteira).`);
  if (enhancementsOn) notes.push("O original tem melhorias automáticas do Meta ligadas. A cópia sobe com todas DESLIGADAS (Controle total).");
  return { draft: normalizeDraft(d), notes };
}

/**
 * Modelo: tira do rascunho o que é de UMA conta (página, Instagram, pixel, públicos, formulário, post, arquivos do Drive),
 * para poder usar em qualquer conta. Devolve o que foi tirado.
 */
export function stripAccountSpecific(d: CampaignDraft): ImportResult {
  const notes: string[] = [];
  const x = normalizeDraft(JSON.parse(JSON.stringify(d)));
  x.campaign.status = "";
  let pages = 0, pixels = 0, audiences = 0, media = 0, forms = 0;
  for (const s2 of x.adSets) {
    if (s2.pageId) pages++;
    if (s2.pixelId) pixels++;
    if (s2.audienceIds.length) audiences++;
    s2.pageId = ""; s2.pixelId = ""; s2.audienceIds = []; s2.startDate = ""; s2.endDate = "";
  }
  for (const a of x.ads) {
    if (a.pageId) pages++;
    if (a.driveFileId || a.imageUrl || a.igMediaId) media++;
    if (a.leadFormId) forms++;
    a.pageId = ""; a.instagramId = ""; a.driveFileId = ""; a.driveFileName = ""; a.driveKind = "image"; a.imageUrl = ""; a.igMediaId = ""; a.igMediaLabel = ""; a.leadFormId = "";
  }
  if (pages) notes.push("Página e Instagram ficam de fora: escolha os da conta ao usar o modelo.");
  if (pixels) notes.push("Pixel fica de fora: escolha o da conta ao usar o modelo.");
  if (audiences) notes.push("Públicos personalizados ficam de fora (são de cada conta).");
  if (media) notes.push("Imagens, vídeos e posts ficam de fora: escolha ao usar o modelo.");
  if (forms) notes.push("Formulários de cadastro ficam de fora (são de cada página).");
  return { draft: x, notes };
}

/** Origem do modelo: salvo de um rascunho ou copiado de uma campanha que já existe na plataforma (Meta). */
export const TEMPLATE_SOURCE_IMPORTED = "meta" as const;
export type TemplateSource = "rascunho" | typeof TEMPLATE_SOURCE_IMPORTED;
