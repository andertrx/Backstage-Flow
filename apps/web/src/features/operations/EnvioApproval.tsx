import { cleanContacts, ENVIO_WEEKDAYS } from "@backstage/shared";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { WhatsAppPreview } from "./WhatsAppPreview.tsx";
import { type OpsEnvio, useDecidirEnvio, useEnviosPendentes } from "./enviosApi.ts";

const DISMISS_KEY = "ops.envios.depois";
const SNOOZE_MS = 30 * 60_000;
const dismissKey = (e: OpsEnvio) => `${e.id}:${e.semana}:${e.versao}`;
/** "Decidir depois": some por 30 minutos neste navegador (e volta enquanto estiver no prazo). */
function snoozed(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}
const isSnoozed = (e: OpsEnvio) => (snoozed()[dismissKey(e)] ?? 0) > Date.now();
function dismiss(e: OpsEnvio) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify({ ...snoozed(), [dismissKey(e)]: Date.now() + SNOOZE_MS })); } catch { /* sem armazenamento: volta no próximo minuto */ }
}

/**
 * Etapa 41.2: no dia do envio, das 7h até o horário (Brasília), pede a aprovação em qualquer tela do CRM.
 * Sem aprovação até o horário, o envio da semana não sai (o MCP só entrega ao agente os aprovados).
 * "Decidir depois" esconde por 30 minutos; volta enquanto estiver dentro do prazo.
 */
export function EnvioApprovalReminder() {
  const pend = useEnviosPendentes(true).data ?? [];
  const [, force] = useState(0);
  const next = pend.find((e) => !isSnoozed(e));
  if (!next) return null;
  return <EnvioApprovalModal key={dismissKey(next)} envio={next} onClose={() => { dismiss(next); force((n) => n + 1); }} />;
}

/** Revisão completa: mensagem como vai sair, grupos e quem será marcado. Aprovar só depois de marcar "analisei". */
export function EnvioApprovalModal({ envio, onClose }: { envio: OpsEnvio; onClose: () => void }) {
  const decide = useDecidirEnvio();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grupos = envio.clientes.filter((c) => c.ativo);
  async function run(aprovar: boolean) {
    setError(null);
    try {
      await decide.mutateAsync({ id: envio.id, versao: envio.versao, aprovar });
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={`Envio semanal de hoje — aprovar até ${envio.horario}`} open size="lg" onClose={onClose}>
      <div className="space-y-4 text-sm" data-testid="envio-aprovacao">
        <p className="flex items-center gap-2 text-slate-700">
          <Send className="size-4 text-blue-600" aria-hidden />
          <span><strong>{envio.nome}</strong> · {ENVIO_WEEKDAYS[envio.dia_semana]} às {envio.horario} · {grupos.length} grupo(s). Nada sai sem a sua aprovação.</span>
        </p>
        <div className="space-y-1.5">
          <p className="font-medium text-slate-700">Mensagem, como vai sair</p>
          <WhatsAppPreview text={envio.mensagem} />
        </div>
        <div className="space-y-1.5">
          <p className="font-medium text-slate-700">Grupos e quem será marcado (na mensagem seguinte)</p>
          <ol className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200" data-testid="envio-aprovacao-grupos">
            {grupos.map((c, i) => {
              const names = cleanContacts(c.contatos_marcar);
              return (
                <li key={c.id} className="flex flex-wrap gap-x-2 px-3 py-2">
                  <span className="w-6 text-right text-xs font-semibold text-slate-400">{i + 1}.</span>
                  <span className="min-w-0 flex-1"><span className="font-medium text-slate-900">{c.nome_grupo}</span> <span className="text-xs text-slate-500">({c.cliente_nome})</span>
                    <span className="block text-xs text-slate-600">{names.length ? names.map((n) => `@${n}`).join(" ") : "sem marcação"}</span></span>
                  {c.ja_enviado_nesta_semana && <span className="text-xs font-semibold text-emerald-700">já enviado nesta semana</span>}
                </li>
              );
            })}
          </ol>
        </div>
        <label className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-slate-800">
          <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span><strong>Analisei a mensagem e os grupos.</strong> Está aprovado para enviar hoje às {envio.horario}.</span>
        </label>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Decidir depois</Button>
          <Button variant="secondary" onClick={() => run(false)} loading={decide.isPending && decide.variables?.aprovar === false}>
            <XCircle className="size-4" aria-hidden /> Não enviar esta semana
          </Button>
          <Button onClick={() => run(true)} disabled={!checked} loading={decide.isPending && decide.variables?.aprovar === true}>
            <CheckCircle2 className="size-4" aria-hidden /> Aprovar envio
          </Button>
        </div>
        <p className="text-xs text-slate-500">Sem decisão até {envio.horario}, o envio desta semana não sai. Se o envio for editado depois de aprovado, ele pede aprovação de novo.</p>
      </div>
    </Modal>
  );
}
