import { AlertTriangle, CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { StatusBadge } from "@/components/ui/status-badge.tsx";
import { cn } from "@/lib/cn.ts";
import type { ReadinessItem, ReadinessState } from "./logic.ts";

const ICON: Record<ReadinessState, { Icon: typeof CheckCircle2; className: string; label: string }> = {
  ok: { Icon: CheckCircle2, className: "text-emerald-600", label: "Certo" },
  warn: { Icon: AlertTriangle, className: "text-amber-600", label: "Atenção" },
  fail: { Icon: XCircle, className: "text-red-600", label: "Falta" },
  na: { Icon: CircleSlash, className: "text-slate-400", label: "Não se aplica" },
};

const SUMMARY = {
  pronto: { tone: "success", text: "Pronto para o cliente" },
  quase: { tone: "warning", text: "Quase pronto" },
  faltam: { tone: "danger", text: "Faltam itens" },
} as const;

export interface SiteReadiness {
  id: string;
  name: string;
  client: string;
  summary: keyof typeof SUMMARY;
  items: ReadinessItem[];
}

/** Lista "pronto para cliente" (T5.5): por site, o que já está certo e o que falta. Só fatos já gravados. */
export function ReadinessSection({ sites }: { sites: SiteReadiness[] }) {
  return (
    <section aria-label="Saúde do tracking" className="space-y-3" data-testid="readiness">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Pronto para cliente?</h2>
        <p className="text-sm text-slate-500">
          Para cada site, o que já está funcionando e o que falta. Depois de ligar um cliente real, é só seguir a lista até tudo ficar certo. “Lead chegando” e “Origem dos anúncios” usam o período escolhido acima.
        </p>
      </div>
      {sites.length === 0 && <Card className="p-6 text-center text-sm text-slate-500">Nenhum site para conferir.</Card>}
      <div className="grid gap-3 lg:grid-cols-2">
        {sites.map((s) => (
          <Card key={s.id} className="space-y-3 p-4" data-testid="readiness-site">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500">{s.client}</p>
              </div>
              <StatusBadge tone={SUMMARY[s.summary].tone} className="shrink-0">{SUMMARY[s.summary].text}</StatusBadge>
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {s.items.map((it) => {
                const { Icon, className, label } = ICON[it.state];
                return (
                  <li key={it.id} className="flex items-start gap-2 py-2" data-testid="readiness-item" data-state={it.state} data-item={it.id}>
                    <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
                    <span className="min-w-0">
                      <span className="font-medium text-slate-800">{it.label}</span>
                      <span className="sr-only"> — {label}</span>
                      <span className="block text-xs text-slate-500">{it.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}
