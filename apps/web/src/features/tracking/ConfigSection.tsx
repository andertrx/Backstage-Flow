import type { ReactNode } from "react";

/**
 * Bloco com divisão clara (título, explicação e linha separadora). Usado nas Configurações do Tracking
 * e nas telas com várias seções: o `id` serve ao índice no topo (links âncora).
 */
export function ConfigSection({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-t` : undefined} className="scroll-mt-24 space-y-4 border-t border-slate-200 pt-6 first:border-t-0 first:pt-0" data-testid={id ? `section-${id}` : undefined}>
      <header>
        <h2 id={id ? `${id}-t` : undefined} className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </header>
      {children}
    </section>
  );
}

/** Índice no topo: leva direto a cada seção da tela. */
export function SectionIndex({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Seções desta tela" className="flex flex-wrap gap-2" data-testid="section-index">
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:text-brand-700 hover:ring-brand-300">
          {i.label}
        </a>
      ))}
    </nav>
  );
}
