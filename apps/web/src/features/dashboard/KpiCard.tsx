import { type KpiDefinition, kpiVariation } from "@backstage/shared";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { InfoTooltip } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/cn.ts";
import type { BalanceTotals } from "@/features/balance/summary.ts";
import { formatChange, formatKpi } from "@/lib/format.ts";

interface KpiCardProps {
  definition: KpiDefinition;
  value: number | null;
  previous: number | null;
  currency: string;
  /** Texto exibido quando não há valor (motivo). */
  missing: string;
  loading?: boolean;
}

const toneClass = { good: "text-emerald-700 bg-emerald-50", bad: "text-red-700 bg-red-50", neutral: "text-slate-600 bg-slate-100" };
const toneWord = { good: "melhora", bad: "piora", neutral: "variação" };

export function KpiCard({ definition, value, previous, currency, missing, loading }: KpiCardProps) {
  const variation = kpiVariation(value, previous, definition.direction);
  const Arrow = variation.trend === "up" ? ArrowUpRight : variation.trend === "down" ? ArrowDownRight : Minus;
  return (
    <Card className="flex flex-col gap-2 p-4" role="group" aria-label={definition.label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-500">{definition.label}</h3>
        <InfoTooltip label={`O que é ${definition.label}?`} align="right">
          {definition.description}
        </InfoTooltip>
      </div>
      {loading ? (
        <div className="h-8 w-28 animate-pulse rounded bg-slate-100" aria-label="Carregando" />
      ) : value == null ? (
        <p className="text-sm text-slate-500" data-testid="kpi-missing">{missing}</p>
      ) : (
        <p className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="kpi-value">
          {formatKpi(value, definition.format, currency)}
        </p>
      )}
      {!loading && value != null && (
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
          {variation.percent == null ? (
            <span className="text-slate-400">Sem base de comparação</span>
          ) : (
            <span
              className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium", toneClass[variation.tone])}
              data-tone={variation.tone}
            >
              <Arrow className="size-3.5" aria-hidden />
              <span className="sr-only">{toneWord[variation.tone]} de </span>
              {formatChange(variation.percent)}
            </span>
          )}
          {previous != null && (
            <span className="text-slate-400">antes: {formatKpi(previous, definition.format, currency)}</span>
          )}
        </div>
      )}
    </Card>
  );
}

/** Card de Saldo: soma o disponível das contas que a API informa (mesma moeda). */
export function BalanceCard({ totals, loading }: { totals: BalanceTotals; loading?: boolean }) {
  const { currency, availableMicros, reporting, total, alerts, critical } = totals;
  return (
    <Card className="flex flex-col gap-2 p-4" role="group" aria-label="Saldo">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-500">Saldo</h3>
        <InfoTooltip label="O que é Saldo?" align="right">
          Soma do valor disponível das contas em que a plataforma informa o limite e o quanto já foi usado. Contas sem
          essa informação não entram na soma (não inventamos valores). Detalhes de cada conta em "Saldo por conta", abaixo.
        </InfoTooltip>
      </div>
      {loading ? (
        <div className="h-8 w-28 animate-pulse rounded bg-slate-100" aria-label="Carregando" />
      ) : total === 0 ? (
        <p className="text-sm text-slate-500" data-testid="kpi-missing">Nenhuma conta vinculada.</p>
      ) : availableMicros == null ? (
        <p className="text-sm text-slate-500" data-testid="kpi-missing">Informação não disponível pela API.</p>
      ) : (
        <p className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="kpi-value">
          {formatKpi(availableMicros / 1_000_000, "money", currency ?? "BRL")}
        </p>
      )}
      {!loading && total > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">
            {reporting} de {total} {total === 1 ? "conta informa" : "contas informam"}
          </span>
          {alerts > 0 && (
            <span className={cn("rounded-md px-1.5 py-0.5 font-medium", critical ? toneClass.bad : "bg-amber-50 text-amber-800")}>
              {alerts} {alerts === 1 ? "conta com alerta" : "contas com alerta"}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
