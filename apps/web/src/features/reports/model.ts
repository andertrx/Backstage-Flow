// Modelo do relatório: as mesmas tabelas viram tela, CSV, Excel e PDF.
// Regras: nunca somar moedas diferentes (uma tabela por moeda) e nunca inventar
// número — o que a plataforma não informa fica vazio ("—").
import {
  computeKpis,
  cpa,
  cpc,
  cpl,
  ctr,
  ENTITY_STATUS_LABELS,
  type EntityStatus,
  type KpiFormat,
  type KpiKey,
  microsToAmount,
  percentChange,
  PLATFORM_LABELS,
  roas,
  type SeriesRow,
} from "@backstage/shared";
import type { CampaignRow } from "@/features/campaigns/types.ts";
import { missingReason } from "@/features/dashboard/summary.ts";
import type { SummaryRow } from "@/features/dashboard/types.ts";
import { formatChange, formatDate, formatKpi } from "@/lib/format.ts";

/** "change" = variação em % com sinal (+12,5% / −3,0%). */
export type CellFormat = "text" | KpiFormat | "change";
export interface Cell {
  value: string | number | null;
  format: CellFormat;
}
export type SheetName = "Resumo" | "Campanhas" | "Dia a dia";

export interface ReportTable {
  title: string;
  sheet: SheetName;
  currency: string | null;
  columns: string[];
  rows: Cell[][];
}

export interface Report {
  title: string;
  /** Linhas do cabeçalho: cliente, plataforma, período... */
  filters: string[];
  generatedAt: string;
  tables: ReportTable[];
}

export const EMPTY_CELL = "—";
export const EMPTY_NOTE = "— = informação não disponível pela API ou sem dados no período.";

const text = (value: string | null): Cell => ({ value, format: "text" });
const num = (value: number | null | undefined, format: KpiFormat | "change"): Cell => ({
  value: value == null || !Number.isFinite(value) ? null : value,
  format,
});

/** Texto de uma célula (tela, CSV e PDF). */
export function formatCell(cell: Cell, currency: string | null): string {
  if (cell.value === null || cell.value === "") return EMPTY_CELL;
  if (typeof cell.value === "string") return cell.value;
  if (cell.format === "text") return String(cell.value);
  if (cell.format === "change") return formatChange(cell.value);
  return formatKpi(cell.value, cell.format, currency ?? "BRL");
}

// ------------------------------------------------------------------ resumo

const SUMMARY_KPIS: KpiKey[] = [
  "spend", "impressions", "clicks", "ctr", "cpc", "cpm", "leads", "cpl", "messages", "conversions", "cpa", "conversion_value", "roas",
];
const KPI_LABELS: Record<KpiKey, [string, KpiFormat]> = {
  spend: ["Investimento", "money"],
  impressions: ["Impressões", "integer"],
  clicks: ["Cliques", "integer"],
  ctr: ["CTR", "percent"],
  cpc: ["CPC", "money"],
  cpm: ["CPM", "money"],
  leads: ["Leads", "decimal"],
  cpl: ["CPL", "money"],
  messages: ["Mensagens", "integer"],
  conversions: ["Conversões", "decimal"],
  cpa: ["CPA", "money"],
  conversion_value: ["Valor de conversão", "money"],
  roas: ["ROAS", "ratio"],
  reach: ["Alcance", "integer"],
  frequency: ["Frequência", "decimal"],
};

export function summaryTable(currency: string, current: SummaryRow, previous: SummaryRow | undefined): ReportTable {
  const now = computeKpis(current);
  const before = previous ? computeKpis(previous) : null;
  return {
    title: `Resumo (${currency})`,
    sheet: "Resumo",
    currency,
    columns: ["Indicador", "Período", "Período anterior", "Variação"],
    rows: SUMMARY_KPIS.map((key) => {
      const [label, format] = KPI_LABELS[key];
      const value = now[key];
      const old = before?.[key] ?? null;
      const change = value != null && old != null ? percentChange(value, old) : null;
      return [
        text(label),
        value == null ? text(missingReason(key, current)) : num(value, format),
        num(old, format),
        num(change, "change"),
      ];
    }),
  };
}

// ------------------------------------------------------------------ campanhas

const money = (micros: number | null) => microsToAmount(micros);

