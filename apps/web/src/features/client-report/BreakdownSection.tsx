import {
  BREAKDOWN_METRIC_LABELS, BREAKDOWN_TITLES, type BreakdownDimension, type BreakdownItem, type BreakdownMetric, type BreakdownRow, breakdownItems,
  coverageGap, defaultBreakdownMetric, type MainResult,
} from "@backstage/shared";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card.tsx";
import { cn } from "@/lib/cn.ts";
import { formatDate, formatKpi } from "@/lib/format.ts";
import type { BreakdownCoverage } from "./api.ts";

/** Uma cor só (as fatias são a mesma medida): azul validado do sistema. */
const BAR = "#2a78d6";
const PANELS: BreakdownDimension[] = ["age", "gender", "publisher_platform", "device", "region", "city"];

function valueText(v: number | null, metric: BreakdownMetric, currency: string) {
  if (v == null) return "—";
  return metric === "spend" ? formatKpi(v, "money", currency) : formatKpi(v, metric === "result" ? "decimal" : "integer", currency);
}

function detail(i: BreakdownItem, currency: string, resultLabel: string) {
  const parts = [`Investimento ${formatKpi(i.spend, "money", currency)}`];
  if (i.result != null) parts.push(`${resultLabel} ${formatKpi(i.result, "decimal", currency)}`);
  if (i.costPerResult != null) parts.push(`Custo por resultado ${formatKpi(i.costPerResult, "money", currency)}`);
  if (i.ctr != null) parts.push(`CTR ${formatKpi(i.ctr, "percent", currency)}`);
  return parts.join(" · ");
}

