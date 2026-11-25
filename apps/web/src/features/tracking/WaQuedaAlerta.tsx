import { can } from "@backstage/shared";
import { QrCode, WifiOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useActiveClients } from "@/features/clients/api.ts";
import { useTrackingContainers, useWhatsAppConnections } from "./api.ts";
import { formatTelefone } from "./ClientesSiteWhatsApp.tsx";
import { WaQrModal } from "./WaQrSection.tsx";

const FORA = new Set(["desconectado", "aguardando_leitura", "erro"]);

/** "há 1 dia e 4 h", "há 35 min" */
export function tempoFora(desde: string | null | undefined, agora = Date.now()): string | null {
  if (!desde) return null;
  const min = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  const resto = h % 24;
  return `há ${d} dia${d > 1 ? "s" : ""}${resto ? ` e ${resto} h` : ""}`;
}

/**
 * 25/11/2026: faixa no topo do Painel do Tracking quando o WhatsApp (servidor próprio) de um cliente está fora.
 * Antes o aviso ficava escondido na aba WhatsApp e em Configurações. Quem configura o Tracking reconecta daqui mesmo (QR Code).
 */
export function WaQuedaAlerta({ clientId }: { clientId: string | null }) {
  const { profile } = useAuth();
  const podeReconectar = can(profile?.role, "tracking.manage");
  const { data: clients = [] } = useActiveClients();
  const { data: containers = [] } = useTrackingContainers();
  const { data: conexoes = [] } = useWhatsAppConnections(containers.length > 0);
  const [qr, setQr] = useState<string | null>(null);

  const nomeDe = new Map(clients.map((c) => [c.id, c.name]));
  const clienteDe = new Map(containers.map((c) => [c.id, c.client_id]));
  const caidas = conexoes
    .filter((w) => w.mode === "nao_oficial" && w.enabled && FORA.has(w.gateway_state ?? ""))
    .map((w) => ({ w, cliente: clienteDe.get(w.container_id) ?? "" }))
    .filter((x) => nomeDe.has(x.cliente) && (!clientId || x.cliente === clientId));
  if (caidas.length === 0) return null;
  const aberta = caidas.find((x) => x.w.id === qr);

  return (
    <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 ring-1 ring-inset ring-red-200" data-testid="wa-queda-alerta">
      {caidas.map(({ w, cliente }) => (
        <div key={w.id} className="flex flex-wrap items-center justify-between gap-2" data-testid="wa-queda-linha">
          <p className="flex min-w-0 items-start gap-2 text-sm text-red-800">
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>WhatsApp de {nomeDe.get(cliente)}{w.display_phone ? ` · ${formatTelefone(w.display_phone)}` : ""} sem conexão</strong>
              {tempoFora(w.health_since) ? ` ${tempoFora(w.health_since)}` : ""}. Enquanto isso, as mensagens e as vendas desse cliente não chegam ao CRM.
              {!podeReconectar && " Peça a um administrador ou gestor para reconectar."}
            </span>
          </p>
          {podeReconectar && (
            <Button className="px-3 py-1.5 text-xs" onClick={() => setQr(w.id)} aria-label={`Reconectar o WhatsApp de ${nomeDe.get(cliente)}${w.display_phone ? ` ${formatTelefone(w.display_phone)}` : ""}`}>
              <QrCode className="size-3.5" aria-hidden /> Reconectar
            </Button>
          )}
        </div>
      ))}
      {aberta && <WaQrModal clientName={nomeDe.get(aberta.cliente) ?? "cliente"} connection={aberta.w} onClose={() => setQr(null)} />}
    </div>
  );
}
