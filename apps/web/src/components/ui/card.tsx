import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn.ts";

/** Superfície padrão: branca, borda discreta e sombra suave. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl bg-white shadow-card ring-1 ring-slate-200/80", className)} {...props} />;
}
