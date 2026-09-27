import { OPS_PRIORITY_LABELS, type OpsPriority, opsIsClosed } from "@backstage/shared";
import { CalendarClock, Link2, MessageSquare, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn.ts";
import { formatDate } from "@/lib/format.ts";
import type { OpsTaskPerson, OpsTaskRow } from "./tasksApi.ts";

export function initials(name: string) {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

export function StatusPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-slate-800"
      style={{ background: `${color}24` }}>
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      {name}
    </span>
  );
}

const PRIORITY_STYLE: Record<OpsPriority, string> = {
  baixa: "bg-slate-100 text-slate-600",
  media: "bg-sky-50 text-sky-700",
  alta: "bg-amber-50 text-amber-800",
  urgente: "bg-red-50 text-red-700",
};

export function PriorityBadge({ priority }: { priority: OpsPriority }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold", PRIORITY_STYLE[priority])}>
      {OPS_PRIORITY_LABELS[priority]}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span title={name} className={cn("flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 ring-2 ring-white", className)}>
      {initials(name)}
    </span>
  );
}

/** Responsáveis (principal primeiro). Aprovadores e observadores ficam no detalhe. */
export function PeopleStack({ people }: { people: OpsTaskPerson[] }) {
  const doers = people.filter((p) => p.role === "principal" || p.role === "adicional");
  if (!doers.length) return <span className="text-xs text-slate-400">Sem responsável</span>;
  return (
    <span className="flex -space-x-1.5" aria-label={`Responsáveis: ${doers.map((p) => p.name).join(", ")}`}>
      {doers.slice(0, 3).map((p) => <Avatar key={p.user_id} name={p.name} />)}
      {doers.length > 3 && <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 ring-2 ring-white">+{doers.length - 3}</span>}
    </span>
  );
}

export function DueLabel({ task, today }: { task: Pick<OpsTaskRow, "due_date" | "category">; today: string }) {
  if (!task.due_date) return <span className="text-xs text-slate-400">Sem prazo</span>;
  const late = task.due_date < today && !opsIsClosed(task.category);
  const isToday = task.due_date === today && !opsIsClosed(task.category);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", late ? "text-red-600" : isToday ? "text-amber-700" : "text-slate-500")}>
      <CalendarClock className="size-3.5" aria-hidden />
      {late ? "Atrasada · " : isToday ? "Hoje · " : ""}{formatDate(task.due_date)}
    </span>
  );
}

function Counter({ icon, n, label }: { icon: ReactNode; n: number; label: string }) {
  if (!n) return null;
  return <span className="inline-flex items-center gap-0.5 text-xs text-slate-500" aria-label={`${n} ${label}`}>{icon}{n}</span>;
}

/** Cartão da tarefa (Kanban e Minhas tarefas). */
export function TaskCard({ task, today, sectorName, sectorColor, onOpen, showStatus }: {
  task: OpsTaskRow;
  today: string;
  sectorName?: string;
  sectorColor?: string;
  onOpen: () => void;
  showStatus?: boolean;
}) {
  return (
    <button type="button" onClick={onOpen} data-testid="ops-task-card"
      className="block w-full space-y-2 rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-400">#{task.number}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{task.title}</p>
      {task.client_name && <p className="truncate text-xs text-slate-500">{task.client_name}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {showStatus && <StatusPill name={task.status_name} color={task.status_color} />}
        {sectorName && (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-slate-700" style={{ background: `${sectorColor ?? "#64748B"}1f` }}>
            <span className="size-1.5 rounded-full" style={{ background: sectorColor }} aria-hidden />{sectorName}
          </span>
        )}
        {task.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{t}</span>)}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <DueLabel task={task} today={today} />
        <span className="flex items-center gap-2">
          {task.blockers > 0 && <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600" title="Depende de tarefa ainda aberta"><Link2 className="size-3.5" aria-hidden />{task.blockers}</span>}
          <Counter icon={<MessageSquare className="size-3.5" aria-hidden />} n={task.comments} label="comentários" />
          <Counter icon={<Paperclip className="size-3.5" aria-hidden />} n={task.attachments} label="anexos" />
          <PeopleStack people={task.people} />
        </span>
      </div>
    </button>
  );
}
