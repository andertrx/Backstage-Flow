// Estado da tabela de campanhas no endereço da página (?busca=&situacao=&ordem=&dir=&pagina=).
import { CAMPAIGN_STATUS_FILTERS, type CampaignStatusFilter } from "@backstage/shared";

export const SORT_KEYS = [
  "name", "platform", "objective", "status", "budget", "spend", "impressions", "reach", "frequency",
  "clicks", "ctr", "cpc", "cpm", "leads", "messages", "conversions", "cpl", "cpa", "roas",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const PAGE_SIZE = 50;

export interface TableState {
  search: string;
  status: CampaignStatusFilter | null;
  sort: SortKey;
  desc: boolean;
  page: number;
}

export const DEFAULT_TABLE: TableState = { search: "", status: null, sort: "spend", desc: true, page: 1 };

/** Colunas de texto começam em ordem A→Z; números começam do maior para o menor. */
export const TEXT_SORTS: readonly SortKey[] = ["name", "platform", "objective", "status"];

export function parseTable(params: URLSearchParams): TableState {
  const sort = params.get("ordem");
  const status = params.get("situacao");
  const page = Number(params.get("pagina"));
  const validSort = (SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : DEFAULT_TABLE.sort;
  return {
    search: (params.get("busca") ?? "").slice(0, 100),
    status: status && status in CAMPAIGN_STATUS_FILTERS ? (status as CampaignStatusFilter) : null,
    sort: validSort,
    desc: params.has("dir") ? params.get("dir") !== "asc" : !TEXT_SORTS.includes(validSort),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Grava o estado da tabela sem apagar os demais filtros (período, cliente...). */
export function writeTable(params: URLSearchParams, t: TableState): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (k: string, v: string | null) => (v ? next.set(k, v) : next.delete(k));
  set("busca", t.search.trim() || null);
  set("situacao", t.status);
  set("ordem", t.sort === DEFAULT_TABLE.sort ? null : t.sort);
  const defaultDesc = !TEXT_SORTS.includes(t.sort);
  set("dir", t.desc === defaultDesc ? null : t.desc ? "desc" : "asc");
  set("pagina", t.page > 1 ? String(t.page) : null);
  return next;
}

/** Clicar no título da coluna: mesma coluna inverte; outra coluna começa no sentido natural. */
export function toggleSort(t: TableState, key: SortKey): TableState {
  if (t.sort === key) return { ...t, desc: !t.desc, page: 1 };
  return { ...t, sort: key, desc: !TEXT_SORTS.includes(key), page: 1 };
}
