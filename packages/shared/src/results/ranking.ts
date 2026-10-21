// Etapa 39.3 — Inteligência de Resultados: ranking de campanhas, conjuntos e anúncios por perfil.
// Os números vêm do banco (public.ri_results); aqui ficam as regras de ordem, empate, % e custo.
import type { RiProfile } from "./sheets.ts";

export type RiLevel = "campaign" | "ad_group" | "ad";
export type RiMatchIssue = "sem_origem" | "nao_encontrada" | "nome_ambiguo";

/** Investimento de um item numa moeda (nunca somamos moedas diferentes). */
export interface RiSpend { currency: string; spend_micros: number }

/** Um item do ranking (campanha, conjunto ou anúncio) com os contatos únicos de cada perfil. */
export interface RiResultItem extends Record<RiProfile, number> {
  id: string;
  name: string;
  status: string | null;
  platform_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_group_id: string | null;
  ad_group_name: string | null;
  thumbnail_url: string | null;
  contacts: number;
  /** Linhas ligadas pelo nome (e não pelo ID). */
  by_name: number;
  /** Leads e mensagens que o Meta/Google informa para o item no período (null = sem dado da plataforma). */
  leads?: number | null;
  messages?: number | null;
  spend: RiSpend[];
}

export interface RiResultTotals extends Record<RiProfile, number> {
  rows: number;
  contacts: number;
  with_origin: number;
  origin_ad: number;
  origin_ad_group: number;
  origin_campaign: number;
  origin_by_name: number;
  no_origin: number;
  not_found: number;
  ambiguous: number;
}

export interface RiResults {
  read_at: string | null;
  sources: number;
  level: RiLevel;
  totals: RiResultTotals;
  /** Por perfil: contatos sem campanha preenchida na planilha e com campanha preenchida que o CRM não achou. */
  gaps?: Partial<Record<RiProfile, { no_campaign: number; not_linked: number }>>;
  outside: { no_date: number; all_rows: number };
  scope_contacts: number;
  scope_without_level: number;
  items: RiResultItem[];
}

/** Ordenar por: quantidade de contatos do perfil, % do perfil no item, ou custo por contato do perfil. */
export type RiRankMetric = "count" | "share" | "cost";

export interface RiRanked extends RiResultItem {
  /** Posição (1, 2, 2, 4…): itens empatados ficam na mesma posição. */
  position: number;
  tied: boolean;
  /** Valor usado na ordem (null = sem dado, vai para o fim). */
  value: number | null;
}

/** % do perfil entre os contatos do item (0–100). null quando o item não tem contatos. */
export function profileShare(item: Pick<RiResultItem, "contacts"> & Partial<Record<RiProfile, number>>, profile: RiProfile | "contacts"): number | null {
  if (profile === "contacts") return item.contacts > 0 ? 100 : null;
  return item.contacts > 0 ? ((item[profile] ?? 0) / item.contacts) * 100 : null;
}

/**
 * Custo por contato, em micros, numa única moeda. null quando não há como calcular
 * (sem contato do perfil, sem investimento informado ou mais de uma moeda no item).
 */
export function costPerContact(spend: RiSpend[], count: number): { currency: string; micros: number } | null {
  if (count <= 0 || spend.length !== 1) return null;
  return { currency: spend[0].currency, micros: Math.round(spend[0].spend_micros / count) };
}

/**
 * Ranking: maior quantidade (ou %) primeiro; custo, o menor primeiro. Itens sem nenhum
 * contato do perfil ficam de fora. Empate só quando o valor é igual; desempate de exibição pelo nome.
 */
export function rankItems(items: RiResultItem[], profile: RiProfile | "contacts", metric: RiRankMetric = "count"): RiRanked[] {
  const count = (i: RiResultItem) => (profile === "contacts" ? i.contacts : i[profile]);
  const valueOf = (i: RiResultItem): number | null =>
    metric === "count" ? count(i) : metric === "share" ? profileShare(i, profile) : costPerContact(i.spend, count(i))?.micros ?? null;
  const rows = items.filter((i) => count(i) > 0).map((i) => ({ ...i, value: valueOf(i) }));
  const dir = metric === "cost" ? 1 : -1;
  rows.sort((a, b) => {
    if (a.value == null || b.value == null) return a.value == null ? (b.value == null ? a.name.localeCompare(b.name, "pt-BR") : 1) : -1;
    if (a.value !== b.value) return dir * (a.value - b.value);
    return a.name.localeCompare(b.name, "pt-BR");
  });
  const out: RiRanked[] = [];
  rows.forEach((r, i) => {
    const prev = out[i - 1];
    const same = prev != null && r.value != null && prev.value === r.value;
    out.push({ ...r, position: same ? prev.position : i + 1, tied: false });
    if (same) { prev.tied = true; out[i].tied = true; }
  });
  return out;
}

/** O que mais trouxe o perfil (para os cards). Empate: devolve todos os empatados. */
export function topFor(items: RiResultItem[], profile: RiProfile | "contacts"): RiRanked[] {
  return rankItems(items, profile, "count").filter((r) => r.position === 1);
}

/** % classificados: contatos com perfil (lojista, sacoleiro ou consumidor final) sobre o total. */
export function classifiedShare(t: Pick<RiResultTotals, "contacts" | "nao_identificado">): number | null {
  return t.contacts > 0 ? ((t.contacts - t.nao_identificado) / t.contacts) * 100 : null;
}
