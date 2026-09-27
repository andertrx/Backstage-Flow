import { OPS_MY_SECTION_LABELS, OPS_MY_SECTIONS, type OpsMySection, opsMySection, opsToday } from "@backstage/shared";
import { ListChecks, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { usePersistentState } from "@/lib/usePersistentState.ts";
import { KanbanBoard } from "./KanbanBoard.tsx";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { TaskCard } from "./TaskBits.tsx";
import { TaskFormModal } from "./TaskFormModal.tsx";
import { type TaskView, ViewToggle } from "./TasksPage.tsx";
import { type OpsTaskRow, useOpsTasks } from "./tasksApi.ts";
import { TaskDetailHost, useOpenTask, useTasksContext } from "./tasksContext.tsx";

const SECTION_TONE: Partial<Record<OpsMySection, string>> = {
  atrasadas: "text-red-600",
  hoje: "text-amber-700",
  minha_acao: "text-blue-700",
  concluidas: "text-emerald-700",
};

/** Minhas tarefas: onde sou responsável, aprovador ou observador. */
export function MyTasksPage() {
  const ctx = useTasksContext();
  const { open } = useOpenTask();
  const canKanban = ctx.can("ops.kanban.view");
  const [savedView, setView] = usePersistentState<TaskView>("ops.mytasks.view", "lista");
  const view: TaskView = canKanban ? savedView : "lista";
  const [creating, setCreating] = useState(false);
  const tasks = useOpsTasks({ mine: true }, !ctx.loading);
  const today = opsToday();
  const sectorById = useMemo(() => new Map(ctx.sectors.map((s) => [s.id, s])), [ctx.sectors]);

  const groups = useMemo(() => {
    const g = new Map<OpsMySection, OpsTaskRow[]>();
    for (const t of tasks.data ?? []) {
      const s = opsMySection(t, ctx.me, today);
      if (s) g.set(s, [...(g.get(s) ?? []), t]);
    }
    return g;
  }, [tasks.data, ctx.me, today]);

  const counts = (["atrasadas", "hoje", "minha_acao", "andamento"] as const).map((s) => ({ s, n: groups.get(s)?.length ?? 0 }));

  return (
    <div className="space-y-4" data-testid="ops-my-tasks">
      <OpsModuleHeader number="01" icon={ListChecks} title="Minhas tarefas" description="O que está com você: atrasadas, para hoje, esperando sua ação e próximos prazos." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-2">
          {counts.map(({ s, n }) => (
            <span key={s} className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200" data-testid={`ops-my-count-${s}`}>
              <span className={cn("text-lg font-black", n > 0 ? SECTION_TONE[s] ?? "text-slate-900" : "text-slate-300")}>{n}</span>
              <span className="ml-1.5 text-slate-600">{OPS_MY_SECTION_LABELS[s]}</span>
            </span>
          ))}
        </div>
        <ViewToggle view={view} onChange={setView} canKanban={canKanban} />
        {ctx.can("ops.tasks.create") && <Button onClick={() => setCreating(true)} disabled={ctx.loading}><Plus className="size-4" aria-hidden /> Nova tarefa</Button>}
      </div>

      {ctx.error || tasks.error ? <Alert tone="error">{errorMessage(ctx.error ?? tasks.error)}</Alert> : null}
      {ctx.loading || tasks.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : view === "kanban" ? (
        <KanbanBoard tasks={tasks.data ?? []} statuses={ctx.statuses} sectors={ctx.sectors} today={today}
          canMove={ctx.can("ops.cards.move") || ctx.can("ops.tasks.edit")} onOpen={open} />
      ) : groups.size === 0 ? (
        <Card className="space-y-2 p-8 text-center" data-testid="ops-my-empty">
          <ListChecks className="mx-auto size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">Nada com você agora.</p>
          <p className="text-sm text-slate-500">Quando alguém colocar você numa tarefa, ela aparece aqui.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {OPS_MY_SECTIONS.filter((s) => groups.has(s)).map((s) => (
            <section key={s} className="space-y-2" data-testid="ops-my-section" data-section={s}>
              <h2 className={cn("text-sm font-bold uppercase tracking-wide", SECTION_TONE[s] ?? "text-slate-600")}>
                {OPS_MY_SECTION_LABELS[s]} <span className="text-slate-400">({groups.get(s)?.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {groups.get(s)?.map((t) => (
                  <TaskCard key={t.id} task={t} today={today} showStatus sectorName={sectorById.get(t.sector_id)?.name}
                    sectorColor={sectorById.get(t.sector_id)?.color} onOpen={() => open(t.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {creating && (
        <TaskFormModal detail={null} sectors={ctx.sectors} statuses={ctx.statuses} directory={ctx.directory} me={ctx.me} mySector={ctx.mySector}
          canAssign={ctx.can("ops.tasks.assign")} canChangeSector onClose={() => setCreating(false)} onSaved={open} />
      )}
      <TaskDetailHost ctx={ctx} />
    </div>
  );
}