export function campaignTable(currency: string, rows: CampaignRow[]): ReportTable {
  return {
    title: `Campanhas (${currency})`,
    sheet: "Campanhas",
    currency,
    columns: [
      "Campanha", "Cliente", "Plataforma", "Conta", "Status", `Investimento (${currency})`, "Impressões", "Alcance", "Cliques", "CTR",
      `CPC (${currency})`, "Leads", `CPL (${currency})`, "Mensagens", "Conversões", `CPA (${currency})`, "ROAS",
    ],
    rows: rows.map((r) => [
      text(r.name),
      text(r.client_name),
      text(PLATFORM_LABELS[r.platform_id] ?? r.platform_id),
      text(r.account_name),
      text(ENTITY_STATUS_LABELS[r.status as EntityStatus] ?? r.status),
      num(money(r.spend_micros), "money"),
      num(r.impressions, "integer"),
      num(r.reach, "integer"),
      num(r.clicks, "integer"),
      num(r.ctr, "percent"),
      num(money(r.cpc_micros), "money"),
      num(r.leads, "decimal"),
      num(money(r.cpl_micros), "money"),
      num(r.messages, "integer"),
      num(r.conversions, "decimal"),
      num(money(r.cpa_micros), "money"),
      num(r.roas, "ratio"),
    ]),
  };
}

// ------------------------------------------------------------------ dia a dia

export function dailyTable(currency: string, rows: SeriesRow[]): ReportTable {
  return {
    title: `Dia a dia (${currency})`,
    sheet: "Dia a dia",
    currency,
    columns: [
      "Data", `Investimento (${currency})`, "Impressões", "Cliques", "CTR", `CPC (${currency})`, "Leads", `CPL (${currency})`,
      "Mensagens", "Conversões", `CPA (${currency})`, `Valor de conversão (${currency})`, "ROAS",
    ],
    rows: [...rows]
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .map((r) => [
        text(formatDate(r.bucket.slice(0, 10))),
        num(money(r.spend_micros), "money"),
        num(r.impressions, "integer"),
        num(r.clicks, "integer"),
        num(ctr(r.clicks, r.impressions), "percent"),
        num(cpc(r.spend_micros, r.clicks), "money"),
        num(r.leads, "decimal"),
        num(cpl(r.spend_micros, r.leads), "money"),
        num(r.messages, "integer"),
        num(r.conversions, "decimal"),
        num(cpa(r.spend_micros, r.conversions), "money"),
        num(r.conversion_value_micros ? money(r.conversion_value_micros) : null, "money"),
        num(r.conversion_value_micros ? roas(r.conversion_value_micros, r.spend_micros) : null, "ratio"),
      ]),
  };
}

// ------------------------------------------------------------------ relatório completo

export interface ReportInput {
  filters: string[];
  summary: { current: SummaryRow[]; previous: SummaryRow[] };
  campaigns: CampaignRow[];
  daily: SeriesRow[];
  generatedAt?: Date;
}

/** Moedas na ordem do resumo (a de maior investimento primeiro). Nunca somadas. */
export function buildReport(input: ReportInput): Report {
  const currencies = [...new Set([
    ...input.summary.current.map((r) => r.currency),
    ...input.campaigns.map((r) => r.currency).filter((c): c is string => Boolean(c)),
  ])];
  const tables: ReportTable[] = [];
  for (const currency of currencies) {
    const current = input.summary.current.find((r) => r.currency === currency);
    if (current) tables.push(summaryTable(currency, current, input.summary.previous.find((r) => r.currency === currency)));
  }
  for (const currency of currencies) {
    const rows = input.campaigns.filter((r) => r.currency === currency);
    if (rows.length) tables.push(campaignTable(currency, rows));
  }
  for (const currency of currencies) {
    const rows = input.daily.filter((r) => r.currency === currency);
    if (rows.length) tables.push(dailyTable(currency, rows));
  }
  const generatedAt = (input.generatedAt ?? new Date()).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return { title: "Relatório de desempenho", filters: input.filters, generatedAt, tables };
}

/** Nome do arquivo: relatorio-excalibur-fitness-2026-09-17-a-2026-09-23.csv */
export function reportFileName(parts: (string | null | undefined)[], extension: string): string {
  const slug = parts
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `relatorio-${slug || "geral"}.${extension}`;
}
