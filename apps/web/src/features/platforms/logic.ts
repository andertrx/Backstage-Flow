// Regras da visão de uma plataforma. Os dados de cada plataforma vêm do
// catálogo único (@backstage/shared → platforms/catalog.ts).
import { type EntityStatus, type KpiKey, PLATFORMS, type PlatformDefinition } from "@backstage/shared";
import type { DashboardFilters } from "@/features/dashboard/filters.ts";
import type { FilterAccount } from "@/features/dashboard/types.ts";

export type PlatformId = string;

export interface PlatformView {
  id: PlatformId;
  label: string;
  /** Endereço da tela no menu. */
  path: string;
  /** Nome do nível do meio na plataforma. */
  groupLabel: string;
  /** Indicadores exibidos, na ordem. */
  kpis: KpiKey[];
  /** Nomes que a plataforma usa para alguns indicadores (ex.: Google: "Custo/conversão"). */
  labels?: Partial<Record<KpiKey, string>>;
  /** Resultado principal na lista de campanhas. */
  result: "leads" | "conversions";
  /** "saldo" ou "orçamento". */
  money: PlatformDefinition["money"];
  capabilities: PlatformDefinition["capabilities"];
}

export function platformView(p: PlatformDefinition): PlatformView {
  return {
    id: p.id,
    label: p.name,
    path: p.path,
    groupLabel: p.groupLevel.short,
    kpis: p.kpis,
    labels: p.kpiLabels,
    result: p.result,
    money: p.money,
    capabilities: p.capabilities,
  };
}

/** Uma visão por plataforma do catálogo, na ordem do menu. */
export const PLATFORM_VIEW_LIST: readonly PlatformView[] = PLATFORMS.map(platformView);

export const PLATFORM_VIEWS: Record<PlatformId, PlatformView> = Object.fromEntries(PLATFORM_VIEW_LIST.map((v) => [v.id, v]));

/** Definição do indicador com o nome usado pela plataforma. */
export function platformKpiLabel(view: PlatformView, key: KpiKey, fallback: string): string {
  return view.labels?.[key] ?? fallback;
}

// -----------------------------------------------------------------------------
// Estrutura (campanhas, conjuntos/grupos, anúncios por status)
// -----------------------------------------------------------------------------
export interface StructureRow {
  level: "account" | "campaign" | "ad_group" | "ad";
  status: EntityStatus;
  total: number;
}

export interface LevelCount {
  total: number;
  active: number;
  paused: number;
  /** Com erro ou reprovado pela plataforma. */
  error: number;
}

export type StructureSummary = Record<"campaign" | "ad_group" | "ad", LevelCount>;

export function summarizeStructure(rows: StructureRow[]): StructureSummary {
  const empty = (): LevelCount => ({ total: 0, active: 0, paused: 0, error: 0 });
  const out: StructureSummary = { campaign: empty(), ad_group: empty(), ad: empty() };
  for (const r of rows) {
    if (r.level === "account") continue;
    const c = out[r.level];
    c.total += r.total;
    if (r.status === "ativa") c.active += r.total;
    else if (r.status === "pausada") c.paused += r.total;
    else if (r.status === "erro") c.error += r.total;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Alcance: só existe pronto da plataforma, para UM item e o período EXATO.
// -----------------------------------------------------------------------------
export type ReachScope =
  | { kind: "account"; adAccountId: string; externalId: string }
  | { kind: "campaign"; campaignId: string }
  | { kind: "none"; reason: string };

export const REACH_REASONS = {
  manyAccounts: "Não pode ser somado entre contas (a mesma pessoa contaria duas vezes). Escolha uma conta.",
  manyCampaigns: "Não pode ser somado entre campanhas. Escolha uma campanha.",
  noAccount: "Nenhuma conta desta plataforma com os filtros escolhidos.",
  notSynced: "Ainda não foi buscado na plataforma para este período exato (vem pronto da API nas sincronizações).",
} as const;

/** Diz de qual item buscar o alcance, ou por que ele não pode aparecer. */
export function reachScope(filters: DashboardFilters, accounts: FilterAccount[], platform: PlatformId): ReachScope {
  if (filters.campaignId) return { kind: "campaign", campaignId: filters.campaignId };
  if (filters.status) return { kind: "none", reason: REACH_REASONS.manyCampaigns };
  const inScope = accounts.filter(
    (a) => a.platform_id === platform && (!filters.clientId || a.client_id === filters.clientId) && (!filters.accountId || a.id === filters.accountId),
  );
  if (inScope.length === 0) return { kind: "none", reason: REACH_REASONS.noAccount };
  if (inScope.length > 1) return { kind: "none", reason: REACH_REASONS.manyAccounts };
  return { kind: "account", adAccountId: inScope[0].id, externalId: inScope[0].external_id };
}
