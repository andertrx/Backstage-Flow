import { Search } from "lucide-react";
import { Card } from "@/components/ui/card.tsx";
import { MetaIntegrationCard } from "./MetaIntegrationCard.tsx";

export function IntegrationsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="mt-1 text-sm text-slate-500">Conexões oficiais com as plataformas de anúncio.</p>
      </div>
      <MetaIntegrationCard />
      <Card className="flex items-start gap-3 p-6">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-500">
          <Search className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold">Google Ads</h2>
          <p className="text-sm text-slate-500">A conexão com o Google Ads será construída na Etapa 4.</p>
        </div>
      </Card>
    </div>
  );
}
