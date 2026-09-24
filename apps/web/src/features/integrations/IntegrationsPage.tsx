import { GoogleIntegrationCard } from "./GoogleIntegrationCard.tsx";
import { MetaIntegrationCard } from "./MetaIntegrationCard.tsx";

export function IntegrationsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="mt-1 text-sm text-slate-500">Conexões oficiais com as plataformas de anúncio.</p>
      </div>
      <MetaIntegrationCard />
      <GoogleIntegrationCard />
    </div>
  );
}
