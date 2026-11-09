import { ENVIO_WEEKDAYS } from "@backstage/shared";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { WhatsAppPreview } from "./WhatsAppPreview.tsx";
import { type OpsEnvio, useDecidirEnvio, useEnviosPendentes, useQuemRecebe } from "./enviosApi.ts";

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
 * Sem aprovação até o horário, o envio da semana não sai (no envio automático dá para aprovar depois).
 * "Decidir depois" esconde por 30 minutos; volta enquanto estiver dentro do prazo.
 */
export function EnvioApprovalReminder() {
  const pend = useEnviosPendentes(true).data ?? [];
  const [, force] = useState(0);
  const next = pend.find((e) => !isSnoozed(e));
  if (!next) return null;
  return <EnvioApprovalModal key={dismissKey(next)} envio={next} onClose={() => { dismiss(next); force((n) => n + 1); }} />;
}

/** Revisão completa: mensagem como vai sair e grupos que vão receber (quem é marcado fica em cada cliente). Aprovar só depois de marcar "analisei". */
export function EnvioApprovalModal({ envio, onClose }: { envio: OpsEnvio; onClose: () => void }) {
  const decide = useDecidirEnvio();
  const quem = useQuemRecebe();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grupos = envio.clientes.filter((c) => c.ativo);
  // T5.22: quem recebe hoje (padrão: todos; a escolha vale só para esta semana)
  const [recebe, setRecebe] = useState<Record<string, boolean>>(() => Object.fromEntries(grupos.map((c) => [c.cliente_id, c.recebe_hoje !== false])));
  const marcados = grupos.filter((c) => recebe[c.cliente_id]).length;
  async function run(aprovar: boolean) {
    setError(null);
    try {
      const mudou = grupos.filter((c) => (c.recebe_hoje !== false) !== recebe[c.cliente_id]);
      if (aprovar && mudou.length) await quem.mutateAsync({ id: envio.id, clientes: mudou.map((c) => ({ cliente_id: c.cliente_id, receber: recebe[c.cliente_id] })) });
      await decide.mutateAsync({ id: envio.id, versao: envio.versao, aprovar });
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={envio.aprovacao_tardia ? "Envio semanal sem aprovação — aprove para enviar agora" : `Envio semanal de hoje — aprovar até ${envio.horario}`} open size="lg" onClose={onClose}>
      <div className="space-y-4 text-sm" data-testid="envio-aprovacao">
        <p className="flex items-center gap-2 text-slate-700">
          <Send className="size-4 text-blue-600" aria-hidden />
          <span><strong>{envio.nome}</strong> · {ENVIO_WEEKDAYS[envio.dia_semana]} às {envio.horario} · {grupos.length} grupo(s). Nada sai sem a sua aprovação.</span>
        </p>
        <div className="space-y-1.5">
          <p className="font-medium text-slate-700">Mensagem, como vai sair</p>
          <WhatsAppPreview text={envio.mensagem} />
        </div>
        <div className="space-y-1.5" data-testid="envio-quem-recebe">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-700">Quem recebe hoje <span className="font-normal text-slate-500">({marcados} de {grupos.length})</span></p>
            <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setRecebe(Object.fromEntries(grupos.map((c) => [c.cliente_id, true])))}>Selecionar todos</Button>
            <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setRecebe(Object.fromEntries(grupos.map((c) => [c.cliente_id, false])))}>Tirar todos</Button>
          </div>
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200" data-testid="envio-aprovacao-grupos">
            {grupos.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                <input type="checkbox" checked={Boolean(recebe[c.cliente_id])} onChange={(e) => setRecebe((v) => ({ ...v, [c.cliente_id]: e.target.checked }))} aria-label={`Enviar para ${c.cliente_nome}`} />
                <span className="min-w-0 flex-1"><span className="font-medium text-slate-900">{c.cliente_nome}</span> <span className="text-xs text-slate-500">({c.nome_grupo})</span></span>
                {c.ja_enviado_nesta_semana && <span className="text-xs font-semibold text-emerald-700">já enviado nesta semana</span>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Vale só para esta semana: na próxima, todos voltam marcados.</p>
        </div>
        <label className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-slate-800">
          <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {envio.aprovacao_tardia
            ? <span><strong>Analisei a mensagem e os grupos.</strong> O horário ({envio.horario}) já passou: ao aprovar, o envio sai agora para quem ainda não recebeu esta semana.</span>
            : <span><strong>Analisei a mensagem e os grupos.</strong> Está aprovado para enviar hoje às {envio.horario}.</span>}
        </label>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Decidir depois</Button>
          <Button variant="secondary" onClick={() => run(false)} loading={decide.isPending && decide.variables?.aprovar === false}>
            <XCircle className="size-4" aria-hidden /> Não enviar esta semana
          </Button>
          <Button onClick={() => run(true)} disabled={!checked || marcados === 0} loading={(decide.isPending && decide.variables?.aprovar === true) || quem.isPending}>
            <CheckCircle2 className="size-4" aria-hidden /> {envio.aprovacao_tardia ? "Aprovar e enviar agora" : "Aprovar envio"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">{envio.aprovacao_tardia
          ? "Você pode aprovar até o fim da semana, sem mudar o dia nem o horário do envio. O envio sai em até alguns minutos, uma mensagem por vez."
          : `Sem decisão até ${envio.horario}, o envio desta semana não sai. Se o envio for editado depois de aprovado, ele pede aprovação de novo.`}</p>
      </div>
    </Modal>
  );
}
