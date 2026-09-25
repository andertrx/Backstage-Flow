import { RefreshCw } from "lucide-react";
import { formatRelative } from "@/lib/format.ts";

/** "Lista buscada há 2 min · Atualizar": a lista fica guardada por 5 minutos (cache). */
export function ListFreshness({ updatedAt, fetching, onRefresh }: { updatedAt: number; fetching: boolean; onRefresh: () => void }) {
  if (!updatedAt) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500" data-testid="list-freshness">
      Lista buscada {formatRelative(new Date(updatedAt).toISOString())}.
      <button type="button" onClick={onRefresh} disabled={fetching} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline disabled:opacity-60">
        <RefreshCw className={fetching ? "size-3 animate-spin" : "size-3"} aria-hidden /> Atualizar lista
      </button>
    </p>
  );
}
