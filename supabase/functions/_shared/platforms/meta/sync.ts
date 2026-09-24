/**
 * Meta (Marketing API) → estrutura, métricas diárias e alcance por período.
 *
 * Fontes oficiais:
 *   act_{id}/campaigns · act_{id}/adsets · act_{id}/ads   (estrutura)
 *   act_{id}/insights?level=...&time_increment=1          (números por dia)
 *   act_{id}/insights?time_ranges=[...]                    (alcance do período exato)
 *
 * Definições (guardadas também em raw_actions para auditoria):
 *   leads      = ação "lead" (cadastros: formulários do Meta + pixel)
 *   mensagens  = ação "onsite_conversion.messaging_conversation_started_7d"
 *   conversões = compras ("omni_purchase"; se não houver, "purchase")
 *   valor      = valor das compras (action_values, mesma ação)
 * O Meta não devolve ações com valor zero: se a linha do dia existe e a ação
 * não aparece, ela foi ZERO naquele dia (não é "sem dado").
 */
import type { DailyMetric, DateRange, EntityStatus, MetricLevel, PeriodReach, PlatformAd, PlatformAdGroup, PlatformCampaign, PlatformStructure } from "../types.ts";
import { graphGetAll } from "./client.ts";
import { metaMoneyToMicros } from "./funding.ts";

// ------------------------------------------------------------------ estrutura

/** effective_status do Meta → status do sistema. Desconhecido fica "desconhecida" (original guardado). */
const ENTITY_STATUS: Record<string, EntityStatus> = {
  ACTIVE: "ativa",
  PAUSED: "pausada",
  CAMPAIGN_PAUSED: "pausada",
  ADSET_PAUSED: "pausada",
  ARCHIVED: "arquivada",
  DELETED: "arquivada",
  DISAPPROVED: "erro",
  WITH_ISSUES: "erro",
};

export function mapMetaEntityStatus(effective: string | undefined, stopTime?: string | null, now = new Date()): EntityStatus {
  const base = (effective && ENTITY_STATUS[effective]) || "desconhecida";
  // Campanha/conjunto com data de término no passado: não roda mais.
  if (base === "ativa" && stopTime && Date.parse(stopTime) < now.getTime()) return "encerrada";
  return base;
}

const budget = (daily: string | undefined, lifetime: string | undefined, currency: string | null) => {
  const d = metaMoneyToMicros(daily, currency);
  if (d && d > 0) return { budgetMicros: d, budgetPeriod: "diario" as const };
  const l = metaMoneyToMicros(lifetime, currency);
  if (l && l > 0) return { budgetMicros: l, budgetPeriod: "vitalicio" as const };
  return { budgetMicros: null, budgetPeriod: null };
};

const dateOnly = (iso: string | undefined | null) => (iso ? iso.slice(0, 10) : null);
const https = (url: string | undefined | null) => (url && url.startsWith("https://") ? url : null);

export interface RawCampaign {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  start_time?: string;
  stop_time?: string;
}
export interface RawAdSet {
  id: string;
  campaign_id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  end_time?: string;
}
export interface RawAd {
  id: string;
  adset_id?: string;
  campaign_id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  creative?: { object_type?: string; thumbnail_url?: string };
}

export function mapMetaCampaign(r: RawCampaign, currency: string | null, now = new Date()): PlatformCampaign {
  return {
    externalId: r.id,
    name: r.name?.trim() || `Campanha ${r.id}`,
    objective: r.objective ?? null,
    status: mapMetaEntityStatus(r.effective_status, r.stop_time, now),
    rawStatus: r.status ?? null,
    effectiveStatus: r.effective_status ?? null,
    ...budget(r.daily_budget, r.lifetime_budget, currency),
    bidStrategy: r.bid_strategy ?? null,
    startDate: dateOnly(r.start_time),
    endDate: dateOnly(r.stop_time),
  };
}

export function mapMetaAdSet(r: RawAdSet, currency: string | null, now = new Date()): PlatformAdGroup {
  return {
    externalId: r.id,
    campaignExternalId: r.campaign_id ?? "",
    name: r.name?.trim() || `Conjunto ${r.id}`,
    status: mapMetaEntityStatus(r.effective_status, r.end_time, now),
    rawStatus: r.status ?? null,
    effectiveStatus: r.effective_status ?? null,
    ...budget(r.daily_budget, r.lifetime_budget, currency),
    optimizationGoal: r.optimization_goal ?? null,
  };
}

