import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { type ReactNode, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import type { OpsSector } from "./api.ts";
import { TaskCard } from "./TaskBits.tsx";
import { type OpsStatus, type OpsTaskRow, useSetTaskStatus } from "./tasksApi.ts";

function DraggableCard({ task, children, disabled }: { task: OpsTaskRow; children: ReactNode; disabled: boolean }) {
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({ id: task.id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} data-testid="ops-kanban-card" data-task={task.number}
      className={cn("touch-manipulation", isDragging && "relative z-30 rotate-1 opacity-90 shadow-xl")}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}>
      {children}
    </div>
  );
}

function Column({ status, count, children }: { status: OpsStatus; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <section ref={setNodeRef} aria-label={`${status.name}: ${count} tarefa(s)`} data-testid="ops-kanban-column" data-status={status.id}
      className={cn("flex w-72 shrink-0 flex-col rounded-2xl bg-slate-100/80 p-2 ring-1 ring-inset transition", isOver ? "ring-2 ring-blue-400" : "ring-slate-200")}>
      <header className="flex items-center gap-2 px-2 pb-2 pt-1">
        <span className="size-2.5 rounded-full" style={{ background: status.color }} aria-hidden />
        <h3 className="text-sm font-bold text-slate-800">{status.name}</h3>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{count}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

/**
 * Kanban por status. Arrastar muda o status na hora (e volta se o banco
 * recusar). Sem permissão de mover, os cartões ficam parados; o status também
 * muda pelo detalhe da tarefa (útil no teclado).
 */
export function KanbanBoard({ tasks, statuses, sectors, today, canMove, onOpen }: {
  tasks: OpsTaskRow[];
  statuses: OpsStatus[];
  sectors: OpsSector[];
  today: string;
  canMove: boolean;
  onOpen: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const setStatus = useSetTaskStatus();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const columns = statuses.filter((s) => s.active || tasks.some((t) => t.status_id === s.id));

  async function onDragEnd(e: DragEndEvent) {
    const task = tasks.find((t) => t.id === e.active.id);
    const to = e.over?.id ? String(e.over.id) : null;
    if (!task || !to || to === task.status_id) return;
    setError(null);
    try {
      await setStatus.mutateAsync({ id: task.id, version: task.version, statusId: to });
    } catch (err) {
      setError(`#${task.number}: ${errorMessage(err)}`);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3" data-testid="ops-kanban">
          {columns.map((s) => {
            const list = tasks.filter((t) => t.status_id === s.id);
            return (
              <Column key={s.id} status={s} count={list.length}>
                {list.map((t) => (
                  <DraggableCard key={t.id} task={t} disabled={!canMove || setStatus.isPending}>
                    <TaskCard task={t} today={today} sectorName={sectorById.get(t.sector_id)?.name} sectorColor={sectorById.get(t.sector_id)?.color} onOpen={() => onOpen(t.id)} />
                  </DraggableCard>
                ))}
                {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Nenhuma tarefa</p>}
              </Column>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}
