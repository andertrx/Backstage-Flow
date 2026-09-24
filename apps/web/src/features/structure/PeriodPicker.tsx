import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { type DashboardFilters, PERIOD_OPTIONS, type PeriodChoice, type ResolvedPeriod } from "@/features/dashboard/filters.ts";
import { formatDate } from "@/lib/format.ts";

const range = (r: { from: string; to: string }) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} a ${formatDate(r.to)}`);

/** Só o período (as páginas de detalhe já são de um item específico). */
export function PeriodPicker({ filters, period, onChange }: {
  filters: DashboardFilters;
  period: ResolvedPeriod;
  onChange: (patch: Partial<DashboardFilters>) => void;
}) {
  return (
    <Card className="flex flex-wrap items-end gap-3 p-4">
      <div className="w-full sm:w-56">
        <Field label="Período">
          {(id) => (
            <Select id={id} value={filters.period} onChange={(e) => {
              const value = e.target.value as PeriodChoice;
              onChange(value === "custom" ? { period: value, from: period.current.from, to: period.current.to } : { period: value });
            }}>
              {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
      </div>
      {filters.period === "custom" && (
        <>
          <div className="w-full sm:w-44">
            <Field label="De">{(id) => <Input id={id} type="date" value={filters.from ?? ""} max={filters.to ?? undefined} onChange={(e) => e.target.value && onChange({ from: e.target.value })} />}</Field>
          </div>
          <div className="w-full sm:w-44">
            <Field label="Até">{(id) => <Input id={id} type="date" value={filters.to ?? ""} min={filters.from ?? undefined} onChange={(e) => e.target.value && onChange({ to: e.target.value })} />}</Field>
          </div>
        </>
      )}
      <p className="pb-2 text-xs text-slate-500" data-testid="period-text">
        <strong className="font-medium text-slate-700">{range(period.current)}</strong> · comparado com {range(period.previous)}
      </p>
    </Card>
  );
}
