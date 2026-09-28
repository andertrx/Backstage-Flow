import {
  OPS_MEETING_ITEM_KINDS, OPS_MEETING_ITEM_LABELS, OPS_MEETING_STATUS_LABELS, opsMeetingDay, opsMeetingIsoToLocal, opsMeetingItemMakesTask,
  opsMeetingLocalToIso, opsMeetingSpan, type OpsMeetingItemKind, type OpsMeetingStatus,
} from "@backstage/shared";
import { Ban, CalendarDays, CheckCircle2, ClipboardCheck, ExternalLink, ListPlus, MapPin, Pencil, Users, X } from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatDateTime } from "@/lib/format.ts";
import { ACTION_LABELS, activityText } from "./activity.ts";
import {
  type OpsMeetingCategory, type OpsMeetingDetail, type OpsMeetingInput, type OpsMeetingItem, useAddMeetingItem, useCancelMeeting, useItemToTask,
  useMeeting, useMeetingCategories, useRecordMeeting, useRemoveMeetingItem, useSaveMeeting,
} from "./meetingsApi.ts";
import type { TasksContext } from "./tasksContext.tsx";

const STATUS_STYLE: Record<OpsMeetingStatus, string> = {
  agendada: "bg-blue-50 text-blue-700 ring-blue-200",
  realizada: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelada: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function MeetingStatusBadge({ status }: { status: OpsMeetingStatus }) {
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STATUS_STYLE[status])}>{OPS_MEETING_STATUS_LABELS[status]}</span>;
}

/** "28/09/2026 · 09:00 – 09:15" no horário de Brasília. */
export const meetingWhen = (iso: string, durationMin: number) => `${formatDate(opsMeetingDay(iso))} · ${opsMeetingSpan(iso, durationMin)}`;

/** Próxima meia hora cheia, no horário de Brasília (sugestão para uma reunião nova). */
function nextSlot() {
  const t = Math.ceil(Date.now() / 1_800_000) * 1_800_000;
  return opsMeetingIsoToLocal(new Date(t).toISOString());
}

