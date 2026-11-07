import { CalendarPlus, Link2, Unlink } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type OpsBoardClient, useLinkClientMeeting, useUnlinkClientMeeting } from "./clientsApi.ts";
import { MeetingFormModal, meetingWhen } from "./Meetings.tsx";
import { useMeetingCategories, useMeetingList } from "./meetingsApi.ts";
import type { TasksContext } from "./tasksContext.tsx";

/** Etapa 47.1: só nesta etapa o cliente precisa de uma reunião de onboarding "realizada" para avançar. */
export const ONBOARDING_STAGE = "onboarding_pendente";

/** Selo do cartão: 🔴 sem reunião · 🟡 marcada (ou já passou e falta registrar) · 🟢 realizada. */
export function MeetingSeal({ c }: { c: OpsBoardClient }) {
  const m = c.onboarding_meeting;
  const day = m ? new Date(m.starts_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
  const [tone, text] = c.meeting_ok
    ? ["bg-emerald-50 text-emerald-800 ring-emerald-200", `Reunião realizada #${m?.number}`]
    : !m || m.status === "cancelada"
      ? ["bg-red-50 text-red-700 ring-red-200", "Sem reunião: vincule ou crie"]
      : new Date(m.starts_at).getTime() < Date.now()
        ? ["bg-amber-50 text-amber-800 ring-amber-200", `Reunião #${m.number} (${day}) falta registrar`]
        : ["bg-amber-50 text-amber-800 ring-amber-200", `Reunião marcada para ${day}`];
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

/** Botões do cartão em "Onboarding Pendente": vincular, criar e (se já vinculada) trocar. */
export function OnboardingMeetingActions({ c, ctx }: { c: OpsBoardClient; ctx: TasksContext }) {
  const [mode, setMode] = useState<"link" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = useMeetingCategories();
  const link = useLinkClientMeeting();
  const unlink = useUnlinkClientMeeting();
  if (c.stage_id !== ONBOARDING_STAGE || !c.can_move || c.meeting_ok) return null;
  const canCreate = ctx.can("ops.meetings.manage");
  const has = Boolean(c.onboarding_meeting && c.onboarding_meeting.status !== "cancelada");
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2" data-testid="ops-onboarding-actions">
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
  );
}

