/**
 * Meta → divisões por idade, gênero, plataforma, aparelho, horário e estado
 * (Etapa 19.3). Fonte oficial: act_{id}/insights com "breakdowns", nível conta,
 * um dia por linha (time_increment=1).
 *
 *   age,gender                                   → idade e gênero (uma chamada, somamos cada lado)
 *   publisher_platform                           → Facebook, Instagram, Audience Network, Messenger…
 *   device_platform                              → celular (app), celular (navegador), computador
 *   hourly_stats_aggregated_by_advertiser_time_zone → horário no fuso da conta
 *   region                                       → estado (o Meta não informa cidade para anúncios)
 *
 * Métricas somáveis apenas (investimento, impressões, cliques, ações). Alcance
 * não é somável entre fatias e não é buscado aqui.
 */
import { isReportActionType } from "../../../../../packages/shared/src/reports/clientReport.ts";
import { AppError } from "../../http.ts";
import type { BreakdownDimension, BreakdownMetric, BreakdownResult, DateRange } from "../types.ts";
import { graphGetAll } from "./client.ts";
import { mapMetaInsight, type RawInsight, splitRange } from "./sync.ts";

interface RawBreakdownInsight extends RawInsight {
  age?: string;
  gender?: string;
  publisher_platform?: string;
  device_platform?: string;
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
  region?: string;
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return !t || t.toLowerCase() === "unknown" ? "unknown" : t;
};

/** "13:00:00 - 13:59:59" → "13". */
export function metaHour(v: string | undefined): string {
  const m = /^(\d{2}):/.exec(v ?? "");
  return m ? m[1] : "unknown";
}

interface Call {
  breakdowns: string;
  dimensions: BreakdownDimension[];
  values: (r: RawBreakdownInsight) => Partial<Record<BreakdownDimension, string>>;
}

const CALLS: Call[] = [
  { breakdowns: "age,gender", dimensions: ["age", "gender"], values: (r) => ({ age: clean(r.age), gender: clean(r.gender) }) },
  { breakdowns: "publisher_platform", dimensions: ["publisher_platform"], values: (r) => ({ publisher_platform: clean(r.publisher_platform) }) },
  { breakdowns: "device_platform", dimensions: ["device"], values: (r) => ({ device: clean(r.device_platform) }) },
  { breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone", dimensions: ["hour"], values: (r) => ({ hour: metaHour(r.hourly_stats_aggregated_by_advertiser_time_zone) }) },
  { breakdowns: "region", dimensions: ["region"], values: (r) => ({ region: clean(r.region) }) },
];

const FIELDS = "date_start,date_stop,spend,impressions,clicks,inline_link_clicks,actions,action_values";

/** Só os tipos de ação que o painel usa (o Meta manda dezenas). */
export function compactActions(r: RawInsight): Record<string, number> | null {
  if (!r.actions) return null;
  const out: Record<string, number> = {};
  for (const a of r.actions) {
    if (a.action_type && isReportActionType(a.action_type)) {
      const n = Number(a.value ?? 0);
      if (Number.isFinite(n)) out[a.action_type] = (out[a.action_type] ?? 0) + n;
    }
  }
  return out;
}

/** Linha do Meta → uma linha por dimensão da chamada; soma linhas iguais (ex.: idade somando os gêneros). */
export function addMetaRows(target: Map<string, BreakdownMetric>, call: Call, rows: RawBreakdownInsight[], accountExternalId: string) {
  for (const r of rows) {
    const base = mapMetaInsight(r, "account", accountExternalId);
    if (!base.date) continue;
    const actions = compactActions(r);
    const values = call.values(r);
    for (const dimension of call.dimensions) {
      const value = values[dimension] ?? "unknown";
      const key = `${base.date}|${dimension}|${value}`;
      const prev = target.get(key);
      const add = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
      const mergedActions = actions || prev?.actions
        ? Object.entries(actions ?? {}).reduce((acc, [k, v]) => ({ ...acc, [k]: (acc[k] ?? 0) + v }), { ...(prev?.actions ?? {}) })
        : null;
      target.set(key, {
        date: base.date, dimension, value,
        spendMicros: (prev?.spendMicros ?? 0) + (base.spendMicros ?? 0),
        impressions: (prev?.impressions ?? 0) + (base.impressions ?? 0),
        clicks: (prev?.clicks ?? 0) + (base.clicks ?? 0),
        linkClicks: add(prev?.linkClicks ?? null, base.linkClicks),
        leads: add(prev?.leads ?? null, base.leads),
        messages: add(prev?.messages ?? null, base.messages),
        conversions: add(prev?.conversions ?? null, base.conversions),
        conversionValueMicros: add(prev?.conversionValueMicros ?? null, base.conversionValueMicros),
        actions: mergedActions,
      });
    }
  }
}

/** Erros que param tudo (credencial, limite): não adianta tentar as outras dimensões. */
const FATAL = new Set(["AUTH_EXPIRED", "CONNECTION_REVOKED", "RATE_LIMITED", "PLATFORM_UNAVAILABLE", "CONFIG_ERROR", "ACCOUNT_NOT_ENABLED"]);

export async function fetchMetaBreakdowns(token: string, externalId: string, range: DateRange, fetchImpl: typeof fetch): Promise<BreakdownResult> {
  const rows = new Map<string, BreakdownMetric>();
  const dimensions: BreakdownDimension[] = [];
  const failed: BreakdownResult["failed"] = [];
  for (const call of CALLS) {
    const partial = new Map<string, BreakdownMetric>();
    try {
      for (const window of splitRange(range, 10)) {
        const raw = await graphGetAll<RawBreakdownInsight>(`act_${externalId}/insights`, {
          level: "account",
          fields: FIELDS,
          breakdowns: call.breakdowns,
          time_range: JSON.stringify({ since: window.from, until: window.to }),
          time_increment: "1",
          use_unified_attribution_setting: "true",
          limit: "500",
        }, token, fetchImpl);
        addMetaRows(partial, call, raw, externalId);
      }
    } catch (err) {
      const code = err instanceof AppError ? err.code : "UNKNOWN";
      if (FATAL.has(code)) throw err;
      for (const d of call.dimensions) failed.push({ dimension: d, code });
      continue;
    }
    for (const [k, v] of partial) rows.set(k, v);
    dimensions.push(...call.dimensions);
  }
  return { rows: [...rows.values()], dimensions, failed };
}
