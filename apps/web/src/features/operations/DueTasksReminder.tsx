import { BellRing, CheckCircle2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate } from "@/lib/format.ts";
import { type DueTask, useDueReminder, useEnablePush, useMarkReminderSeen, usePushState } from "./dueReminderApi.ts";
import { useOpsStatuses, useSetTaskStatus } from "./tasksApi.ts";

const lateText = (t: DueTask) => (t.days_late <= 0 ? "vence hoje" : `venceu há ${t.days_late} dia${t.days_late === 1 ? "" : "s"}`);

/**
 * Central 36.17: pop-up de tarefas vencidas às 8h, 12h e 17h (Brasília), para o responsável.
 * Aparece em qualquer tela do CRM e fica até a pessoa clicar "Vi" (vale em todos os aparelhos).
 * Se o CRM estiver fechado no horário, aparece quando abrir.
 */
export function DueTasksReminder() {
  const reminder = useDueReminder(true);
  const seen = useMarkReminderSeen();
  const statuses = useOpsStatuses();
  const setStatus = useSetTaskStatus();
  const push = usePushState();
  const enablePush = useEnablePush();
  const navigate = useNavigate();
  const [done, setDone] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const r = reminder.data;
  const tasks = (r?.tasks ?? []).filter((t) => !done.includes(t.id));
  if (!r || r.slot == null || r.seen || !r.day || (r.tasks ?? []).length === 0) return null;

  const markSeen = () => seen.mutate({ day: r.day!, slot: r.slot! });
  const concluded = statuses.data?.find((s) => s.category === "concluido" && s.active);

  async function conclude(t: DueTask) {
    if (!concluded) return;
    setProblem(null);
    try {
      await setStatus.mutateAsync({ id: t.id, version: t.version, statusId: concluded.id });
      setDone((d) => [...d, t.id]);
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  return (
    <Modal title={`Tarefas vencidas — lembrete das ${r.slot}h`} open size="lg" onClose={markSeen}>
      <div className="space-y-4 text-sm" data-testid="due-reminder">
        <p className="flex items-center gap-2 text-slate-700">
          <BellRing className="size-4 text-brand-600" aria-hidden />
          Você é o responsável por {r.tasks.length === 1 ? "esta tarefa" : `estas ${r.tasks.length} tarefas`}, com o prazo vencido. Confira se foi cumprida.
        </p>
        {problem && <Alert tone="error">{problem}</Alert>}
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {r.tasks.map((t) => {
            const isDone = done.includes(t.id);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3" data-testid="due-task">
                <div className="min-w-48 flex-1">
                  <p className="font-medium text-slate-900">#{t.number} {t.title}</p>
                  <p className="text-xs text-slate-500">
                    {t.client ? `${t.client} · ` : ""}prazo {formatDate(t.due_date)} · <span className="font-medium text-red-700">{lateText(t)}</span>
                  </p>
                </div>
                {isDone ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-4" aria-hidden /> Concluída</span>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => { markSeen(); navigate(`/operacoes/tarefas?tarefa=${t.id}`); }}>
                      <ExternalLink className="size-3.5" aria-hidden /> Abrir
                    </Button>
                    {concluded && (
                      <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={setStatus.isPending} onClick={() => void conclude(t)}>
                        <CheckCircle2 className="size-3.5" aria-hidden /> Concluir
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {tasks.length === 0 && <Alert tone="success">Tudo concluído. Bom trabalho!</Alert>}

        {(push.data === "desligado" || push.data === "bloqueado") && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3" data-testid="due-push">
            <span className="text-slate-600">
              {push.data === "bloqueado"
                ? "As notificações deste navegador estão bloqueadas. Clique no cadeado ao lado do endereço do site → Notificações → Permitir."
                : "Receber este aviso também no computador e no celular, mesmo com o CRM fechado."}
            </span>
            {push.data === "desligado" && (
              <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={enablePush.isPending} onClick={async () => {
                setPushNote(null);
                try { await enablePush.mutateAsync(); setPushNote("Pronto: este aparelho vai receber o aviso às 8h, 12h e 17h."); }
                catch (err) { setPushNote(errorMessage(err)); }
              }}>
                Ativar neste aparelho
              </Button>
            )}
          </div>
        )}
        {pushNote && <p className="text-xs text-slate-600" role="status">{pushNote}</p>}

        <div className="flex justify-end">
          <Button onClick={markSeen} loading={seen.isPending}>Vi</Button>
        </div>
      </div>
    </Modal>
  );
}
