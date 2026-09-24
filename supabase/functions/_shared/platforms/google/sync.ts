/**
 * Google Ads (interface REST oficial, consultas GAQL) → estrutura e métricas diárias.
 *
 * Recursos consultados: campaign · ad_group · ad_group_ad · customer (métricas por dia
 * com segments.date). O Google Ads não informa leads, mensagens nem alcance por
 * esta API: esses campos ficam null ("não disponível"), nunca zero.
 * Números int64 chegam como texto; conversões podem ser fracionadas.
 */
import type { DailyMetric, DateRange, EntityStatus, MetricLevel, PlatformAd, PlatformAdGroup, PlatformCampaign, PlatformStructure } from "../types.ts";
import { type AdsCallOptions, search } from "./client.ts";

// ------------------------------------------------------------------ estrutura

/** status + serving_status do Google → status do sistema. */
export function mapGoogleEntityStatus(status: string | undefined, servingStatus?: string, approval?: string): EntityStatus {
  if (status === "REMOVED") return "arquivada";
  if (approval === "DISAPPROVED") return "erro";
  if (servingStatus === "ENDED") return "encerrada";
  if (servingStatus === "SUSPENDED") return "erro";
  if (status === "PAUSED") return "pausada";
  if (status === "ENABLED") return "ativa";
  return "desconhecida";
}

const toInt = (v: unknown) => (v === undefined || v === null || v === "" ? null : Math.round(Number(v)));
const toNum = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
const https = (url: string | undefined | null) => (url && url.startsWith("https://") ? url : null);

export interface RawCampaignRow {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    servingStatus?: string;
    advertisingChannelType?: string;
    biddingStrategyType?: string;
  };
  campaignBudget?: { amountMicros?: string; totalAmountMicros?: string; period?: string };
}
export interface RawAdGroupRow {
  adGroup?: { id?: string; name?: string; status?: string; type?: string };
  campaign?: { id?: string };
}
export interface RawAdRow {
  adGroupAd?: {
    status?: string;
    ad?: { id?: string; name?: string; type?: string; imageAd?: { imageUrl?: string } };
    policySummary?: { approvalStatus?: string; reviewStatus?: string };
  };
  adGroup?: { id?: string };
  campaign?: { id?: string };
}

export function mapGoogleCampaign(r: RawCampaignRow): PlatformCampaign {
  const c = r.campaign ?? {};
  const daily = toInt(r.campaignBudget?.amountMicros);
  const total = toInt(r.campaignBudget?.totalAmountMicros);
  return {
    externalId: String(c.id ?? ""),
    name: c.name?.trim() || `Campanha ${c.id}`,
    objective: c.advertisingChannelType ?? null,
    status: mapGoogleEntityStatus(c.status, c.servingStatus),
    rawStatus: c.status ?? null,
    effectiveStatus: c.servingStatus ?? null,
    budgetMicros: daily && daily > 0 ? daily : total && total > 0 ? total : null,
    budgetPeriod: daily && daily > 0 ? "diario" : total && total > 0 ? "vitalicio" : null,
    bidStrategy: c.biddingStrategyType ?? null,
    startDate: null,
    endDate: null,
  };
}

export function mapGoogleAdGroup(r: RawAdGroupRow): PlatformAdGroup {
  const g = r.adGroup ?? {};
  return {
    externalId: String(g.id ?? ""),
    campaignExternalId: String(r.campaign?.id ?? ""),
    name: g.name?.trim() || `Grupo ${g.id}`,
    status: mapGoogleEntityStatus(g.status),
    rawStatus: g.status ?? null,
    effectiveStatus: null,
    budgetMicros: null,
    budgetPeriod: null,
    optimizationGoal: g.type ?? null,
  };
}

export function mapGoogleAd(r: RawAdRow): PlatformAd {
  const a = r.adGroupAd ?? {};
  const approval = a.policySummary?.approvalStatus;
  const review = a.policySummary?.reviewStatus;
  return {
    externalId: String(a.ad?.id ?? ""),
    adGroupExternalId: String(r.adGroup?.id ?? ""),
    campaignExternalId: String(r.campaign?.id ?? ""),
    name: a.ad?.name?.trim() || `Anúncio ${a.ad?.id}`,
    status: mapGoogleEntityStatus(a.status, undefined, approval),
    rawStatus: a.status ?? null,
    effectiveStatus: approval ?? null,
    creativeType: a.ad?.type ?? null,
    // Em análise tem prioridade; senão, a aprovação informada.
    reviewStatus: review === "UNDER_REVIEW" || review === "REVIEW_IN_PROGRESS" ? "UNDER_REVIEW" : approval && approval !== "UNKNOWN" && approval !== "UNSPECIFIED" ? approval : null,
    thumbnailUrl: https(a.ad?.imageAd?.imageUrl),
  };
}

