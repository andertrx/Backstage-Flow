import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn.ts";

/**
 * Estado vazio padrão: ícone num círculo suave, título claro, explicação curta e (opcional) a ação que resolve.
 * Só apresentação: quem usa decide o texto e o botão.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-14 text-center", className)} data-testid="empty-state">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon className="size-7" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-base font-semibold tracking-tight text-slate-900">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
