import { OPS_MEETING_STATUSES, OPS_MEETING_STATUS_LABELS, opsAddDays, opsGroupMeetingsByDay, opsMeetingSpan, opsToday } from "@backstage/shared";
import { CalendarDays, History, ListTodo, Plus, Search, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate } from "@/lib/format.ts";
import { useDebouncedValue } from "@/lib/useDebouncedValue.ts";
import { usePersistentState } from "@/lib/usePersistentState.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { SavedViews } from "./SavedViews.tsx";
import { MeetingDrawer, MeetingFormModal, MeetingStatusBadge, meetingWhen } from "./Meetings.tsx";
import { type OpsMeetingFilters, type OpsMeetingRow, useMeetingCategories, useMeetingList } from "./meetingsApi.ts";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { RequireOps } from "./OpsLayout.tsx";
import { useTasksContext } from "./tasksContext.tsx";

export function useOpenMeeting() {
  const [params, update] = useSearchParamsUpdater();
  const openId = params.get("reuniao");
  const open = useCallback((id: string) => update((p) => { p.set("reuniao", id); return p; }), [update]);
  const close = useCallback(() => update((p) => { p.delete("reuniao"); return p; }), [update]);
  return { openId, open, close };
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function dayTitle(day: string, today: string) {
  if (day === today) return "Hoje";
  if (day === opsAddDays(today, 1)) return "Amanhã";
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${formatDate(day)}`;
}

export function MeetingRowCard({ m, onOpen, showDate }: { m: OpsMeetingRow; onOpen: () => void; showDate?: boolean }) {
  return (
    <button type="button" onClick={onOpen} data-testid="ops-meeting-row"
      className={cn("flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400",
        m.status === "cancelada" && "opacity-60")}>
      <span className="w-28 shrink-0 text-sm font-semibold tabular-nums text-slate-700">{showDate ? meetingWhen(m.starts_at, m.duration_min) : opsMeetingSpan(m.starts_at, m.duration_min)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><span className="size-2 rounded-full" style={{ background: m.color }} aria-hidden />{m.category_name}</span>
          <MeetingStatusBadge status={m.status} />
          <span className="text-[11px] font-semibold text-slate-400">#{m.number}</span>
        </span>
        <span className={cn("block truncate text-sm font-semibold text-slate-900", m.status === "cancelada" && "line-through")}>{m.title}</span>
        <span className="block truncate text-xs text-slate-500">{[m.sector_name ?? "Várias áreas", m.client_name, m.organizer_name && `organiza ${m.organizer_name}`].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{m.status === "realizada" ? `${m.attended_count}/${m.people_count}` : m.people_count}</span>
        {m.open_items > 0 && <span className="font-semibold text-amber-700">{m.open_items} pendência(s) sem tarefa</span>}
        {m.tasks_count > 0 && <span className="inline-flex items-center gap-1 text-blue-700"><ListTodo className="size-3.5" aria-hidden />{m.tasks_count} tarefa(s)</span>}
      </span>
    </button>
  );
}

type View = "agenda" | "historico";
const MEETING_VIEW_KEYS = ["from", "to", "category_id", "sector_id", "client_id", "person_id", "status", "mine"] as const;

/** Dailies e reuniões: agenda (de hoje em diante) e histórico com filtros. */
export function MeetingsPage() {
  const ctx = useTasksContext();
  const { openId, open, close } = useOpenMeeting();
  const categories = useMeetingCategories();
  const [view, setView] = usePersistentState<View>("ops.meetings.view", "agenda");
  const [mine, setMine] = usePersistentState<boolean>("ops.meetings.mine", false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [sector, setSector] = useState("");
  const [client, setClient] = useState("");
  const [person, setPerson] = useState("");
  const [status, setStatus] = useState("");
  const today = opsToday();
  const debounced = useDebouncedValue(q.trim(), 300);
  const f = useMemo<OpsMeetingFilters>(() => view === "agenda"
    ? { from: today, order: "asc", mine: mine || undefined }
    : { q: debounced || undefined, from: from || undefined, to: to || undefined, category_id: category || undefined, sector_id: sector || undefined,
        client_id: client || undefined, person_id: person || undefined, status: status || undefined, mine: mine || undefined, order: "desc" },
  [view, today, mine, debounced, from, to, category, sector, client, person, status]);
  const list = useMeetingList(f);
  const meetings = list.data?.meetings ?? [];
  const canCreate = list.data?.can.create ?? false;
  const groups = view === "agenda" ? opsGroupMeetingsByDay(meetings) : [];

  return (
    <div className="space-y-4" data-testid="ops-meetings">
      <OpsModuleHeader icon={CalendarDays} title="Dailies e reuniões" description="Agenda, pauta, ata e presença. Pendências viram tarefa com um clique, no setor e com o responsável certo." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="Visão das reuniões">
          {([["agenda", "Agenda", CalendarDays], ["historico", "Histórico", History]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold", view === id ? "bg-blue-600 text-white" : "text-slate-600 hover:text-blue-700")}>
              <Icon className="size-4" aria-hidden />{label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Só as que participo</label>
        {canCreate && <Button className="ml-auto" onClick={() => setCreating(true)} disabled={!categories.data}><Plus className="size-4" aria-hidden /> Nova reunião</Button>}
      </div>
      {view === "historico" && (
        <div className="flex flex-wrap items-center gap-2" data-testid="ops-meeting-filters">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
            <Input aria-label="Buscar reunião" placeholder="Buscar no título, pauta, ata ou #número" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Input aria-label="De" type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input aria-label="Até" type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          <Select aria-label="Filtrar por tipo" className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todos os tipos</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label="Filtrar por setor" className="w-auto" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Todos os setores</option>
            {ctx.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select aria-label="Filtrar por cliente" className="w-auto" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">Todos os clientes</option>
            {ctx.directory.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label="Filtrar por pessoa" className="w-auto" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Todas as pessoas</option>
            {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
          </Select>
          <Select aria-label="Filtrar por situação" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas as situações</option>
            {OPS_MEETING_STATUSES.map((s) => <option key={s} value={s}>{OPS_MEETING_STATUS_LABELS[s]}</option>)}
          </Select>
        </div>
      )}
      {view === "historico" && (
        <SavedViews page="reunioes" keys={MEETING_VIEW_KEYS} current={{ from, to, category_id: category, sector_id: sector, client_id: client, person_id: person, status, mine }}
          onApply={(v) => {
            const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
            setFrom(str("from")); setTo(str("to")); setCategory(str("category_id")); setSector(str("sector_id"));
            setClient(str("client_id")); setPerson(str("person_id")); setStatus(str("status")); setMine(v.mine === true);
          }} />
      )}

      {list.error ? <Alert tone="error">{errorMessage(list.error)}</Alert> : null}
      {list.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : meetings.length === 0 ? (
        <Card className="space-y-2 p-8 text-center" data-testid="ops-meetings-empty">
          <CalendarDays className="mx-auto size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">{view === "agenda" ? "Nenhuma reunião de hoje em diante." : "Nenhuma reunião com esses filtros."}</p>
          {view === "agenda" && canCreate && <p className="text-sm text-slate-500">Use "Nova reunião" para agendar a primeira Daily.</p>}
        </Card>
      ) : view === "agenda" ? (
        <div className="space-y-5" data-testid="ops-meeting-agenda">
          {groups.map((g) => (
            <section key={g.day} className="space-y-2">
              <h3 className="text-sm font-bold capitalize text-slate-700">{dayTitle(g.day, today)}</h3>
              <div className="space-y-2">{g.items.map((m) => <MeetingRowCard key={m.id} m={m} onOpen={() => open(m.id)} />)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-2" data-testid="ops-meeting-history-list">
          {meetings.map((m) => <MeetingRowCard key={m.id} m={m} showDate onOpen={() => open(m.id)} />)}
          {meetings.length >= 300 && <p className="text-xs text-slate-500">Mostrando as 300 mais recentes. Use os filtros para achar reuniões mais antigas.</p>}
        </div>
      )}
      <p className="text-xs text-slate-500">Horários no fuso de Brasília. Hoje: {formatDate(today)}.</p>

      {creating && categories.data && <MeetingFormModal meeting={null} categories={categories.data} ctx={ctx} onClose={() => setCreating(false)} onSaved={open} />}
      {openId && <MeetingDrawer key={openId} id={openId} ctx={ctx} onClose={close} />}
    </div>
  );
}

export function MeetingsRoute() {
  return (
    <RequireOps permission="ops.access">
      <MeetingsPage />
    </RequireOps>
  );
}

/** Aba "Reuniões" na ficha do cliente: reuniões ligadas ao cliente que a pessoa pode ver. */
export function ClientMeetingsList({ clientId }: { clientId: string }) {
  const list = useMeetingList({ client_id: clientId, order: "desc" });
  if (list.isLoading) return <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  if (list.error) return <Alert tone="error">{errorMessage(list.error)}</Alert>;
  const meetings = list.data?.meetings ?? [];
  return (
    <div className="space-y-2" data-testid="client-meetings">
      {meetings.length === 0 ? <Card className="p-6 text-center text-sm text-slate-500">Nenhuma reunião ligada a este cliente.</Card>
        : meetings.map((m) => (
          <Link key={m.id} to={`/operacoes/reunioes?reuniao=${m.id}`} className="block" data-testid="client-meeting-link">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 hover:ring-blue-400">
              <span className="text-sm font-semibold text-slate-700">{meetingWhen(m.starts_at, m.duration_min)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{m.title}</span>
              <MeetingStatusBadge status={m.status} />
              {m.tasks_count > 0 && <span className="text-xs text-blue-700">{m.tasks_count} tarefa(s)</span>}
            </span>
          </Link>
        ))}
      <p className="text-xs text-slate-500">Abrir uma reunião leva para a Central de Operações → Reuniões.</p>
    </div>
  );
}