/** object_type do criativo → tipo usado no painel (PHOTO vira IMAGE; o resto fica como veio). */
const CREATIVE_TYPE: Record<string, string> = { PHOTO: "IMAGE", VIDEO: "VIDEO" };
/** Só estes effective_status dizem algo sobre a revisão; os demais não são "aprovado" nem "reprovado". */
const REVIEW = new Set(["DISAPPROVED", "PENDING_REVIEW", "IN_PROCESS", "WITH_ISSUES"]);

export function mapMetaAd(r: RawAd): PlatformAd {
  const objectType = r.creative?.object_type;
  return {
    externalId: r.id,
    adGroupExternalId: r.adset_id ?? "",
    campaignExternalId: r.campaign_id ?? "",
    name: r.name?.trim() || `Anúncio ${r.id}`,
    status: mapMetaEntityStatus(r.effective_status),
    rawStatus: r.status ?? null,
    effectiveStatus: r.effective_status ?? null,
    creativeType: objectType ? (CREATIVE_TYPE[objectType] ?? objectType) : null,
    reviewStatus: r.effective_status && REVIEW.has(r.effective_status) ? r.effective_status : r.effective_status === "ACTIVE" ? "APPROVED" : null,
    thumbnailUrl: https(r.creative?.thumbnail_url),
  };
}

export async function fetchMetaStructure(token: string, externalId: string, currency: string | null, fetchImpl: typeof fetch): Promise<PlatformStructure> {
  const act = `act_${externalId}`;
  const [campaigns, adSets, ads] = await Promise.all([
    graphGetAll<RawCampaign>(`${act}/campaigns`, {
      fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time",
      limit: "500",
    }, token, fetchImpl),
    graphGetAll<RawAdSet>(`${act}/adsets`, {
      fields: "id,campaign_id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,end_time",
      limit: "500",
    }, token, fetchImpl),
    graphGetAll<RawAd>(`${act}/ads`, {
      fields: "id,adset_id,campaign_id,name,status,effective_status,creative{object_type,thumbnail_url}",
      limit: "500",
    }, token, fetchImpl),
  ]);
  return {
    campaigns: campaigns.map((r) => mapMetaCampaign(r, currency)),
    adGroups: adSets.filter((r) => r.campaign_id).map((r) => mapMetaAdSet(r, currency)),
    ads: ads.filter((r) => r.adset_id && r.campaign_id).map(mapMetaAd),
  };
}

// ------------------------------------------------------------------ métricas diárias

interface ActionValue {
  action_type?: string;
  value?: string;
}

export interface RawInsight {
  date_start?: string;
  date_stop?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionValue[];
  action_values?: ActionValue[];
}

/** "12.34" (unidade da moeda) → 12340000 micros, sem erro de arredondamento. */
export function decimalToMicros(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    const n = Number(text);
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
  }
  const [, sign, whole, frac = ""] = match;
  const micros = Number(whole) * 1_000_000 + Number((frac + "000000").slice(0, 6)) + (frac.length > 6 && Number(frac[6]) >= 5 ? 1 : 0);
  return sign ? -micros : micros;
}

const int = (v: string | undefined) => (v === undefined || v === "" ? null : Math.round(Number(v)));
const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

function actionValue(list: ActionValue[] | undefined, types: string[]): number {
  if (!list) return 0;
  for (const t of types) {
    const found = list.find((a) => a.action_type === t);
    if (found) return Number(found.value ?? 0);
  }
  return 0;
}

const LEAD_TYPES = ["lead"];
const MESSAGE_TYPES = ["onsite_conversion.messaging_conversation_started_7d"];
const PURCHASE_TYPES = ["omni_purchase", "purchase"];

