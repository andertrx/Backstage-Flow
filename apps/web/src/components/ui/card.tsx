import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn.ts";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl bg-white shadow-sm ring-1 ring-slate-200", className)} {...props} />;
}
