import { OPS_PRIORITIES, OPS_PRIORITY_LABELS, opsToday } from "@backstage/shared";
import { ClipboardList, Columns3, List, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { useDebouncedValue } from "@/lib/useDebouncedValue.ts";
import { usePersistentState } from "@/lib/usePersistentState.ts";
import { KanbanBoard } from "./KanbanBoard.tsx";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { DueLabel, PeopleStack, PriorityBadge, StatusPill } from "./TaskBits.tsx";
import { TaskFormModal } from "./TaskFormModal.tsx";
import { type OpsTaskFilters, type OpsTaskRow, useOpsTasks } from "./tasksApi.ts";
import { TaskDetailHost, type TasksContext, useOpenTask, useTasksContext } from "./tasksContext.tsx";

export type TaskView = "lista" | "kanban";

export function ViewToggle({ view, onChange, canKanban }: { view: TaskView; onChange: (v: TaskView) => void; canKanban: boolean }) {
  if (!canKanban) return null;
  const item = (v: TaskView, label: string, Icon: typeof List) => (
    <button type="button" onClick={() => onChange(v)} aria-pressed={view === v}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition",
        view === v ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800")}>
      <Icon className="size-4" aria-hidden />{label}
    </button>
  );
  return <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Forma de ver">{item("kanban", "Kanban", Columns3)}{item("lista", "Lista", List)}</div>;
}

export function TaskTable({ tasks, ctx, today, onOpen }: { tasks: OpsTaskRow[]; ctx: TasksContext; today: string; onOpen: (id: string) => void }) {
  const sectorById = new Map(ctx.sectors.map((s) => [s.id, s]));
  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="ops-task-table">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Tarefa</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Prioridade</th>
            <th className="px-4 py-3">Setor</th>
            <th className="px-4 py-3">Responsáveis</th>
            <th className="px-4 py-3">Prazo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((t) => (
            <tr key={t.id} className="cursor-pointer hover:bg-blue-50/40" onClick={() => onOpen(t.id)} data-testid="ops-task-row">
              <td className="px-4 py-3">
                <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}>
                  <span className="text-xs font-semibold text-slate-400">#{t.number} </span>
                  <span className="font-semibold text-slate-900">{t.title}</span>
                  <span className="block text-xs text-slate-500">{t.client_name ?? "Tarefa interna"}{t.blockers > 0 ? " · depende de outra tarefa" : ""}</span>
                </button>
              </td>
              <td className="px-4 py-3"><StatusPill name={t.status_name} color={t.status_color} /></td>
              <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
              <td className="px-4 py-3 text-slate-600">{sectorById.get(t.sector_id)?.name ?? "—"}</td>
              <td className="px-4 py-3"><PeopleStack people={t.people} /></td>
              <td className="px-4 py-3"><DueLabel task={t} today={today} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Central de Tarefas (36.2): todas as tarefas que a pessoa pode ver, em lista ou Kanban. */
export function TasksPage() {
  const ctx = useTasksContext();
  const { open } = useOpenTask();
  const canKanban = ctx.can("ops.kanban.view");
  const [savedView, setView] = usePersistentState<TaskView>("ops.tasks.view", "kanban");
  const view: TaskView = canKanban ? savedView : "lista";
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Omit<OpsTaskFilters, "q">>({});
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(q.trim(), 300);
  const f = useMemo(() => ({ ...filters, q: debounced || undefined, archived: view === "kanban" ? false : filters.archived }), [filters, debounced, view]);
  const tasks = useOpsTasks(f, !ctx.loading);
  const today = opsToday();
  const set = (k: keyof OpsTaskFilters, v: string | boolean) => setFilters((p) => {
    const next = { ...p } as Record<string, unknown>;
    if (v === "" || v === false) delete next[k]; else next[k] = k === "status_ids" || k === "priorities" ? [v] : v;
    return next as OpsTaskFilters;
  });
  const active = Object.keys(filters).length > 0 || Boolean(debounced);

  return (
    <div className="space-y-4" data-testid="ops-tasks">
      <OpsModuleHeader number="02" icon={ClipboardList} title="Central de Tarefas" description="Todas as tarefas que você pode ver: por status, setor, cliente e responsável." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input aria-label="Buscar tarefa" placeholder="Buscar por título, descrição, cliente ou #número" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ViewToggle view={view} onChange={setView} canKanban={canKanban} />
        {ctx.can("ops.tasks.create") && <Button onClick={() => setCreating(true)} disabled={ctx.loading}><Plus className="size-4" aria-hidden /> Nova tarefa</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Filtrar por cliente" className="w-auto" value={filters.client_id ?? ""} onChange={(e) => set("client_id", e.target.value)}>
          <option value="">Todos os clientes</option>
          {ctx.directory.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por setor" className="w-auto" value={filters.sector_id ?? ""} onChange={(e) => set("sector_id", e.target.value)}>
          <option value="">Todos os setores</option>
          {ctx.sectors.filter((s) => s.status !== "arquivado").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {view === "lista" && (
          <Select aria-label="Filtrar por status" className="w-auto" value={filters.status_ids?.[0] ?? ""} onChange={(e) => set("status_ids", e.target.value)}>
            <option value="">Todos os status</option>
            {ctx.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        )}
        <Select aria-label="Filtrar por prioridade" className="w-auto" value={filters.priorities?.[0] ?? ""} onChange={(e) => set("priorities", e.target.value)}>
          <option value="">Todas as prioridades</option>
          {OPS_PRIORITIES.map((p) => <option key={p} value={p}>{OPS_PRIORITY_LABELS[p]}</option>)}
        </Select>
        <Select aria-label="Filtrar por responsável" className="w-auto" value={filters.person_id ?? ""} onChange={(e) => set("person_id", e.target.value)}>
          <option value="">Todas as pessoas</option>
          <option value="nenhum">Sem responsável</option>
          {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por prazo" className="w-auto" value={filters.due ?? ""} onChange={(e) => set("due", e.target.value)}>
          <option value="">Qualquer prazo</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="hoje">Vencem hoje</option>
          <option value="semana">Próximos 7 dias</option>
          <option value="sem_prazo">Sem prazo</option>
        </Select>
        {view === "lista" && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={Boolean(filters.archived)} onChange={(e) => set("archived", e.target.checked)} /> Só arquivadas
          </label>
        )}
        {active && <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setFilters({}); setQ(""); }}>Limpar filtros</Button>}
      </div>

      {ctx.error || tasks.error ? <Alert tone="error">{errorMessage(ctx.error ?? tasks.error)}</Alert> : null}
      {ctx.loading || tasks.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : view === "kanban" ? (
        <KanbanBoard tasks={tasks.data ?? []} statuses={ctx.statuses} sectors={ctx.sectors} today={today}
          canMove={ctx.can("ops.cards.move") || ctx.can("ops.tasks.edit")} onOpen={open} />
      ) : (tasks.data ?? []).length === 0 ? (
        <Card className="space-y-2 p-8 text-center" data-testid="ops-tasks-empty">
          <ClipboardList className="mx-auto size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">{active ? "Nenhuma tarefa com esses filtros." : "Nenhuma tarefa ainda."}</p>
        </Card>
      ) : (
        <TaskTable tasks={tasks.data ?? []} ctx={ctx} today={today} onOpen={open} />
      )}
      {(tasks.data?.length ?? 0) >= 500 && <p className="text-xs text-slate-500">Mostrando as 500 primeiras. Use os filtros para achar as demais.</p>}

      {creating && (
        <TaskFormModal detail={null} sectors={ctx.sectors} statuses={ctx.statuses} directory={ctx.directory} me={ctx.me} mySector={ctx.mySector}
          canAssign={ctx.can("ops.tasks.assign")} canChangeSector onClose={() => setCreating(false)} onSaved={open} />
      )}
      <TaskDetailHost ctx={ctx} />
    </div>
  );
}
