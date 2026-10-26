import { Smartphone } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useDisablePush, useEnablePush, usePushDevices, usePushState, useTestPush } from "./dueReminderApi.ts";

/** Central 36.17: notificação de tarefa vencida no computador e no celular (8h, 12h e 17h). */
export function PushDevicesCard() {
  const state = usePushState();
  const devices = usePushDevices(true);
  const enable = useEnablePush();
  const disable = useDisablePush();
  const test = useTestPush();
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const run = async (fn: () => Promise<string>) => {
    setMessage(null);
    try { setMessage({ tone: "success", text: await fn() }); } catch (err) { setMessage({ tone: "error", text: errorMessage(err) }); }
  };
  const active = (devices.data ?? []).filter((d) => !d.disabled_at);

  return (
    <Card className="space-y-3 p-5" data-testid="ops-push-card">
      <div className="flex gap-3">
        <Smartphone className="mt-0.5 size-5 text-slate-400" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">Aviso no computador e no celular</h2>
          <p className="text-sm text-slate-500">
            Às 8h, 12h e 17h, quem é responsável por tarefa com prazo vencido recebe o aviso no aparelho, mesmo com o CRM fechado.
            Ative em cada aparelho (computador e celular). No iPhone: adicione o Backstage Flow à Tela de Início e ative por lá.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="ops-push-state">
        {state.data === "ligado" && <Badge tone="success">Ativado neste aparelho</Badge>}
        {state.data === "desligado" && <Badge tone="neutral">Desativado neste aparelho</Badge>}
        {state.data === "bloqueado" && <Badge tone="warning">Bloqueado neste navegador</Badge>}
        {state.data === "sem_suporte" && <Badge tone="warning">Este navegador não recebe notificações</Badge>}
        {state.data === "desligado" && (
          <Button className="px-3 py-1.5 text-xs" loading={enable.isPending}
            onClick={() => void run(async () => { await enable.mutateAsync(); return "Ativado. Use \"Enviar teste\" para conferir."; })}>
            Ativar neste aparelho
          </Button>
        )}
        {state.data === "ligado" && (
          <>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={test.isPending}
              onClick={() => void run(async () => { const r = await test.mutateAsync(); return r.failed ? `Enviado para ${r.sent}; ${r.failed} aparelho(s) não receberam.` : "Teste enviado. Deve aparecer em alguns segundos."; })}>
              Enviar teste
            </Button>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" loading={disable.isPending}
              onClick={() => void run(async () => { await disable.mutateAsync(); return "Desativado neste aparelho."; })}>
              Desativar neste aparelho
            </Button>
          </>
        )}
      </div>
      {state.data === "bloqueado" && (
        <Alert tone="info">Para liberar: clique no cadeado ao lado do endereço do site → Notificações → Permitir. Depois recarregue a página.</Alert>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {active.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm" data-testid="ops-push-devices">
          {active.map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span className="text-slate-700">{d.device ?? "Aparelho"}</span>
              <span className="text-xs text-slate-500">
                {d.last_error ? d.last_error : d.last_sent_at ? `último aviso ${formatDateTime(d.last_sent_at)}` : `ativado em ${formatDateTime(d.created_at)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
