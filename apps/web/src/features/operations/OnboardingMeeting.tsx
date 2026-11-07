import { CalendarPlus, ClipboardCheck, ClipboardPlus, Link2, Unlink } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type OpsBoardClient, useLinkClientMeeting, useUnlinkClientMeeting } from "./clientsApi.ts";
import { MeetingFormModal, meetingWhen, RecordModal } from "./Meetings.tsx";
import { useMeeting, useMeetingCategories, useMeetingList } from "./meetingsApi.ts";
import { OnboardingTasksModal } from "./OnboardingTasksModal.tsx";
import { TaskFormModal } from "./TaskFormModal.tsx";
import { type TasksContext, useOpenTask } from "./tasksContext.tsx";

/**
 * Etapa 47.2: Pendente → Agendado exige reunião agendada; Agendado → Realizado exige reunião realizada.
 * Etapa 49.4: Agendado → Realizado também exige ao menos 1 tarefa para o time de operação (setor diferente de Comercial).
 */
export const ONBOARDING_STAGE = "onboarding_pendente";
export const ONBOARDING_SCHEDULED_STAGE = "coleta_acessos";
export const isOnboardingStage = (id: string) => id === ONBOARDING_STAGE || id === ONBOARDING_SCHEDULED_STAGE;

/** Setor que NÃO conta como "time de operação" (mesma regra do banco: private.ops_onboarding_tem_tarefa_operacao). */
export const isCommercialSector = (name: string | undefined) => (name ?? "").trim().toLowerCase() === "comercial";

