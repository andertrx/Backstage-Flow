import { Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/field.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type TargetingHit, useTargetingSearch } from "./api.ts";


/** Busca no Meta (interesses ou cidades) e lista do que já foi escolhido. O Meta é a fonte: nada é digitado de memória. */
export function TargetingPicker({ adAccountId, kind, title, hint, picked, max, disabled, onAdd, onRemove, renderPicked }: {
  adAccountId: string | null | undefined; kind: "interest" | "city"; title: string; hint: string; picked: { id: string; label: string }[]; max: number; disabled: boolean;
  onAdd: (hit: TargetingHit) => void; onRemove: (id: string) => void; renderPicked?: (id: string) => React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const search = useTargetingSearch(adAccountId, kind);
  const results = (search.data ?? []).filter((h) => !picked.some((p) => p.id === h.id));
  const run = () => { if (q.trim().length >= 2) search.mutate(q.trim()); };
  return (
    <fieldset className="space-y-2" data-testid={`cb-busca-${kind}`}>
      <legend className="text-sm font-medium text-slate-700">{title}</legend>
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${title} escolhidos`}>
          {picked.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-900 ring-1 ring-blue-200">
              <span>{p.label}</span>
              {renderPicked?.(p.id)}
              <button type="button" disabled={disabled} onClick={() => onRemove(p.id)} aria-label={`Remover ${p.label}`} className="rounded-full p-0.5 hover:bg-blue-100">
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length < max && (
        <div className="flex gap-2">
          <Input value={q} disabled={disabled || !adAccountId} maxLength={80} placeholder={hint} aria-label={`Buscar ${title.toLowerCase()}`}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run(); } }} />
          <Button variant="secondary" disabled={disabled || !adAccountId || q.trim().length < 2 || search.isPending} onClick={run}>
            <Search className="size-4" aria-hidden /> {search.isPending ? "Buscando..." : "Buscar"}
          </Button>
        </div>
      )}
      {search.isError && <p className="text-xs text-red-600" role="alert">{errorMessage(search.error)}</p>}
      {search.isSuccess && results.length === 0 && <p className="text-xs text-slate-500">O Meta não achou nada novo para essa busca.</p>}
      {results.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-2" data-testid={`cb-resultados-${kind}`}>
          {results.map((h) => (
            <li key={h.id}>
              <button type="button" disabled={disabled} onClick={() => onAdd(h)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-white">
                <span className="min-w-0 flex-1 truncate">{h.label}</span>
                {h.detail && <span className="text-xs text-slate-400">{h.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
