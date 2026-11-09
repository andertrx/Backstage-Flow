import { type KpiDefinition, kpiVariation } from "@backstage/shared";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Card } from "@/components/ui/card.tsx";
import { InfoTooltip } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/cn.ts";
import type { BalanceTotals } from "@/features/balance/summary.ts";
import { formatChange, formatKpi } from "@/lib/format.ts";

/** O que o card precisa saber do indicador (serve também para a visão executiva). */
type CardDefinition = Pick<KpiDefinition, "label" | "description" | "format" | "direction">;

interface KpiCardProps {
  definition: CardDefinition;
  value: number | null;
  previous: number | null;
  currency: string;
  /** Texto exibido quando não há valor (motivo). */
  missing: string;
  loading?: boolean;
  /** 52.3: ícone do indicador, cartão de destaque (escuro) e posição na entrada em sequência. Só aparência. */
  icon?: LucideIcon;
  hero?: boolean;
  index?: number;
  className?: string;
}

const toneClass = { good: "text-emerald-700 bg-emerald-50", bad: "text-red-700 bg-red-50", neutral: "text-slate-600 bg-slate-100" };
const toneClassDark = { good: "text-emerald-300 bg-emerald-400/15", bad: "text-red-300 bg-red-400/15", neutral: "text-slate-300 bg-white/10" };
const toneWord = { good: "melhora", bad: "piora", neutral: "variação" };

/** Fundo do cartão de destaque (estilo Vertix, em azul): degradê vivo com um brilho claro no canto (sem filtro de desfoque: leve). */
const HERO_STYLE: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 100% 0%, rgb(255 255 255 / 0.28), transparent 50%), linear-gradient(145deg, #3b82f6, #1d4ed8 70%, #1e3a8a)",
};

function Shell({ label, hero, index, className, children }: { label: string; hero?: boolean; index?: number; className?: string; children: ReactNode }) {
  return (
    <Card
      role="group"
      aria-label={label}
      style={hero ? { ...HERO_STYLE, ...(index != null ? ({ "--i": index } as CSSProperties) : {}) } : index != null ? ({ "--i": index } as CSSProperties) : undefined}
      className={cn(
        "flex flex-col gap-2.5 p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-elevated",
        index != null && "rise",
        hero && "text-white ring-brand-700/30 shadow-brand",
        className,
      )}
    >
      {children}
    </Card>
  );
}

function Head({ label, icon: Icon, hero, tip }: { label: string; icon?: LucideIcon; hero?: boolean; tip: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", hero ? "bg-white/20 text-white" : "bg-brand-50 text-brand-600")}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <h3 className={cn("truncate text-sm font-medium", hero ? "text-blue-100" : "text-slate-500")}>{label}</h3>
      </div>
      <InfoTooltip label={`O que é ${label}?`} align="right">{tip}</InfoTooltip>
    </div>
  );
}

const valueClass = (hero?: boolean) => cn("num text-[1.75rem] font-semibold leading-tight tracking-tight", hero ? "text-white" : "text-slate-900");

export function KpiCard({ definition, value, previous, currency, missing, loading, icon, hero, index, className }: KpiCardProps) {
  const variation = kpiVariation(value, previous, definition.direction);
  const Arrow = variation.trend === "up" ? ArrowUpRight : variation.trend === "down" ? ArrowDownRight : Minus;
  const tones = hero ? toneClassDark : toneClass;
  return (
    <Shell label={definition.label} hero={hero} index={index} className={className}>
      <Head label={definition.label} icon={icon} hero={hero} tip={definition.description} />
      {loading ? (
        <div className={cn("skeleton h-9 w-32", hero && "opacity-30")} aria-label="Carregando" />
      ) : value == null ? (
        <p className={cn("text-sm", hero ? "text-slate-300" : "text-slate-500")} data-testid="kpi-missing">{missing}</p>
      ) : (
        <p className={valueClass(hero)} data-testid="kpi-value">
          {formatKpi(value, definition.format, currency)}
        </p>
      )}
      {!loading && value != null && (
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
          {variation.percent == null ? (
            <span className={hero ? "text-slate-400" : "text-slate-400"}>Sem base de comparação</span>
          ) : (
            <span
              className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold", tones[variation.tone])}
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
    </Shell>
  );
}

/** Card de Saldo: soma o disponível das contas que a API informa (mesma moeda). */
/** Card de Saldo: soma o disponível das contas que a API informa (mesma moeda). */
export function BalanceCard({ totals, loading, icon, index }: { totals: BalanceTotals; loading?: boolean; icon?: LucideIcon; index?: number }) {
  const { currency, availableMicros, reporting, total, alerts, critical } = totals;
  return (
    <Shell label="Saldo" index={index}>
      <Head label="Saldo" icon={icon} tip={
        <>
          Soma do dinheiro disponível nas contas: saldo pré-pago (PIX/boleto) informado pela plataforma e orçamento do Google.
          Conta paga no cartão entra com R$ 0,00: o limite do cartão ou de gastos não é saldo. Contas sem essa informação não
          entram na soma (não inventamos valores). Detalhes de cada conta em "Saldo por conta", abaixo.
        </>
      } />
      {loading ? (
        <div className="skeleton h-9 w-32" aria-label="Carregando" />
      ) : total === 0 ? (
        <p className="text-sm text-slate-500" data-testid="kpi-missing">Nenhuma conta vinculada.</p>
      ) : availableMicros == null ? (
        <p className="text-sm text-slate-500" data-testid="kpi-missing">Informação não disponível pela API.</p>
      ) : (
        <p className={valueClass()} data-testid="kpi-value">
          {formatKpi(availableMicros / 1_000_000, "money", currency ?? "BRL")}
        </p>
      )}
      {!loading && total > 0 && (
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">
            {reporting} de {total} {total === 1 ? "conta informa" : "contas informam"}
          </span>
          {alerts > 0 && (
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", critical ? toneClass.bad : "bg-amber-50 text-amber-800")}>
              {alerts} {alerts === 1 ? "conta com alerta" : "contas com alerta"}
            </span>
          )}
        </div>
      )}
    </Shell>
  );
}