/** Selo do cartão: 🔴 sem reunião · 🟡 marcada / falta registrar / falta a tarefa da operação · 🟢 realizada e com tarefa. */
export function MeetingSeal({ c }: { c: OpsBoardClient }) {
  const m = c.onboarding_meeting;
  const day = m ? new Date(m.starts_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
  const none = !m || m.status === "cancelada";
  const [tone, text] = c.meeting_ok && c.ops_task_ok
    ? ["bg-emerald-50 text-emerald-800 ring-emerald-200", `Reunião realizada #${m?.number}: pode ir para Realizado`]
    : c.meeting_ok
      ? ["bg-amber-50 text-amber-800 ring-amber-200", `Reunião realizada #${m?.number}: falta 1 tarefa para a operação`]
    : none
      ? ["bg-red-50 text-red-700 ring-red-200", "Sem reunião: vincule ou crie"]
      : c.stage_id === ONBOARDING_STAGE
        ? ["bg-amber-50 text-amber-800 ring-amber-200", `Reunião marcada para ${day}: pode ir para Agendado`]
        : new Date(m.starts_at).getTime() < Date.now()
          ? ["bg-amber-50 text-amber-800 ring-amber-200", `Reunião #${m.number} (${day}) falta registrar como Realizada`]
          : ["bg-amber-50 text-amber-800 ring-amber-200", `Aguardando a reunião de ${day}`];
  return <span data-testid="ops-client-meeting-seal" className={cn("inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tone)}>{text}</span>;
}

function LinkModal({ c, onClose }: { c: OpsBoardClient; onClose: () => void }) {
  const list = useMeetingList({});
  const link = useLinkClientMeeting();
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options = (list.data?.meetings ?? [])
    .filter((m) => m.status !== "cancelada" && (!m.client_id || m.client_id === c.client_id))
    .sort((a, b) => Number(b.client_id === c.client_id) - Number(a.client_id === c.client_id) || b.starts_at.localeCompare(a.starts_at));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pick) return setError("Escolha a reunião.");
    try { await link.mutateAsync({ clientId: c.client_id, meetingId: pick }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={`Vincular reunião: ${c.name}`} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" data-testid="ops-onboarding-link">
        <Field label="Reunião" hint="As reuniões deste cliente aparecem primeiro. Reunião sem cliente passa a ser deste cliente.">
          {(id) => (
            <Select id={id} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Escolha a reunião</option>
              {options.map((m) => <option key={m.id} value={m.id}>#{m.number} · {m.title} · {meetingWhen(m.starts_at, m.duration_min)} · {m.status}</option>)}
            </Select>
          )}
        </Field>
        {list.isSuccess && options.length === 0 && <Alert tone="info">Este cliente ainda não tem reunião. Use "Criar reunião".</Alert>}
        {(error || list.error) && <Alert tone="error">{error ?? errorMessage(list.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={link.isPending}>Vincular</Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * 51.4: "Reunião realizada" no cartão — abre a mesma janela do menu Reuniões (ata, presença, "Marcar como realizada")
 * sem sair do Onboarding. Ao salvar, a janela fecha e o quadro atualiza.
 */
const stopDrag = (e: { stopPropagation: () => void }) => e.stopPropagation();

function MeetingDoneButton({ meetingId }: { meetingId: string }) {
  const [open, setOpen] = useState(false);
  const q = useMeeting(open ? meetingId : null);
  return (
    <>
      <Button type="button" className="px-2 py-1 text-xs" onClick={() => setOpen(true)} loading={open && q.isLoading}>
        <ClipboardCheck className="size-3.5" aria-hidden /> Reunião realizada
      </Button>
      {open && q.error && <p className="w-full text-[11px] text-red-700" role="alert">{errorMessage(q.error)}</p>}
      {open && q.data && !q.data.can.edit && (
        <p className="w-full text-[11px] text-red-700" role="alert">Só quem organiza a reunião (ou tem "Criar reuniões e Dailies") pode registrá-la.</p>
      )}
      {open && q.data?.can.edit && (
        // a janela fica dentro do cartão: não deixa clicar/selecionar texto nela começar o arrastar do cartão
        <div onPointerDown={stopDrag} onMouseDown={stopDrag} onTouchStart={stopDrag} onKeyDown={stopDrag}>
          <RecordModal d={q.data} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

/** Botões do cartão em "Onboarding Pendente": vincular, criar e (se já vinculada) trocar. */
export function OnboardingMeetingActions({ c, ctx }: { c: OpsBoardClient; ctx: TasksContext }) {
  const [mode, setMode] = useState<"link" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = useMeetingCategories();
  const link = useLinkClientMeeting();
  const unlink = useUnlinkClientMeeting();
  if (!isOnboardingStage(c.stage_id) || !c.can_move) return null;
  // 50.1: as tarefas do onboarding ficam disponíveis em Agendado (ou com a reunião já realizada), mesmo depois de a primeira ser criada.
  const tasks = c.stage_id === ONBOARDING_SCHEDULED_STAGE || c.meeting_ok ? <OpsTaskAction c={c} ctx={ctx} /> : null;
  if (c.meeting_ok) return tasks;
  const canCreate = ctx.can("ops.meetings.manage");
  const has = Boolean(c.onboarding_meeting && c.onboarding_meeting.status !== "cancelada");
  return (
    <>
    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2" data-testid="ops-onboarding-actions">
      {c.onboarding_meeting?.status === "agendada" && <MeetingDoneButton meetingId={c.onboarding_meeting.id} />}
      <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setMode("link")}>
        <Link2 className="size-3.5" aria-hidden /> {has ? "Trocar reunião" : "Vincular reunião"}
      </Button>
      {canCreate && (
        <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setMode("create")}>
          <CalendarPlus className="size-3.5" aria-hidden /> Criar reunião
        </Button>
      )}
      {has && (
        <Button type="button" variant="secondary" className="px-2 py-1 text-xs" loading={unlink.isPending}
          onClick={() => { setError(null); unlink.mutate(c.client_id, { onError: (e) => setError(errorMessage(e)) }); }}>
          <Unlink className="size-3.5" aria-hidden /> Desvincular
        </Button>
      )}
      {error && <p className="w-full text-[11px] text-red-700" role="alert">{error}</p>}
      {mode === "link" && <LinkModal c={c} onClose={() => setMode(null)} />}
      {mode === "create" && categories.data && (
        <MeetingFormModal meeting={null} categories={categories.data} ctx={ctx} onClose={() => setMode(null)}
          defaults={{ client_id: c.client_id, title: `Onboarding — ${c.name}`, category_id: "cliente", lockClient: true }}
          onSaved={(id) => link.mutate({ clientId: c.client_id, meetingId: id }, { onError: (e) => setError(errorMessage(e)) })} />
      )}
    </div>
    {tasks}
    </>
  );
}

/** Etapa 49.4/50.1: tarefas do onboarding (padrão marcáveis ou outras) para o time de operação. */
function OpsTaskAction({ c, ctx }: { c: OpsBoardClient; ctx: TasksContext }) {
  const [mode, setMode] = useState<"lista" | "completo" | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const { open } = useOpenTask();
  if (!ctx.can("ops.tasks.create")) return null;
  const mine = ctx.sectors.find((s) => s.id === ctx.mySector);
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2" data-testid="ops-onboarding-task-action">
      <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setMode("lista")}>
        <ClipboardPlus className="size-3.5" aria-hidden /> Tarefas do onboarding
      </Button>
      {done !== null && <p className="w-full text-[11px] text-emerald-700" role="status">{done} tarefa(s) criada(s).</p>}
      {mode === "lista" && <OnboardingTasksModal c={c} ctx={ctx} onClose={() => setMode(null)} onDone={setDone} onFullForm={() => setMode("completo")} />}
      {mode === "completo" && (
        <TaskFormModal detail={null} sectors={ctx.sectors} statuses={ctx.statuses} directory={ctx.directory} me={ctx.me} mySector={ctx.mySector}
          canAssign={ctx.can("ops.tasks.assign")} canChangeSector onClose={() => setMode(null)} onSaved={open}
          defaults={{ client_id: c.client_id, title: `Próximos passos: ${c.name}`, sector_id: mine && !isCommercialSector(mine.name) ? mine.id : "" }}
          note="Para o cliente ir para Onboarding Realizado, ele precisa de ao menos 1 tarefa para o time de operação: qualquer setor, menos Comercial." />
      )}
    </div>
  );
}