const CAMPAIGNS_QUERY =
  "SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.advertising_channel_type, " +
  "campaign.bidding_strategy_type, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.period " +
  "FROM campaign WHERE campaign.status != 'REMOVED'";
const AD_GROUPS_QUERY =
  "SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id FROM ad_group WHERE ad_group.status != 'REMOVED'";
const ADS_QUERY =
  "SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.image_ad.image_url, ad_group_ad.status, " +
  "ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group.id, campaign.id " +
  "FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'";

export async function fetchGoogleStructure(customerId: string, options: AdsCallOptions): Promise<PlatformStructure> {
  const [campaigns, adGroups, ads] = await Promise.all([
    search<RawCampaignRow>(customerId, CAMPAIGNS_QUERY, options),
    search<RawAdGroupRow>(customerId, AD_GROUPS_QUERY, options),
    search<RawAdRow>(customerId, ADS_QUERY, options),
  ]);
  return {
    campaigns: campaigns.map(mapGoogleCampaign).filter((c) => c.externalId),
    adGroups: adGroups.map(mapGoogleAdGroup).filter((g) => g.externalId && g.campaignExternalId),
    ads: ads.map(mapGoogleAd).filter((a) => a.externalId && a.adGroupExternalId && a.campaignExternalId),
  };
}

// ------------------------------------------------------------------ métricas diárias

export interface RawMetricsRow {
  segments?: { date?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string; conversionsValue?: number | string };
  campaign?: { id?: string };
  adGroup?: { id?: string };
  adGroupAd?: { ad?: { id?: string } };
}

export function mapGoogleMetrics(r: RawMetricsRow, level: MetricLevel, customerId: string): DailyMetric {
  const campaignId = r.campaign?.id ? String(r.campaign.id) : null;
  const adGroupId = r.adGroup?.id ? String(r.adGroup.id) : null;
  const adId = r.adGroupAd?.ad?.id ? String(r.adGroupAd.ad.id) : null;
  const entity = level === "account" ? customerId : level === "campaign" ? campaignId : level === "ad_group" ? adGroupId : adId;
  const value = toNum(r.metrics?.conversionsValue);
  return {
    date: r.segments?.date ?? "",
    level,
    entityExternalId: entity ?? "",
    campaignExternalId: level === "account" ? null : campaignId,
    adGroupExternalId: level === "ad_group" || level === "ad" ? adGroupId : null,
    adExternalId: level === "ad" ? adId : null,
    spendMicros: toInt(r.metrics?.costMicros) ?? 0,
    impressions: toInt(r.metrics?.impressions) ?? 0,
    reach: null,
    clicks: toInt(r.metrics?.clicks) ?? 0,
    linkClicks: null,
    leads: null,
    messages: null,
    conversions: toNum(r.metrics?.conversions) ?? 0,
    conversionValueMicros: value == null ? 0 : Math.round(value * 1_000_000),
    rawActions: null,
  };
}

const METRICS = "segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";
const QUERIES: Record<MetricLevel, string> = {
  account: `SELECT ${METRICS} FROM customer`,
  campaign: `SELECT campaign.id, ${METRICS} FROM campaign`,
  ad_group: `SELECT campaign.id, ad_group.id, ${METRICS} FROM ad_group`,
  ad: `SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ${METRICS} FROM ad_group_ad`,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function fetchGoogleDailyMetrics(customerId: string, range: DateRange, options: AdsCallOptions): Promise<DailyMetric[]> {
  if (!DATE_RE.test(range.from) || !DATE_RE.test(range.to)) throw new Error("Período inválido");
  const where = ` WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'`;
  const out: DailyMetric[] = [];
  for (const level of ["account", "campaign", "ad_group", "ad"] as MetricLevel[]) {
    const rows = await search<RawMetricsRow>(customerId, QUERIES[level] + where, options);
    for (const r of rows) {
      const m = mapGoogleMetrics(r, level, customerId);
      if (m.date && m.entityExternalId) out.push(m);
    }
  }
  return out;
}