export function mapMetaInsight(r: RawInsight, level: MetricLevel, accountExternalId: string): DailyMetric {
  const entity = level === "account" ? accountExternalId : level === "campaign" ? r.campaign_id : level === "ad_group" ? r.adset_id : r.ad_id;
  const purchaseValue = PURCHASE_TYPES.map((t) => r.action_values?.find((a) => a.action_type === t)).find(Boolean);
  return {
    date: r.date_start ?? "",
    level,
    entityExternalId: entity ?? "",
    campaignExternalId: level === "account" ? null : (r.campaign_id ?? null),
    adGroupExternalId: level === "ad_group" || level === "ad" ? (r.adset_id ?? null) : null,
    adExternalId: level === "ad" ? (r.ad_id ?? null) : null,
    spendMicros: decimalToMicros(r.spend) ?? 0,
    impressions: int(r.impressions) ?? 0,
    reach: int(r.reach),
    clicks: int(r.clicks) ?? 0,
    linkClicks: int(r.inline_link_clicks),
    leads: actionValue(r.actions, LEAD_TYPES),
    messages: actionValue(r.actions, MESSAGE_TYPES),
    conversions: actionValue(r.actions, PURCHASE_TYPES),
    conversionValueMicros: purchaseValue ? decimalToMicros(purchaseValue.value) : 0,
    rawActions: r.actions || r.action_values ? { actions: r.actions ?? [], action_values: r.action_values ?? [] } : null,
  };
}

/** Divide o período em janelas (o Meta recusa respostas grandes demais). */
export function splitRange(range: DateRange, days: number): DateRange[] {
  const out: DateRange[] = [];
  const day = 86_400_000;
  let start = Date.parse(`${range.from}T00:00:00Z`);
  const end = Date.parse(`${range.to}T00:00:00Z`);
  while (start <= end) {
    const stop = Math.min(start + (days - 1) * day, end);
    out.push({ from: new Date(start).toISOString().slice(0, 10), to: new Date(stop).toISOString().slice(0, 10) });
    start = stop + day;
  }
  return out;
}

const LEVEL_PARAM: Record<MetricLevel, string> = { account: "account", campaign: "campaign", ad_group: "adset", ad: "ad" };
const BASE_FIELDS = "date_start,date_stop,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values";
const LEVEL_FIELDS: Record<MetricLevel, string> = {
  account: BASE_FIELDS,
  campaign: `campaign_id,${BASE_FIELDS}`,
  ad_group: `campaign_id,adset_id,${BASE_FIELDS}`,
  ad: `campaign_id,adset_id,ad_id,${BASE_FIELDS}`,
};

export async function fetchMetaDailyMetrics(token: string, externalId: string, range: DateRange, fetchImpl: typeof fetch): Promise<DailyMetric[]> {
  const out: DailyMetric[] = [];
  for (const window of splitRange(range, 10)) {
    for (const level of ["account", "campaign", "ad_group", "ad"] as MetricLevel[]) {
      const rows = await graphGetAll<RawInsight>(`act_${externalId}/insights`, {
        level: LEVEL_PARAM[level],
        fields: LEVEL_FIELDS[level],
        time_range: JSON.stringify({ since: window.from, until: window.to }),
        time_increment: "1",
        use_unified_attribution_setting: "true",
        limit: "500",
      }, token, fetchImpl);
      for (const r of rows) {
        const m = mapMetaInsight(r, level, externalId);
        if (m.date && m.entityExternalId) out.push(m);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ alcance por período

export async function fetchMetaPeriodReach(token: string, externalId: string, ranges: DateRange[], fetchImpl: typeof fetch): Promise<PeriodReach[]> {
  if (!ranges.length) return [];
  const timeRanges = JSON.stringify(ranges.map((r) => ({ since: r.from, until: r.to })));
  const out: PeriodReach[] = [];
  for (const level of ["account", "campaign"] as const) {
    const rows = await graphGetAll<RawInsight>(`act_${externalId}/insights`, {
      level,
      fields: level === "campaign" ? "campaign_id,date_start,date_stop,reach,impressions,frequency" : "date_start,date_stop,reach,impressions,frequency",
      time_ranges: timeRanges,
      use_unified_attribution_setting: "true",
      limit: "500",
    }, token, fetchImpl);
    for (const r of rows) {
      const entity = level === "account" ? externalId : r.campaign_id;
      if (!entity || !r.date_start || !r.date_stop) continue;
      out.push({ level, entityExternalId: entity, from: r.date_start, to: r.date_stop, reach: int(r.reach), impressions: int(r.impressions), frequency: num(r.frequency) });
    }
  }
  return out;
}