/** Barras horizontais: rótulo, barra, valor e fatia. O detalhe completo aparece ao passar o mouse (e fica no texto para leitores de tela). */
function BarList({ items, metric, currency, resultLabel }: { items: BreakdownItem[]; metric: BreakdownMetric; currency: string; resultLabel: string }) {
  const max = Math.max(0, ...items.map((i) => i.amount ?? 0));
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.value} className="group grid grid-cols-[minmax(6rem,9rem)_1fr_8rem] items-center gap-2 text-sm" title={detail(i, currency, resultLabel)} data-testid="breakdown-item">
          <span className="truncate text-slate-700">{i.label}</span>
          <span className="h-3 rounded-sm bg-slate-100" aria-hidden>
            <span className="block h-3 rounded-sm transition-opacity group-hover:opacity-80" style={{ width: `${max > 0 ? Math.max(1, ((i.amount ?? 0) / max) * 100) : 0}%`, background: BAR }} />
          </span>
          <span className="whitespace-nowrap text-right tabular-nums text-slate-900">
            {valueText(i.amount, metric, currency)}
            {i.share != null && <> <span className="text-xs text-slate-500">{i.share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span></>}
          </span>
          <span className="sr-only">{detail(i, currency, resultLabel)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Colunas por hora (0h a 23h), valor exato ao passar o mouse ou focar. */
function HourChart({ items, metric, currency, resultLabel }: { items: BreakdownItem[]; metric: BreakdownMetric; currency: string; resultLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...items.map((i) => i.amount ?? 0));
  const shown = active != null ? items[active] : null;
  return (
    <div>
      <p className="mb-2 h-5 text-xs text-slate-600" aria-live="polite">
        {shown ? <><span className="font-medium text-slate-900">{shown.label}: {valueText(shown.amount, metric, currency)}</span> · {detail(shown, currency, resultLabel)}</> : "Passe o mouse sobre uma hora para ver os números."}
      </p>
      <div className="flex h-32 items-end gap-0.5 border-b border-slate-200" role="list" aria-label="Horário do dia">
        {items.map((i, idx) => (
          <button
            key={i.value}
            type="button"
            role="listitem"
            className="flex h-full flex-1 items-end focus-visible:outline-2"
            aria-label={`${i.label}: ${valueText(i.amount, metric, currency)}`}
            onMouseEnter={() => setActive(idx)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(idx)}
            onBlur={() => setActive(null)}
            data-testid="breakdown-hour"
          >
            <span className={cn("block w-full rounded-t-sm", active === idx && "opacity-80")}
              style={{ height: `${max > 0 ? ((i.amount ?? 0) / max) * 100 : 0}%`, minHeight: (i.amount ?? 0) > 0 ? 2 : 0, background: BAR }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex text-[10px] text-slate-500">
        {items.map((i, idx) => <span key={i.value} className="flex-1 text-center">{idx % 3 === 0 ? i.label : ""}</span>)}
      </div>
    </div>
  );
}

/**
 * "Quem viu e onde" (Etapa 19.3): idade, gênero, plataforma, aparelho, horário
 * e localização da conta no período. Uma métrica por vez (resultado,
 * investimento, impressões ou cliques), sempre com a fatia do total.
 */
export function BreakdownSection({ rows, coverage, range, main, currency }: {
  rows: BreakdownRow[];
  coverage: BreakdownCoverage | null;
  range: { from: string; to: string };
  main: MainResult;
  currency: string;
}) {
  const [picked, setPicked] = useState<BreakdownMetric | null>(null);
  const metric = picked ?? defaultBreakdownMetric(rows, main);
  const gap = coverageGap(range, coverage);
  const panels = useMemo(() => PANELS
    .map((d) => ({ d, items: breakdownItems(rows, d, metric, main) }))
    .filter((p) => p.items.length > 0), [rows, metric, main]);
  const hours = useMemo(() => breakdownItems(rows, "hour", metric, main), [rows, metric, main]);
  const hasHours = rows.some((r) => r.dimension === "hour");
  const metrics: BreakdownMetric[] = ["result", "spend", "impressions", "clicks"];

  if (gap.kind === "none" || !rows.length) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quem viu e onde</h3>
        <p className="text-sm text-slate-500" data-testid="breakdown-empty">
          {gap.kind === "none"
            ? "Ainda não temos as divisões (idade, gênero, horário…) deste período. Elas começam a ser guardadas na próxima atualização da conta."
            : "Sem entrega com divisão neste período."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="report-breakdowns">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quem viu e onde</h3>
        <div role="group" aria-label="Métrica das divisões" className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs print:hidden">
          {metrics.map((m) => (
            <button key={m} type="button" aria-pressed={metric === m} onClick={() => setPicked(m)}
              className={cn("rounded-md px-2.5 py-1 font-medium", metric === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
              {m === "result" ? main.label : BREAKDOWN_METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      {gap.kind === "partial" && (
        <p className="text-xs text-amber-800" data-testid="breakdown-partial">
          As divisões começaram a ser guardadas em {formatDate(gap.from)}: os dias antes disso não entram nestas somas.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
        {panels.map((p) => (
          <Card key={p.d} className="print-avoid-break space-y-3 p-4" data-testid={`breakdown-${p.d}`}>
            <p className="text-sm font-medium text-slate-700">{BREAKDOWN_TITLES[p.d]}</p>
            <BarList items={p.items} metric={metric} currency={currency} resultLabel={main.label} />
          </Card>
        ))}
        {hasHours && (
          <Card className="print-avoid-break space-y-2 p-4 md:col-span-2 print:col-span-2" data-testid="breakdown-hour-panel">
            <p className="text-sm font-medium text-slate-700">{BREAKDOWN_TITLES.hour} <span className="font-normal text-slate-500">(fuso da conta)</span></p>
            <HourChart items={hours} metric={metric} currency={currency} resultLabel={main.label} />
          </Card>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {rows.some((r) => r.dimension === "city")
          ? "Aqui idade e gênero só existem para campanhas de Pesquisa, Display e Vídeo (Performance Max não informa), e a cidade é onde a pessoa estava. Por isso as somas podem ser menores que o total da conta."
          : "A localização vem por estado (a plataforma não informa cidade para anúncios)."}{" "}
        "Não informado" = a plataforma não identificou.
      </p>
    </div>
  );
}
