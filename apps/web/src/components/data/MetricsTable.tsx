import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import type { Column } from "@/features/campaigns/columns.tsx";
import { PAGE_SIZE, type SortKey, type TableState, toggleSort } from "@/features/campaigns/table.ts";
import { cn } from "@/lib/cn.ts";

interface MetricsTableProps<R> {
  rows: R[];
  total: number;
  table: TableState;
  onTableChange: (next: TableState) => void;
  columns: Column<R>[];
  /** Título da primeira coluna (fixa à esquerda). */
  nameLabel: string;
  renderName: (row: R) => ReactNode;
  rowKey: (row: R) => string;
  caption: string;
  fetching?: boolean;
  testId?: string;
}

function SortIcon({ active, desc }: { active: boolean; desc: boolean }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />;
  return desc ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />;
}

/**
 * Tabela de números (campanhas, conjuntos/grupos, anúncios): cabeçalhos que
 * ordenam no banco, primeira coluna fixa, rolagem lateral dentro da caixa e paginação.
 */
export function MetricsTable<R>({
  rows, total, table, onTableChange, columns, nameLabel, renderName, rowKey, caption, fetching, testId = "metrics-row",
}: MetricsTableProps<R>) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const ariaSort = (key: SortKey) => (table.sort === key ? (table.desc ? "descending" : "ascending") : "none");

  const header = (key: string, label: string, hint?: string, numeric?: boolean, sticky?: boolean) => {
    const sortable = !key.startsWith("info:");
    const cls = cn("whitespace-nowrap px-3 py-2.5 font-medium", numeric && "text-right", sticky && "sticky left-0 z-10 min-w-56 bg-slate-50");
    if (!sortable) return <th key={key} scope="col" className={cls} title={hint}>{label}</th>;
    const k = key as SortKey;
    return (
      <th key={key} scope="col" aria-sort={ariaSort(k)} className={cls}>
        <button
          type="button"
          title={hint}
          onClick={() => onTableChange(toggleSort(table, k))}
          className={cn("inline-flex items-center gap-1 rounded hover:text-slate-900", table.sort === k && "text-slate-900")}
        >
          {label}
          <SortIcon active={table.sort === k} desc={table.desc} />
        </button>
      </th>
    );
  };

  return (
    <Card className={cn("overflow-hidden", fetching && "opacity-70")}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {header("name", nameLabel, undefined, false, true)}
              {columns.map((c) => header(c.key, c.label, c.hint, c.numeric))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={rowKey(r)} data-testid={testId} className="hover:bg-slate-50/60">
                <td className="sticky left-0 z-10 min-w-56 max-w-72 bg-white px-3 py-2.5">{renderName(r)}</td>
                {columns.map((c) => (
                  <td key={c.key} className={cn("whitespace-nowrap px-3 py-2.5 text-slate-700", c.numeric && "text-right tabular-nums")}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5 text-xs text-slate-500">
        <p data-testid={`${testId}-count`}>
          {total === 0 ? "Nenhum item" : `Mostrando ${(table.page - 1) * PAGE_SIZE + 1}–${Math.min(table.page * PAGE_SIZE, total)} de ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="px-3 py-1 text-xs" disabled={table.page <= 1}
            onClick={() => onTableChange({ ...table, page: table.page - 1 })}>Anterior</Button>
          <span>Página {table.page} de {pages}</span>
          <Button variant="secondary" className="px-3 py-1 text-xs" disabled={table.page >= pages}
            onClick={() => onTableChange({ ...table, page: table.page + 1 })}>Próxima</Button>
        </div>
      </div>
    </Card>
  );
}
