import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";

interface Props {
  title: string;
  icon: LucideIcon;
  step: number;
}

/**
 * Contas de anúncio vinculadas ao cliente. A conexão com as plataformas chega
 * nas Etapas 3 (Meta) e 4 (Google); até lá, a lista fica vazia — sem dados inventados.
 */
export function LinkedAccountsCard({ title, icon: Icon, step }: Props) {
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-slate-500" aria-hidden />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-slate-500">Nenhuma conta vinculada.</p>
      <p className="mt-1 text-xs text-slate-400">A conexão com a plataforma será construída na Etapa {step}.</p>
    </Card>
  );
}
