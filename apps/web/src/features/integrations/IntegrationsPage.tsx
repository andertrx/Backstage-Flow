import { PLATFORMS } from "@backstage/shared";
import type { ComponentType, ReactNode } from "react";
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
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-4 space-y-4" data-testid={`secao-${id}`}>
      <div className="border-b border-slate-200 pb-2">
        <p id={`${id}-t`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        <p className="text-sm text-slate-500">{texto}</p>
      </div>
      {children}
    </section>
  );
}

export function IntegrationsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="mt-1 text-sm text-slate-500">Conexões oficiais com as plataformas de anúncio, o envio de e-mails, o Google Sheets e o WhatsApp.</p>
      </div>
      <nav aria-label="Seções das integrações" className="flex flex-wrap gap-2 text-sm" data-testid="integracoes-indice">
        {SECOES.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">{s.titulo}</a>
        ))}
      </nav>
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