export function MeetingFormModal({ meeting, people, categories, ctx, defaults, onClose, onSaved }: {
  meeting: OpsMeetingDetail["meeting"] | null;
  people?: string[];
  categories: OpsMeetingCategory[];
  ctx: TasksContext;
  defaults?: { client_id?: string };
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [category, setCategory] = useState(meeting?.category_id ?? categories.find((c) => c.active)?.id ?? "");
  const [when, setWhen] = useState(meeting ? opsMeetingIsoToLocal(meeting.starts_at) : nextSlot());
  const [duration, setDuration] = useState(String(meeting?.duration_min ?? 30));
  const [sector, setSector] = useState(meeting ? meeting.sector_id ?? "" : ctx.mySector ?? "");
  const [client, setClient] = useState(meeting?.client_id ?? defaults?.client_id ?? "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [agenda, setAgenda] = useState(meeting?.agenda ?? "");
  const [chosen, setChosen] = useState<Set<string>>(new Set(people ?? []));
  const [error, setError] = useState<string | null>(null);
  const save = useSaveMeeting();
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sectorPeople = ctx.directory.people.filter((p) => sector && p.sectors.includes(sector));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError("Dê um título à reunião (mínimo 3 letras).");
    if (!category) return setError("Escolha o tipo da reunião.");
    let startsAt: string;
    try { startsAt = opsMeetingLocalToIso(when); } catch { return setError("Informe a data e a hora."); }
    const input: OpsMeetingInput = {
      title: title.trim(), category_id: category, starts_at: startsAt, duration_min: Number(duration) || 30, sector_id: sector, client_id: client,
      location: location.trim(), agenda: agenda.trim(), people: [...chosen],
    };
    try {
      const id = await save.mutateAsync({ id: meeting?.id ?? null, version: meeting?.version ?? null, input });
      onSaved?.(id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={meeting ? `Editar reunião #${meeting.number}` : "Nova reunião"} open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4" data-testid="ops-meeting-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Título">{(id) => <Input id={id} value={title} maxLength={160} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Daily do Design" />}</Field>
          </div>
          <Field label="Tipo">
            {(id) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.filter((c) => c.active || c.id === meeting?.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><Field label="Data e hora (Brasília)">{(id) => <Input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field></div>
            <Field label="Duração">
              {(id) => (
                <Select id={id} value={duration} onChange={(e) => setDuration(e.target.value)}>
                  {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
                  {![15, 30, 45, 60, 90, 120, 180, 240].includes(Number(duration)) && <option value={duration}>{duration} min</option>}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Setor" hint="Quem é do setor vê a reunião.">
            {(id) => (
              <Select id={id} value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="">Sem setor (várias áreas)</option>
                {ctx.sectors.filter((s) => s.status === "ativo" || s.id === meeting?.sector_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Cliente" hint="Opcional. Aparece no histórico do cliente.">
            {(id) => (
              <Select id={id} value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">Sem cliente</option>
                {ctx.directory.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                {meeting?.client_id && !ctx.directory.clients.some((c) => c.id === meeting.client_id) && <option value={meeting.client_id}>{meeting.client_name}</option>}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Local ou link da chamada">{(id) => <Input id={id} value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Sala 2 ou https://meet.google.com/…" />}</Field>
          </div>
        </div>
        <Field label="Pauta">{(id) => <Textarea id={id} value={agenda} maxLength={5000} onChange={(e) => setAgenda(e.target.value)} placeholder="O que será tratado" />}</Field>
        <fieldset className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-sm font-medium text-slate-700">Participantes ({chosen.size})</legend>
            {sectorPeople.length > 0 && (
              <Button type="button" variant="secondary" className="px-2.5 py-1 text-xs"
                onClick={() => setChosen((s) => new Set([...s, ...sectorPeople.map((p) => p.user_id)]))}>
                <Users className="size-3.5" aria-hidden /> Chamar o setor inteiro
              </Button>
            )}
          </div>
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg p-2 ring-1 ring-slate-200 sm:grid-cols-2" data-testid="ops-meeting-people">
            {ctx.directory.people.map((p) => (
              <label key={p.user_id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                <input type="checkbox" checked={chosen.has(p.user_id)} onChange={() => toggle(p.user_id)} /> {p.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">Quem organiza, os participantes e quem é do setor veem a reunião. Participantes podem registrar pendências e decisões.</p>
        </fieldset>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>{meeting ? "Salvar" : "Agendar reunião"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function RecordModal({ d, onClose }: { d: OpsMeetingDetail; onClose: () => void }) {
  const done = d.meeting.status === "realizada";
  const [notes, setNotes] = useState(d.meeting.notes ?? "");
  const [present, setPresent] = useState<Set<string>>(new Set(d.people.filter((p) => (done ? p.attended : true)).map((p) => p.user_id)));
  const [error, setError] = useState<string | null>(null);
  const record = useRecordMeeting();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await record.mutateAsync({ id: d.meeting.id, version: d.meeting.version, notes, attended: [...present] });
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={done ? "Editar ata e presença" : "Registrar reunião"} open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4" data-testid="ops-meeting-record">
        <Field label="Ata / resumo">{(id) => <Textarea id={id} className="min-h-32" value={notes} maxLength={20000} onChange={(e) => setNotes(e.target.value)} placeholder="O que foi falado e combinado" />}</Field>
        {d.people.length > 0 ? (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-slate-700">Presença</legend>
            {d.people.map((p) => (
              <label key={p.user_id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={present.has(p.user_id)}
                  onChange={() => setPresent((s) => { const n = new Set(s); if (n.has(p.user_id)) n.delete(p.user_id); else n.add(p.user_id); return n; })} /> {p.name}
              </label>
            ))}
          </fieldset>
        ) : <p className="text-sm text-slate-500">Sem participantes na lista.</p>}
        <p className="text-xs text-slate-500">Pendências e decisões ficam na lista de itens da reunião. A versão anterior da ata fica no histórico.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="submit" loading={record.isPending}>{done ? "Salvar" : "Marcar como realizada"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CancelModal({ d, onClose }: { d: OpsMeetingDetail; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cancel = useCancelMeeting();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (reason.trim().length < 3) return setError("Informe o motivo do cancelamento.");
    try { await cancel.mutateAsync({ id: d.meeting.id, version: d.meeting.version, reason }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title="Cancelar reunião" open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Motivo">{(id) => <Textarea id={id} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Cliente remarcou" />}</Field>
        <p className="text-xs text-slate-500">A reunião continua no histórico, marcada como cancelada.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="submit" variant="danger" loading={cancel.isPending}>Cancelar reunião</Button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words text-sm text-slate-800">{children || "—"}</dd></div>;
}

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

function ItemRow({ item, d, ctx, busy, onTask, onRemove }: {
  item: OpsMeetingItem; d: OpsMeetingDetail; ctx: TasksContext; busy: boolean; onTask: () => void; onRemove: () => void;
}) {
  const makesTask = opsMeetingItemMakesTask(item.kind);
  const open = d.meeting.status !== "cancelada";
  const needsAssign = Boolean(item.owner_id && item.owner_id !== ctx.me && !d.can.assign);
  const noSector = !item.sector_id && !d.meeting.sector_id;
  return (
    <li className="space-y-1 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200" data-testid="ops-meeting-item">
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{item.body}</p>
      <p className="text-xs text-slate-500">
        {[item.owner_name && `Responsável: ${item.owner_name}`, item.sector_name, item.due_date && `Prazo ${formatDate(item.due_date)}`, `por ${item.author ?? "—"}`]
          .filter(Boolean).join(" · ")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {item.task_id ? (
          item.task_visible ? (
            <Link to={`/operacoes/tarefas?tarefa=${item.task_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline" data-testid="ops-meeting-item-task">
              {item.task_done ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> : <ClipboardCheck className="size-3.5" aria-hidden />}
              Tarefa #{item.task_number} · {item.task_status}
            </Link>
          ) : <span className="text-xs text-slate-500">Virou a tarefa #{item.task_number} (de outro setor)</span>
        ) : makesTask && open && d.can.task ? (
          <>
            <Button variant="secondary" className="px-2.5 py-1 text-xs" loading={busy} disabled={needsAssign || noSector} onClick={onTask}
              aria-label={`Criar tarefa: ${item.body}`}>
              <ListPlus className="size-3.5" aria-hidden /> Criar tarefa
            </Button>
            {needsAssign && <span className="text-xs text-slate-500">Dar tarefa a outra pessoa exige "Atribuir responsáveis".</span>}
            {noSector && <span className="text-xs text-slate-500">Informe o setor (no item ou na reunião) para criar a tarefa.</span>}
          </>
        ) : null}
        {!item.task_id && (item.created_by === ctx.me || d.can.edit) && (
          <Button variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={onRemove} aria-label={`Retirar item: ${item.body}`}>Retirar</Button>
        )}
      </div>
    </li>
  );
}

function ItemForm({ d, ctx }: { d: OpsMeetingDetail; ctx: TasksContext }) {
  const [kind, setKind] = useState<OpsMeetingItemKind>("pendencia");
  const [body, setBody] = useState("");
  const [owner, setOwner] = useState("");
  const [sector, setSector] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useAddMeetingItem();
  const withTask = opsMeetingItemMakesTask(kind);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (body.trim().length < 2) return setError("Escreva o item.");
    try {
      await add.mutateAsync({ meetingId: d.meeting.id, kind, body, ownerId: owner, sectorId: sector, dueDate: withTask ? due : "" });
      setBody(""); setDue("");
    } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="ops-meeting-item-form">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Registrar na reunião</p>
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Tipo do item" className="w-auto py-1.5" value={kind} onChange={(e) => setKind(e.target.value as OpsMeetingItemKind)}>
          {OPS_MEETING_ITEM_KINDS.map((k) => <option key={k} value={k}>{OPS_MEETING_ITEM_LABELS[k]}</option>)}
        </Select>
        <Select aria-label="Responsável do item" className="w-auto py-1.5" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Sem responsável</option>
          {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Setor do item" className="w-auto py-1.5" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">Setor da reunião</option>
          {ctx.sectors.filter((s) => s.status === "ativo").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {withTask && <Input aria-label="Prazo do item" type="date" className="w-auto py-1.5" value={due} onChange={(e) => setDue(e.target.value)} />}
      </div>
      <Textarea aria-label="Texto do item" className="min-h-14" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)}
        placeholder={kind === "decisao" ? "Ex.: Paleta azul aprovada" : kind === "bloqueio" ? "Ex.: Sem acesso ao Drive do cliente" : "Ex.: Refazer o banner da campanha"} />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end"><Button type="submit" className="px-3 py-1.5 text-xs" loading={add.isPending}>Registrar</Button></div>
    </form>
  );
}

/** Painel da reunião: dados, participantes, pauta, ata, itens (pendência → tarefa) e histórico. */
export function MeetingDrawer({ id, ctx, onClose }: { id: string; ctx: TasksContext; onClose: () => void }) {
  const q = useMeeting(id);
  const categories = useMeetingCategories();
  const toTask = useItemToTask();
  const remove = useRemoveMeetingItem();
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const d = q.data;
  const m = d?.meeting;
  const names = useMemo(() => ({ status: (x: string) => ctx.statuses.find((s) => s.id === x)?.name ?? x }), [ctx.statuses]);

  async function makeTask(item: OpsMeetingItem) {
    setError(null); setNotice(null); setBusyItem(item.id);
    try { await toTask.mutateAsync(item.id); setNotice("Tarefa criada. Ela já aparece para o setor e para o responsável."); } catch (err) { setError(errorMessage(err)); }
    setBusyItem(null);
  }
  async function removeItem(item: OpsMeetingItem) {
    setError(null);
    try { await remove.mutateAsync(item.id); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={m ? `Reunião #${m.number}` : "Reunião"} data-testid="ops-meeting-drawer"
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-400">{m ? `Reunião #${m.number}` : " "}{m && <MeetingStatusBadge status={m.status} />}</p>
            <h2 className="break-words text-lg font-bold text-slate-900">{m?.title ?? "Carregando…"}</h2>
          </div>
          {d && m && d.can.edit && m.status !== "cancelada" && (
            <>
              <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setEditing(true)}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
              <Button className="px-2.5 py-1.5 text-xs" onClick={() => setRecording(true)}><ClipboardCheck className="size-3.5" aria-hidden /> {m.status === "realizada" ? "Ata e presença" : "Registrar reunião"}</Button>
            </>
          )}
          {d && m && d.can.edit && m.status === "agendada" && (
            <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => setCancelling(true)}><Ban className="size-3.5" aria-hidden /> Cancelar</Button>
          )}
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar reunião"><X className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {q.error && <Alert tone="error">{errorMessage(q.error)}</Alert>}
          {q.isLoading && <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />}
          {d && m && (
            <>
              {error && <Alert tone="error">{error}</Alert>}
              {notice && <Alert tone="success">{notice}</Alert>}
              {m.status === "cancelada" && <Alert tone="warning">Cancelada: {m.cancel_reason}</Alert>}
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Row label="Tipo"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: m.color }} aria-hidden />{m.category_name}</span></Row>
                <Row label="Quando (horário de Brasília)"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5 text-slate-400" aria-hidden />{meetingWhen(m.starts_at, m.duration_min)}</span></Row>
                <Row label="Setor">{m.sector_name ?? "Várias áreas"}</Row>
                <Row label="Cliente">{m.client_name}</Row>
                <Row label="Local">
                  {m.location && (isUrl(m.location)
                    ? <a href={m.location.trim()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">Abrir link da chamada <ExternalLink className="size-3.5" aria-hidden /></a>
                    : <span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-slate-400" aria-hidden />{m.location}</span>)}
                </Row>
                <Row label="Organização">{m.organizer_name}</Row>
              </dl>
              <section className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Participantes ({d.people.length})</h3>
                {d.people.length === 0 ? <p className="text-sm text-slate-500">Ninguém na lista.</p> : (
                  <ul className="flex flex-wrap gap-1.5" data-testid="ops-meeting-attendance">
                    {d.people.map((p) => (
                      <li key={p.user_id} className={cn("rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                        p.attended === true ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : p.attended === false ? "bg-slate-50 text-slate-400 line-through ring-slate-200" : "bg-white text-slate-700 ring-slate-200")}>
                        {p.name}{p.attended === true ? " · presente" : p.attended === false ? " · ausente" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {m.agenda && (
                <section className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Pauta</h3>
                  <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{m.agenda}</p>
                </section>
              )}
              {m.status === "realizada" && (
                <section className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Ata</h3>
                  <p className="whitespace-pre-wrap break-words rounded-xl bg-emerald-50/60 p-3 text-sm text-slate-700 ring-1 ring-emerald-100" data-testid="ops-meeting-notes">
                    {m.notes ?? "Sem resumo escrito."}
                  </p>
                </section>
              )}

              <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Objetivos, pendências, decisões e bloqueios</h3>
                {d.items.length === 0 && <p className="text-sm text-slate-500">Nada registrado ainda.</p>}
                {OPS_MEETING_ITEM_KINDS.map((k) => {
                  const list = d.items.filter((i) => i.kind === k);
                  if (list.length === 0) return null;
                  return (
                    <div key={k} className="space-y-1.5">
                      <p className="text-sm font-semibold text-slate-700">{OPS_MEETING_ITEM_LABELS[k]} ({list.length})</p>
                      <ul className="space-y-1.5">
                        {list.map((i) => <ItemRow key={i.id} item={i} d={d} ctx={ctx} busy={busyItem === i.id} onTask={() => makeTask(i)} onRemove={() => removeItem(i)} />)}
                      </ul>
                    </div>
                  );
                })}
                {!d.can.task && d.items.some((i) => opsMeetingItemMakesTask(i.kind) && !i.task_id) && (
                  <p className="text-xs text-slate-500">Transformar pendência em tarefa exige a permissão "Criar tarefas".</p>
                )}
                {d.can.add && m.status !== "cancelada" && <ItemForm d={d} ctx={ctx} />}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Histórico da reunião</h3>
                <ol className="space-y-2 border-l-2 border-slate-100 pl-4" data-testid="ops-meeting-history">
                  {d.events.map((e) => {
                    const t = activityText(e, names);
                    return (
                      <li key={e.id} className="text-sm">
                        <span className="font-medium text-slate-800">{ACTION_LABELS[e.action] ?? e.action}</span>
                        {t && <span className="text-slate-600"> · {t}</span>}
                        <p className="text-xs text-slate-400">{e.origin === "sistema" ? "Sistema" : e.actor ?? "—"} · {formatDateTime(e.created_at)}</p>
                      </li>
                    );
                  })}
                </ol>
              </section>
              <p className="text-xs text-slate-400">Nada é apagado: item retirado e reunião cancelada continuam no histórico.</p>
            </>
          )}
        </div>
      </aside>
      {editing && d && categories.data && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <MeetingFormModal meeting={d.meeting} people={d.people.map((p) => p.user_id)} categories={categories.data} ctx={ctx} onClose={() => setEditing(false)} />
        </div>
      )}
      {recording && d && <div onMouseDown={(e) => e.stopPropagation()}><RecordModal d={d} onClose={() => setRecording(false)} /></div>}
      {cancelling && d && <div onMouseDown={(e) => e.stopPropagation()}><CancelModal d={d} onClose={() => setCancelling(false)} /></div>}
    </div>
  );
}
