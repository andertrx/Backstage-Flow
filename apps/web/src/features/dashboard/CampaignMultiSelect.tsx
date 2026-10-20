import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn.ts";
import { MAX_CAMPAIGN_IDS } from "./filters.ts";

interface Option { id: string; name: string }

/**
 * Escolher várias campanhas (Relatórios): lista com busca e caixas de marcar.
 * Nada marcado = todas as campanhas.
 */
export function CampaignMultiSelect({ id, options, value, disabled, placeholder, onChange }: {
  id: string;
  options: Option[];
  value: string[];
  disabled?: boolean;
  placeholder: string;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const chosen = useMemo(() => new Set(value), [value]);
  const shown = useMemo(() => {
    const t = term.trim().toLocaleLowerCase("pt-BR");
    return t ? options.filter((o) => o.name.toLocaleLowerCase("pt-BR").includes(t)) : options;
  }, [options, term]);
  const label = disabled || value.length === 0 ? placeholder
    : value.length === 1 ? options.find((o) => o.id === value[0])?.name ?? "1 campanha"
    : `${value.length} campanhas`;
  const toggle = (oid: string) => onChange(chosen.has(oid) ? value.filter((v) => v !== oid) : value.length >= MAX_CAMPAIGN_IDS ? value : [...value, oid]);

  return (
    <div ref={box} className="relative">
      <button id={id} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        data-testid="campaign-multi"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-slate-500 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-64 rounded-lg bg-white p-2 shadow-lg ring-1 ring-slate-200" data-testid="campaign-multi-panel">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar campanha" aria-label="Buscar campanha"
              className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-2 text-sm" />
          </div>
          <div className="mb-1 flex items-center justify-between px-1 text-xs text-slate-500">
            <span>{value.length ? `${value.length} marcada(s)` : "Nenhuma marcada = todas"}</span>
            <span className="flex gap-3">
              {shown.length > 0 && <button type="button" className="font-medium text-blue-700 hover:underline"
                onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.id)])].slice(0, MAX_CAMPAIGN_IDS))}>Marcar as {term ? "encontradas" : "todas"}</button>}
              {value.length > 0 && <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => onChange([])}>Limpar</button>}
            </span>
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label="Campanhas" className="max-h-64 overflow-y-auto">
            {shown.length === 0 && <li className="px-2 py-2 text-sm text-slate-500">Nenhuma campanha encontrada.</li>}
            {shown.map((o) => (
              <li key={o.id} role="option" aria-selected={chosen.has(o.id)}>
                <button type="button" onClick={() => toggle(o.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded border", chosen.has(o.id) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300")}>
                    {chosen.has(o.id) && <Check className="size-3" aria-hidden />}
                  </span>
                  <span className="truncate">{o.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
