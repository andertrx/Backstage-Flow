import { PLATFORMS } from "@backstage/shared";
import type { ComponentType, ReactNode } from "react";
import { ConfigSection, SectionIndex } from "@/components/ui/section.tsx";
import { EmailSettingsCard } from "./EmailSettingsCard.tsx";
import { GoogleIntegrationCard } from "./GoogleIntegrationCard.tsx";
import { GoogleSheetsCard } from "./GoogleSheetsCard.tsx";
import { MetaIntegrationCard } from "./MetaIntegrationCard.tsx";
import { WaAvisosCard } from "./WaAvisosCard.tsx";
import { WaGatewayCard } from "./WaGatewayCard.tsx";
import { WhatsAppAppCard } from "./WhatsAppAppCard.tsx";

/**
 * Cartão de conexão de cada plataforma (cada uma tem o seu jeito de conectar).
 * Plataforma nova = um cartão novo registrado aqui.
 */
const INTEGRATION_CARDS: Record<string, ComponentType> = {
  meta: MetaIntegrationCard,
  google: GoogleIntegrationCard,
};

const SECOES = [
  { id: "anuncios", titulo: "Anúncios" },
  { id: "comunicacao", titulo: "Comunicação" },
  { id: "dados", titulo: "Dados" },
] as const;

function Secao({ id, titulo, texto, children }: { id: string; titulo: string; texto: string; children: ReactNode }) {
  return <ConfigSection id={id} title={titulo} description={texto} testId={`secao-${id}`}>{children}</ConfigSection>;
}

export function IntegrationsPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="mt-1 text-sm text-slate-500">Conexões oficiais com as plataformas de anúncio, o envio de e-mails, o Google Sheets e o WhatsApp.</p>
      </div>
      <SectionIndex testId="integracoes-indice" items={SECOES.map((s) => ({ id: s.id, label: s.titulo }))} />
      <Secao id="anuncios" titulo="Anúncios" texto="Conexões oficiais com as plataformas de anúncio.">
        {PLATFORMS.map((p) => {
          const Card = INTEGRATION_CARDS[p.id];
          return Card ? <Card key={p.id} /> : null;
        })}
      </Secao>
      <Secao id="comunicacao" titulo="Comunicação" texto="E-mails e WhatsApp (oficial e não oficial) e os avisos no seu grupo.">
        <EmailSettingsCard />
        <WhatsAppAppCard />
        <WaGatewayCard />
        <WaAvisosCard />
      </Secao>
      <Secao id="dados" titulo="Dados" texto="Envio de números para planilhas.">
        <GoogleSheetsCard />
      </Secao>
    </div>
  );
}
