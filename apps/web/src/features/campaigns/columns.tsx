import { objectiveLabel, PLATFORM_LABELS } from "@backstage/shared";
import type { ReactNode } from "react";
import { formatKpi, formatMoney } from "@/lib/format.ts";
import { CampaignStatusBadge } from "./CampaignStatusBadge.tsx";
import type { SortKey } from "./table.ts";
import type { CampaignRow } from "./types.ts";

export const NOT_AVAILABLE = "Informação não disponível pela API.";

export interface Column {
  key: SortKey;
  label: string;
  /** Explicação curta mostrada ao passar o mouse no título. */
  hint?: string;
  numeric?: boolean;
  render: (row: CampaignRow) => ReactNode;
}

const dash = (title = NOT_AVAILABLE) => <span className="text-slate-300" title={title}>—</span>;
const cur = (r: CampaignRow) => r.currency ?? "BRL";
/** Números do período: sem dados → "—" com a explicação. */
const metric = (r: CampaignRow, v: number | null, show: (n: number) => string) =>
  !r.has_data ? dash("Sem dados no período.") : v == null ? dash() : show(v);
const money = (r: CampaignRow, micros: number | null) => metric(r, micros, (m) => formatMoney(m / 1_000_000, cur(r)));
const int = (r: CampaignRow, v: number | null) => metric(r, v, (n) => formatKpi(n, "integer", "BRL"));
const dec = (r: CampaignRow, v: number | null) => metric(r, v, (n) => formatKpi(n, "decimal", "BRL"));

export const COLUMNS: Column[] = [
  { key: "platform", label: "Plataforma", render: (r) => PLATFORM_LABELS[r.platform_id] ?? r.platform_id },
  { key: "objective", label: "Objetivo", render: (r) => objectiveLabel(r.objective) ?? dash() },
  { key: "status", label: "Status", render: (r) => <CampaignStatusBadge status={r.status} /> },
  {
    key: "budget", label: "Orçamento", numeric: true, hint: "Orçamento definido na campanha. Vazio quando o orçamento fica no conjunto/grupo.",
    render: (r) => r.budget_micros == null ? dash("Sem orçamento na campanha (pode estar no conjunto/grupo).") : (
      <>{formatMoney(r.budget_micros / 1_000_000, cur(r))}<span className="text-xs text-slate-400">{r.budget_period === "vitalicio" ? " total" : "/dia"}</span></>
    ),
  },
  { key: "spend", label: "Gasto", numeric: true, render: (r) => money(r, r.spend_micros) },
  { key: "impressions", label: "Impressões", numeric: true, render: (r) => int(r, r.impressions) },
  {
    key: "reach", label: "Alcance", numeric: true, hint: "Pessoas únicas. Só aparece quando a plataforma informa o alcance do período exato (não dá para somar dias).",
    render: (r) => r.reach == null ? dash("Alcance do período não informado pela API.") : formatKpi(r.reach, "integer", "BRL"),
  },
  {
    key: "frequency", label: "Frequência", numeric: true, hint: "Impressões ÷ alcance.",
    render: (r) => r.frequency == null ? dash("Depende do alcance do período.") : formatKpi(r.frequency, "decimal", "BRL"),
  },
  { key: "clicks", label: "Cliques", numeric: true, render: (r) => int(r, r.clicks) },
  { key: "ctr", label: "CTR", numeric: true, hint: "Cliques ÷ impressões × 100.", render: (r) => metric(r, r.ctr, (n) => formatKpi(n, "percent", "BRL")) },
  { key: "cpc", label: "CPC", numeric: true, hint: "Gasto ÷ cliques.", render: (r) => money(r, r.cpc_micros) },
  { key: "cpm", label: "CPM", numeric: true, hint: "Gasto ÷ impressões × 1.000.", render: (r) => money(r, r.cpm_micros) },
  { key: "leads", label: "Leads", numeric: true, render: (r) => dec(r, r.leads) },
  { key: "messages", label: "Mensagens", numeric: true, hint: "Conversas iniciadas. O Google Ads não informa.", render: (r) => int(r, r.messages) },
  { key: "conversions", label: "Conversões", numeric: true, render: (r) => dec(r, r.conversions) },
  { key: "cpl", label: "CPL", numeric: true, hint: "Gasto ÷ leads.", render: (r) => money(r, r.cpl_micros) },
  { key: "cpa", label: "CPA", numeric: true, hint: "Gasto ÷ conversões.", render: (r) => money(r, r.cpa_micros) },
  { key: "roas", label: "ROAS", numeric: true, hint: "Valor das conversões ÷ gasto.", render: (r) => metric(r, r.roas, (n) => formatKpi(n, "ratio", "BRL")) },
];
