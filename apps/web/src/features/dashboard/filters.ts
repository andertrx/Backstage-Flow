// Filtros globais do Dashboard. Ficam no endereço da página (?periodo=...&cliente=...),
// então sobrevivem ao recarregar e podem ser compartilhados por link.
import {
  comparisonPeriod,
  type DateRange,
  DEFAULT_TIMEZONE,
  isValidRange,
  PERIOD_LABELS,
  type PeriodPreset,
  resolvePeriod,
} from "@backstage/shared";

export type PeriodChoice = PeriodPreset | "custom";

export const PERIOD_OPTIONS: { value: PeriodChoice; label: string }[] = [
  ...(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((value) => ({ value, label: PERIOD_LABELS[value] })),
  { value: "custom", label: "Personalizado" },
];

export const PLATFORM_OPTIONS = [
  { value: "meta", label: "Meta Ads" },
  { value: "google", label: "Google Ads" },
] as const;

/** Status de campanha que podem ser filtrados. */
export const CAMPAIGN_STATUS_OPTIONS = [
  { value: "ativa", label: "Ativa" },
  { value: "pausada", label: "Pausada" },
  { value: "encerrada", label: "Encerrada" },
  { value: "arquivada", label: "Arquivada" },
  { value: "erro", label: "Com erro" },
] as const;

export interface DashboardFilters {
  period: PeriodChoice;
  /** Só no personalizado. */
  from: string | null;
  to: string | null;
  clientId: string | null;
  platform: string | null;
  accountId: string | null;
  campaignId: string | null;
  status: string | null;
  currency: string | null;
}

const PARAM: Record<keyof DashboardFilters, string> = {
  period: "periodo",
  from: "de",
  to: "ate",
  clientId: "cliente",
  platform: "plataforma",
  accountId: "conta",
  campaignId: "campanha",
  status: "status",
  currency: "moeda",
};

export const DEFAULT_PERIOD: PeriodChoice = "last_7_days";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pick = <T extends string>(value: string | null, allowed: readonly T[]) =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
const currencyCode = (value: string | null) => (value && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null);
const uuid = (value: string | null) => (value && UUID_RE.test(value) ? value.toLowerCase() : null);

/** Lê os filtros do endereço, ignorando qualquer valor inválido. */
export function parseFilters(params: URLSearchParams): DashboardFilters {
  const period = pick(params.get(PARAM.period), PERIOD_OPTIONS.map((o) => o.value)) ?? DEFAULT_PERIOD;
  const from = params.get(PARAM.from);
  const to = params.get(PARAM.to);
  const customOk = period === "custom" && from && to && isValidRange({ from, to });
  return {
    period: period === "custom" && !customOk ? DEFAULT_PERIOD : period,
    from: customOk ? from : null,
    to: customOk ? to : null,
    clientId: uuid(params.get(PARAM.clientId)),
    platform: pick(params.get(PARAM.platform), PLATFORM_OPTIONS.map((o) => o.value)),
    accountId: uuid(params.get(PARAM.accountId)),
    campaignId: uuid(params.get(PARAM.campaignId)),
    status: pick(params.get(PARAM.status), CAMPAIGN_STATUS_OPTIONS.map((o) => o.value)),
    currency: currencyCode(params.get(PARAM.currency)),
  };
}

/** Escreve os filtros no endereço (valores vazios e o período padrão não aparecem). */
export function serializeFilters(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(PARAM) as (keyof DashboardFilters)[]) {
    const value = filters[key];
    if (!value || (key === "period" && value === DEFAULT_PERIOD)) continue;
    if ((key === "from" || key === "to") && filters.period !== "custom") continue;
    params.set(PARAM[key], value);
  }
  return params;
}

/**
 * Aplica uma mudança mantendo os filtros coerentes: trocar o cliente limpa
 * conta e campanha; trocar a plataforma ou a conta limpa a campanha.
 */
export function updateFilters(current: DashboardFilters, patch: Partial<DashboardFilters>): DashboardFilters {
  const next = { ...current, ...patch };
  if ("clientId" in patch && patch.clientId !== current.clientId) {
    next.accountId = null;
    next.campaignId = null;
  }
  if (("platform" in patch && patch.platform !== current.platform) || ("accountId" in patch && patch.accountId !== current.accountId)) {
    next.campaignId = null;
  }
  if ("period" in patch && patch.period !== "custom") {
    next.from = null;
    next.to = null;
  }
  return next;
}

export interface ResolvedPeriod {
  current: DateRange;
  previous: DateRange;
}

/** Datas do período escolhido e do período de comparação, no fuso informado. */
export function resolveFilterPeriod(filters: DashboardFilters, timezone = DEFAULT_TIMEZONE, now = new Date()): ResolvedPeriod {
  const current =
    filters.period === "custom" && filters.from && filters.to
      ? { from: filters.from, to: filters.to }
      : resolvePeriod(filters.period === "custom" ? "last_7_days" : filters.period, timezone, now);
  return { current, previous: comparisonPeriod(filters.period, current) };
}

export function hasActiveFilters(filters: DashboardFilters): boolean {
  return Boolean(filters.clientId || filters.platform || filters.accountId || filters.campaignId || filters.status);
}
