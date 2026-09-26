import { PLATFORMS } from "@backstage/shared";
import type { ComponentType } from "react";
import { GoogleIntegrationCard } from "./GoogleIntegrationCard.tsx";
import { MetaIntegrationCard } from "./MetaIntegrationCard.tsx";

/**
 * Cartão de conexão de cada plataforma (cada uma tem o seu jeito de conectar).
 * Plataforma nova = um cartão novo registrado aqui.
 */
const INTEGRATION_CARDS: Record<string, ComponentType> = {
  meta: MetaIntegrationCard,
  google: GoogleIntegrationCard,
};

export function IntegrationsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="mt-1 text-sm text-slate-500">Conexões oficiais com as plataformas de anúncio.</p>
      </div>
      {PLATFORMS.map((p) => {
        const Card = INTEGRATION_CARDS[p.id];
        return Card ? <Card key={p.id} /> : null;
      })}
    </div>
  );
}
