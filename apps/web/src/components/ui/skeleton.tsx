import { cn } from "@/lib/cn.ts";

/** Esqueleto de carregamento (brilho suave; parado para quem usa "reduzir movimento"). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}
