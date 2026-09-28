import { OPS_SEARCH_KIND_LABELS, type OpsSearchKind } from "@backstage/shared";
import { Building2, CalendarDays, ClipboardList, Handshake, Loader2, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { useDebouncedValue } from "@/lib/useDebouncedValue.ts";
import { useOpsSearch } from "./dashboardApi.ts";

const ICONS: Record<OpsSearchKind, typeof Search> = { tarefa: ClipboardList, reuniao: CalendarDays, cliente: Building2, lead: Handshake };

/**
 * Busca da Central (36.7): tarefas, reuniões, clientes no fluxo e leads que
 * a pessoa pode ver (o banco confere). Separada da busca global de anúncios.
 */
export function OpsSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = useDebouncedValue(text.trim(), 250);
  const search = useOpsSearch(query);
  const tooShort = text.trim().length < 2;
  const rows = tooShort ? [] : (search.data ?? []);
  const waiting = !tooShort && (query !== text.trim() || search.isFetching);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (link: string) => {
    setOpen(false);
    setText("");
    navigate(link);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!rows.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % rows.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + rows.length) % rows.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(rows[Math.min(active, rows.length - 1)].link); }
  };

  return (
    <div ref={boxRef} className="relative w-full sm:w-80" data-testid="ops-search">
      {waiting ? <Loader2 className="pointer-events-none absolute left-3 top-2.5 size-4 animate-spin text-slate-400" aria-hidden />
        : <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />}
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Buscar na Central: tarefa, reunião, cliente…"
        className="h-9 w-full rounded-lg bg-white pl-9 pr-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        role="combobox"
        aria-label="Buscar na Central"
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && rows.length ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
      />
      {open && !tooShort && (
        <div id={listId} role="listbox" aria-label="Resultados da busca da Central"
          className="absolute right-0 z-40 mt-1 max-h-96 w-full overflow-y-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200 sm:w-[26rem]">
          {search.error ? (
            <p className="px-4 py-3 text-sm text-red-600" role="alert">{errorMessage(search.error)}</p>
          ) : !waiting && rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500" data-testid="ops-search-empty">Nada encontrado para “{text.trim()}”.</p>
          ) : (
            rows.map((r, i) => {
              const Icon = ICONS[r.kind];
              return (
                <div key={`${r.kind}:${r.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active} data-testid="ops-search-result" data-kind={r.kind}
                  onMouseMove={() => i !== active && setActive(i)} onClick={() => go(r.link)}
                  className={cn("mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2", i === active ? "bg-blue-50" : "hover:bg-slate-50")}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Icon className="size-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{r.title}</span>
                    {r.detail && <span className="block truncate text-xs text-slate-500">{r.detail}</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{OPS_SEARCH_KIND_LABELS[r.kind]}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
