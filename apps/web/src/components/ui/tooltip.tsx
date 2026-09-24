import { Info } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { cn } from "@/lib/cn.ts";

/**
 * Ícone "i" com explicação. Abre ao passar o mouse, ao focar com o teclado
 * (Tab) ou ao tocar (celular). Esc fecha.
 */
export function InfoTooltip({ label, children, align = "left" }: { label: string; children: ReactNode; align?: "left" | "right" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="rounded-full text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <Info className="size-4" aria-hidden />
      </button>
      <span
        role="tooltip"
        id={id}
        className={cn(
          "absolute top-6 z-20 w-64 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg",
          align === "left" ? "left-0" : "right-0",
          open ? "block" : "hidden",
        )}
      >
        {children}
      </span>
    </span>
  );
}
