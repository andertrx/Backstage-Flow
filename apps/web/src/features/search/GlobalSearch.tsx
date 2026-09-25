import { Building2, CornerDownLeft, Image, Layers, Loader2, Search, Target, Wallet, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { cn } from "@/lib/cn.ts";
import { useDebouncedValue } from "@/lib/useDebouncedValue.ts";
import { useGlobalSearch } from "./api.ts";
import { clientShortcuts, groupResults, MIN_QUERY, resultDetail, resultHref, resultStatus, type SearchKind } from "./logic.ts";

const ICONS: Record<SearchKind, typeof Search> = { cliente: Building2, conta: Wallet, campanha: Target, conjunto: Layers, anuncio: Image };
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Botão de busca no topo + janela de busca (abre com Ctrl+K ou "/"). */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 min-w-0 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-200/70 sm:w-72"
        aria-label="Busca global" title="Buscar clientes, contas, campanhas e anúncios (Ctrl+K)"
        aria-keyshortcuts="Control+K"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden truncate sm:inline">Buscar…</span>
        <kbd className="ml-auto hidden rounded border border-slate-300 bg-white px-1.5 font-sans text-[11px] text-slate-500 sm:inline">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

interface Option {
  key: string;
  href: string;
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const query = useDebouncedValue(text.trim(), 250);
  const search = useGlobalSearch(query, true);
  const tooShort = text.trim().length < MIN_QUERY;
  const rows = tooShort ? [] : (search.data ?? []);
  const groups = useMemo(() => groupResults(rows), [rows]);
  const waiting = !tooShort && (query !== text.trim() || search.isFetching);

  // Lista plana de opções (para as setas do teclado): resultados + atalhos dos clientes.
  const options = useMemo(() => {
    const list: Option[] = [];
    for (const g of groups) {
      for (const r of g.rows) {
        list.push({ key: `${r.kind}:${r.id}`, href: resultHref(r) });
        if (r.kind === "cliente") for (const l of clientShortcuts(r.id, profile?.role)) list.push({ key: `${r.id}:${l.label}`, href: l.href });
      }
    }
    return list;
  }, [groups, profile?.role]);
  const indexOf = (key: string) => options.findIndex((o) => o.key === key);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);
  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const go = (href: string) => {
    onClose();
    navigate(href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return onClose();
    if (!options.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(options[Math.min(active, options.length - 1)].href);
    }
  };

  const optionProps = (key: string, href: string) => {
    const i = indexOf(key);
    return {
      id: `${listId}-${i}`,
      role: "option" as const,
      "aria-selected": i === active,
      onMouseMove: () => i !== active && setActive(i),
      onClick: () => go(href),
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-3 pt-[8vh] backdrop-blur-sm sm:p-4 sm:pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          {waiting ? <Loader2 className="size-5 shrink-0 animate-spin text-slate-400" aria-hidden /> : <Search className="size-5 shrink-0 text-slate-400" aria-hidden />}
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Cliente, conta, campanha, anúncio ou ID…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 focus-visible:outline-none"
            role="combobox"
            aria-label="O que você procura?"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-activedescendant={options.length ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
          />
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar busca">
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" id={listId} role="listbox" aria-label="Resultados da busca">
          {tooShort ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Digite pelo menos {MIN_QUERY} letras. Vale nome ou pedaço do nome, sem se preocupar com acentos, e também o ID da plataforma.
            </p>
          ) : search.error ? (
            <p className="px-4 py-8 text-center text-sm text-red-600" role="alert">{search.error.message}</p>
          ) : !waiting && groups.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500" data-testid="search-empty">
              Nada encontrado para “{text.trim()}”.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.kind} role="group" aria-label={g.label} data-testid="search-group" data-kind={g.kind} className="py-2">
                <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400" aria-hidden>{g.label}</p>
                {g.rows.map((r) => {
                  const Icon = ICONS[r.kind];
                  const key = `${r.kind}:${r.id}`;
                  const status = resultStatus(r);
                  const detail = resultDetail(r);
                  return (
                    <div key={key}>
                      <div
                        {...optionProps(key, resultHref(r))}
                        data-testid="search-result"
                        className={cn(
                          "mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2",
                          indexOf(key) === active ? "bg-brand-50" : "hover:bg-slate-50",
                        )}
                      >
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", indexOf(key) === active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500")}>
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{r.name}</span>
                          {detail && <span className="block truncate text-xs text-slate-500">{detail}</span>}
                        </span>
                        {status && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{status}</span>}
                        {indexOf(key) === active && <CornerDownLeft className="size-4 shrink-0 text-brand-600" aria-hidden />}
                      </div>
                      {r.kind === "cliente" && (
                        <div className="ml-14 mr-4 flex flex-wrap gap-1.5 pb-1 pt-0.5" data-testid="search-shortcuts">
                          {clientShortcuts(r.id, profile?.role).map((l) => {
                            const k = `${r.id}:${l.label}`;
                            return (
                              <span
                                key={k}
                                {...optionProps(k, l.href)}
                                className={cn(
                                  "cursor-pointer rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                                  indexOf(k) === active ? "bg-brand-600 text-white ring-brand-600" : "text-slate-600 ring-slate-200 hover:bg-slate-50",
                                )}
                              >
                                {l.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:flex">
          <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> escolher</span>
          <span><kbd className="font-sans">Enter</kbd> abrir</span>
          <span><kbd className="font-sans">Esc</kbd> fechar</span>
          <span className="ml-auto">Mostra até 5 de cada tipo</span>
        </div>
      </div>
    </div>
  );
}
