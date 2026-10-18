// Etapa 39.5 — exportação da Inteligência de Resultados (CSV e Excel), gerada no navegador
// a partir dos mesmos números da tela. Sem dados pessoais: só campanhas, conjuntos, anúncios e contagens.
import {
  classifiedShare, costPerContact, type DateRange, profileShare, rankItems, RI_PROFILE_LABELS, type RiProfile, type RiResultItem, type RiResults,
} from "@backstage/shared";
import type { Cell, Report, ReportTable, SheetName } from "@/features/reports/model.ts";
import { formatDate, formatDateTime } from "@/lib/format.ts";

export type ExportProfile = Exclude<RiProfile, "nao_identificado"> | "todos";

const PLURAL: Record<RiProfile, string> = { lojista: "Lojistas", sacoleiro: "Sacoleiros", consumidor_final: "Consumidores finais", nao_identificado: "Não identificados" };
const ALL: RiProfile[] = ["lojista", "sacoleiro", "consumidor_final", "nao_identificado"];

const t = (v: string | null): Cell => ({ value: v, format: "text" });
const n = (v: number | null): Cell => ({ value: v, format: "integer" });
const pct = (v: number | null): Cell => ({ value: v, format: "percent" });
const money = (v: number | null): Cell => ({ value: v, format: "money" });

/** Investimento numa moeda só; com mais de uma moeda (nunca somamos) fica vazio e a coluna Moeda diz quais. */
function spendCells(item: RiResultItem): [Cell, Cell] {
  if (item.spend.length === 1) return [money(item.spend[0].spend_micros / 1e6), t(item.spend[0].currency)];
  return [money(null), t(item.spend.length ? item.spend.map((s) => s.currency).join(" + ") : null)];
}

type Level = { sheet: SheetName; title: string; data: RiResults; parents: ("campaign" | "ad_group")[] };

function levelTable(l: Level, profile: ExportProfile): ReportTable {
  const parentCols = l.parents.map((p) => (p === "campaign" ? "Campanha" : "Conjunto"));
  const parentCells = (i: RiResultItem) => l.parents.map((p) => t(p === "campaign" ? i.campaign_name : i.ad_group_name));
  if (profile === "todos") {
    return {
      title: l.title, sheet: l.sheet, currency: null,
      columns: [...parentCols, l.title.replace(/s$/, ""), "Contatos", ...ALL.map((p) => PLURAL[p]), "Investimento", "Moeda", "Linhas ligadas pelo nome"],
      rows: [...l.data.items].sort((a, b) => b.contacts - a.contacts || a.name.localeCompare(b.name, "pt-BR"))
        .map((i) => [...parentCells(i), t(i.name), n(i.contacts), ...ALL.map((p) => n(i[p])), ...spendCells(i), n(i.by_name)]),
    };
  }
  const label = RI_PROFILE_LABELS[profile].toLowerCase();
  return {
    title: l.title, sheet: l.sheet, currency: null,
    columns: ["Posição", "Empate", ...parentCols, l.title.replace(/s$/, ""), PLURAL[profile], `% de ${PLURAL[profile].toLowerCase()} no item`, "Contatos",
      "Investimento", "Moeda", `Custo por ${label}`, "Linhas ligadas pelo nome"],
    rows: rankItems(l.data.items, profile, "count").map((r) => {
      const cost = costPerContact(r.spend, r[profile]);
      return [n(r.position), t(r.tied ? "sim" : "não"), ...parentCells(r), t(r.name), n(r[profile]), pct(profileShare(r, profile)), n(r.contacts),
        ...spendCells(r), money(cost ? cost.micros / 1e6 : null), n(r.by_name)];
    }),
  };
}

export interface ResultsExportInput {
  clientName: string;
  range: DateRange;
  profile: ExportProfile;
  campaigns: RiResults;
  adGroups: RiResults;
  ads: RiResults;
  generatedAt: Date;
}

/** O relatório (mesmo modelo do módulo Relatórios): Resumo, Campanhas, Conjuntos e Anúncios. */
export function resultsReport(input: ResultsExportInput): Report {
  const tot = input.campaigns.totals;
  const who = input.profile === "todos" ? "Todos os perfis" : PLURAL[input.profile];
  const summary: ReportTable = {
    title: "Resumo do período", sheet: "Resumo", currency: null, columns: ["Indicador", "Valor"],
    rows: [
      [t("Contatos únicos"), n(tot.contacts)],
      ...ALL.map((p) => [t(PLURAL[p]), n(tot[p])]),
      [t("Contatos classificados (%)"), pct(classifiedShare(tot))],
      [t("Contatos com origem identificada"), n(tot.with_origin)],
      [t("Linhas ligadas ao anúncio"), n(tot.origin_ad)],
      [t("Linhas ligadas só ao conjunto"), n(tot.origin_ad_group)],
      [t("Linhas ligadas só à campanha"), n(tot.origin_campaign)],
      [t("Linhas ligadas pelo nome (sem ID)"), n(tot.origin_by_name)],
      [t("Linhas sem origem na planilha"), n(tot.no_origin)],
      [t("Linhas com nome ambíguo"), n(tot.ambiguous)],
      [t("Linhas com origem não encontrada no CRM"), n(tot.not_found)],
      [t("Linhas sem data (fora de qualquer período)"), n(input.campaigns.outside.no_date)],
    ],
  };
  const levels: Level[] = [
    { sheet: "Campanhas", title: "Campanhas", data: input.campaigns, parents: [] },
    { sheet: "Conjuntos", title: "Conjuntos", data: input.adGroups, parents: ["campaign"] },
    { sheet: "Anúncios", title: "Anúncios", data: input.ads, parents: ["campaign", "ad_group"] },
  ];
  return {
    title: `Inteligência de Resultados — ${who}`,
    filters: [
      `Cliente: ${input.clientName}`,
      `Período: ${formatDate(input.range.from)} a ${formatDate(input.range.to)} (data do contato na planilha)`,
      `Perfil: ${who}`,
      input.campaigns.read_at ? `Dados da leitura da planilha de ${formatDateTime(input.campaigns.read_at)}` : "Planilha ainda não lida",
      "Investimento: Meta/Google no mesmo período, na moeda de cada conta (moedas nunca são somadas).",
      "Sem dados pessoais: nenhum telefone, e-mail ou nome.",
    ],
    generatedAt: formatDateTime(input.generatedAt.toISOString()),
    tables: [summary, ...levels.map((l) => levelTable(l, input.profile))],
  };
}

export const RESULTS_SHEETS: SheetName[] = ["Resumo", "Campanhas", "Conjuntos", "Anúncios"];

export function resultsFileName(clientName: string, profile: ExportProfile, range: DateRange, ext: "csv" | "xlsx"): string {
  const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `inteligencia-${slug(clientName)}-${profile === "todos" ? "todos" : slug(PLURAL[profile])}-${range.from}-a-${range.to}.${ext}`;
}
