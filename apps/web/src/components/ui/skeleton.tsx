import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn.ts";

/** Esqueleto de carregamento (brilho suave; parado para quem usa "reduzir movimento"). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

/**
 * Só mostra depois de um instante (padrão 200 ms): resposta rápida não "pisca" o esqueleto.
 * Até lá ocupa o mesmo espaço vazio, para a tela não pular.
 */
function Atrasado({ ms = 200, label, className, children }: { ms?: number; label: string; className?: string; children: ReactNode }) {
  const [show, setShow] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) return;
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return (
    <div role="status" aria-label={label} aria-busy="true" className={className} data-testid="skeleton">
      <span className="sr-only">{label}</span>
      <div className={cn("transition-opacity duration-200", show ? "opacity-100" : "opacity-0")}>{children}</div>
    </div>
  );
}

const larguras = ["w-3/5", "w-2/5", "w-1/2", "w-3/4", "w-1/3", "w-2/3"];

/** Tabela carregando: cabeçalho + linhas com a mesma grade da tabela real. */
export function TableSkeleton({ rows = 6, cols = 5, label = "Carregando", className }: { rows?: number; cols?: number; label?: string; className?: string }) {
  return (
    <Atrasado label={label} className={cn("overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/60", className)}>
      <div className="grid gap-4 border-b border-slate-100 bg-slate-50/60 px-4 py-3" style={{ gridTemplateColumns: `2fr repeat(${cols - 1}, 1fr)` }}>
        {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-3 w-16" />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0" style={{ gridTemplateColumns: `2fr repeat(${cols - 1}, 1fr)` }}>
          <div className="space-y-1.5">
            <Skeleton className={cn("h-3.5", larguras[r % larguras.length])} />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          {Array.from({ length: cols - 1 }, (_, c) => <Skeleton key={c} className={cn("h-3.5", larguras[(r + c + 2) % larguras.length])} />)}
        </div>
      ))}
    </Atrasado>
  );
}

/** Lista carregando (contatos, conversas, tarefas): linhas com título, linha de apoio e selo. */
export function ListSkeleton({ rows = 5, label = "Carregando", className, card = true }: { rows?: number; label?: string; className?: string; card?: boolean }) {
  return (
    <Atrasado label={label} className={cn(card && "rounded-2xl bg-white p-2 ring-1 ring-slate-200/60", className)}>
      <ul className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, r) => (
          <li key={r} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={cn("h-3.5", larguras[r % larguras.length])} />
              <Skeleton className={cn("h-2.5", larguras[(r + 3) % larguras.length])} />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </li>
        ))}
      </ul>
    </Atrasado>
  );
}

/** Conversa carregando: balões alternando dos dois lados. */
export function ChatSkeleton({ label = "Carregando a conversa" }: { label?: string }) {
  return (
    <Atrasado label={label} className="space-y-3 p-2">
      {[["w-2/3", "mr-auto"], ["w-1/2", "ml-auto"], ["w-3/5", "mr-auto"], ["w-2/5", "ml-auto"]].map(([w, side], i) => (
        <Skeleton key={i} className={cn("h-12 rounded-2xl", w, side)} />
      ))}
    </Atrasado>
  );
}

/** Página abrindo (troca de tela): título, subtítulo e um bloco de conteúdo. Menu e cabeçalho continuam parados. */
export function PageSkeleton({ label = "Abrindo a página" }: { label?: string }) {
  return (
    <Atrasado label={label} ms={150} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </Atrasado>
  );
}
