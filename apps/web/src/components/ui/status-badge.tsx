import type { ReactNode } from "react";
import { cn } from "@/lib/cn.ts";

/** Significado fixo das cores em todo o sistema. */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const tones: Record<StatusTone, { box: string; dot: string }> = {
  success: { box: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", dot: "bg-emerald-500" },
  warning: { box: "bg-amber-50 text-amber-800 ring-amber-600/20", dot: "bg-amber-500" },
  danger: { box: "bg-red-50 text-red-700 ring-red-600/15", dot: "bg-red-500" },
  info: { box: "bg-sky-50 text-sky-700 ring-sky-600/15", dot: "bg-sky-500" },
  neutral: { box: "bg-slate-100 text-slate-600 ring-slate-500/15", dot: "bg-slate-400" },
};

/** Estados mais comuns, já com o tom certo (Ativo, Pausado, Pendente, Concluído, Em andamento, Atenção, Erro). */
export const STATUS_TONES = {
  ativo: "success",
  concluido: "success",
  pausado: "neutral",
  encerrado: "neutral",
  pendente: "warning",
  atencao: "warning",
  em_andamento: "info",
  erro: "danger",
  atrasado: "danger",
} as const satisfies Record<string, StatusTone>;

/** Selo de status único: pontinho de cor + texto. */
export function StatusBadge({ tone = "neutral", children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  const t = tones[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", t.box, className)}>
      <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />
      {children}
    </span>
  );
}
