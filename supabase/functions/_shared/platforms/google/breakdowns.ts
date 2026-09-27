/**
 * Google Ads → divisões por idade, gênero, aparelho, horário e cidade
 * (Etapa 19.3). Consultas GAQL oficiais, um dia por linha (segments.date):
 *
 *   age_range_view      → idade  (só campanhas com segmentação demográfica:
 *   gender_view         → gênero  Pesquisa, Display, Vídeo; Performance Max não entra)
 *   customer + segments.device → aparelho
 *   customer + segments.hour   → horário (fuso da conta)
 *   geographic_view + segments.geo_target_city (local de presença) → cidade;
 *     os nomes vêm de geo_target_constant.
 *
 * O Google não informa leads/mensagens/cliques no link: ficam null.
 */
import { AppError } from "../../http.ts";
import type { BreakdownDimension, BreakdownMetric, BreakdownResult, DateRange } from "../types.ts";
import { type AdsCallOptions, search } from "./client.ts";

interface Metrics { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string; conversionsValue?: number | string }
export interface RawBreakdownRow {
  segments?: { date?: string; device?: string; hour?: number | string; geoTargetCity?: string };
  metrics?: Metrics;
  adGroupCriterion?: { ageRange?: { type?: string }; gender?: { type?: string } };
}

const toInt = (v: unknown) => (v === undefined || v === null || v === "" ? 0 : Math.round(Number(v)));
const toNum = (v: unknown) => (v === undefined || v === null || v === "" ? 0 : Number(v));

const AGE: Record<string, string> = {
  AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44", AGE_RANGE_45_54: "45-54",
  AGE_RANGE_55_64: "55-64", AGE_RANGE_65_UP: "65+",
};
const GENDER: Record<string, string> = { FEMALE: "female", MALE: "male" };

export const googleAge = (t: string | undefined) => (t && AGE[t]) || "unknown";
export const googleGender = (t: string | undefined) => (t && GENDER[t]) || "unknown";
export const googleDevice = (t: string | undefined) => (t && t !== "UNKNOWN" && t !== "UNSPECIFIED" ? t.toLowerCase() : "unknown");
export const googleHour = (h: number | string | undefined) => {
  const n = Number(h);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? String(n).padStart(2, "0") : "unknown";
};

const METRICS = "segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

interface Query {
  dimension: BreakdownDimension;
  gaql: (where: string) => string;
  value: (r: RawBreakdownRow) => string;
}

const QUERIES: Query[] = [
  { dimension: "age", gaql: (w) => `SELECT ad_group_criterion.age_range.type, ${METRICS} FROM age_range_view${w}`, value: (r) => googleAge(r.adGroupCriterion?.ageRange?.type) },
  { dimension: "gender", gaql: (w) => `SELECT ad_group_criterion.gender.type, ${METRICS} FROM gender_view${w}`, value: (r) => googleGender(r.adGroupCriterion?.gender?.type) },
  { dimension: "device", gaql: (w) => `SELECT segments.device, ${METRICS} FROM customer${w}`, value: (r) => googleDevice(r.segments?.device) },
  { dimension: "hour", gaql: (w) => `SELECT segments.hour, ${METRICS} FROM customer${w}`, value: (r) => googleHour(r.segments?.hour) },
  {
    dimension: "city",
    gaql: (w) => `SELECT segments.geo_target_city, ${METRICS} FROM geographic_view${w} AND geographic_view.location_type = 'LOCATION_OF_PRESENCE'`,
    value: (r) => r.segments?.geoTargetCity || "unknown",
  },
];

/** Soma as linhas iguais (mesmo dia e mesma fatia: ex. vários grupos de anúncio na mesma idade). */
export function addGoogleRows(target: Map<string, BreakdownMetric>, dimension: BreakdownDimension, rows: RawBreakdownRow[], value: (r: RawBreakdownRow) => string) {
  for (const r of rows) {
    const date = r.segments?.date;
    if (!date) continue;
    const v = value(r);
    const key = `${date}|${dimension}|${v}`;
    const prev = target.get(key);
    const conversionValue = Math.round(toNum(r.metrics?.conversionsValue) * 1_000_000);
    target.set(key, {
      date, dimension, value: v,
      spendMicros: (prev?.spendMicros ?? 0) + toInt(r.metrics?.costMicros),
      impressions: (prev?.impressions ?? 0) + toInt(r.metrics?.impressions),
      clicks: (prev?.clicks ?? 0) + toInt(r.metrics?.clicks),
      linkClicks: null,
      leads: null,
      messages: null,
      conversions: (prev?.conversions ?? 0) + toNum(r.metrics?.conversions),
      conversionValueMicros: (prev?.conversionValueMicros ?? 0) + conversionValue,
      actions: null,
    });
  }
}

