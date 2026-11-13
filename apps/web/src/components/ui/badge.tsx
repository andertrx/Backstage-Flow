import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn.ts";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const tones: Record<Tone, { box: string; dot: string | null }> = {
  neutral: { box: "bg-slate-100 text-slate-700", dot: null },
  brand: { box: "bg-brand-50 text-brand-700", dot: null },
  success: { box: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  warning: { box: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  danger: { box: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

/** Etiqueta: as de estado (verde, âmbar, vermelho) levam um pontinho de cor, como o StatusBadge. */
export function Badge({ tone = "neutral", children, ...rest }: { tone?: Tone; children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  const t = tones[tone];
  return (
    <span {...rest} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", t.box)}>
      {t.dot && <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />}
      {children}
    </span>
  );
}
