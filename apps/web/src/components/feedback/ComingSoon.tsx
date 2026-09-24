import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";

/** Página reservada para uma etapa futura. */
export function ComingSoon({ title, step }: { title: string; step: number }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Construction className="size-10 text-slate-400" aria-hidden />
        <p className="font-medium text-slate-700">Em construção</p>
        <p className="max-w-sm text-sm text-slate-500">Esta área será desenvolvida na Etapa {step}.</p>
      </Card>
    </div>
  );
}