interface RawGeo { geoTargetConstant?: { resourceName?: string; name?: string; canonicalName?: string } }

/** "São Paulo,State of Sao Paulo,Brazil" → "São Paulo (State of Sao Paulo)". */
export function cityLabel(name: string | undefined, canonical: string | undefined): string | null {
  if (!name) return null;
  const parts = (canonical ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const region = parts.length >= 3 ? parts[parts.length - 2] : null;
  return (region ? `${name} (${region})` : name).slice(0, 200);
}

/** Troca "geoTargetConstants/1001773" pelo nome da cidade (consulta oficial geo_target_constant). */
async function nameCities(rows: BreakdownMetric[], customerId: string, options: AdsCallOptions) {
  const ids = [...new Set(rows.filter((r) => r.dimension === "city" && /^geoTargetConstants\/\d+$/.test(r.value)).map((r) => r.value))];
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const list = ids.slice(i, i + 200).map((id) => `'${id}'`).join(", ");
    const geo = await search<RawGeo>(customerId,
      `SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${list})`,
      options);
    for (const g of geo) {
      const label = cityLabel(g.geoTargetConstant?.name, g.geoTargetConstant?.canonicalName);
      if (g.geoTargetConstant?.resourceName && label) names.set(g.geoTargetConstant.resourceName, label);
    }
  }
  // Mesmo nome pode aparecer em linhas diferentes: soma de novo depois de renomear.
  const merged = new Map<string, BreakdownMetric>();
  for (const r of rows) {
    const value = r.dimension === "city" ? (names.get(r.value) ?? (r.value === "unknown" ? "unknown" : r.value)) : r.value;
    const key = `${r.date}|${r.dimension}|${value}`;
    const prev = merged.get(key);
    merged.set(key, prev
      ? { ...prev, spendMicros: prev.spendMicros + r.spendMicros, impressions: prev.impressions + r.impressions, clicks: prev.clicks + r.clicks,
          conversions: (prev.conversions ?? 0) + (r.conversions ?? 0), conversionValueMicros: (prev.conversionValueMicros ?? 0) + (r.conversionValueMicros ?? 0) }
      : { ...r, value });
  }
  return [...merged.values()];
}

const FATAL = new Set(["AUTH_EXPIRED", "CONNECTION_REVOKED", "RATE_LIMITED", "PLATFORM_UNAVAILABLE", "CONFIG_ERROR", "ACCOUNT_NOT_ENABLED"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function fetchGoogleBreakdowns(customerId: string, range: DateRange, options: AdsCallOptions): Promise<BreakdownResult> {
  if (!DATE_RE.test(range.from) || !DATE_RE.test(range.to)) throw new Error("Período inválido");
  const where = ` WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'`;
  const all = new Map<string, BreakdownMetric>();
  const dimensions: BreakdownDimension[] = [];
  const failed: BreakdownResult["failed"] = [];
  for (const q of QUERIES) {
    const partial = new Map<string, BreakdownMetric>();
    try {
      addGoogleRows(partial, q.dimension, await search<RawBreakdownRow>(customerId, q.gaql(where), options), q.value);
    } catch (err) {
      const code = err instanceof AppError ? err.code : "UNKNOWN";
      if (FATAL.has(code)) throw err;
      failed.push({ dimension: q.dimension, code });
      continue;
    }
    for (const [k, v] of partial) all.set(k, v);
    dimensions.push(q.dimension);
  }
  let rows = [...all.values()];
  if (dimensions.includes("city")) {
    try {
      rows = await nameCities(rows, customerId, options);
    } catch (err) {
      // Sem os nomes, a cidade não serve para o cliente: deixa essa dimensão de fora desta vez.
      const code = err instanceof AppError ? err.code : "UNKNOWN";
      if (FATAL.has(code)) throw err;
      rows = rows.filter((r) => r.dimension !== "city");
      dimensions.splice(dimensions.indexOf("city"), 1);
      failed.push({ dimension: "city", code });
    }
  }
  return { rows, dimensions, failed };
}
