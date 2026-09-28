import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { type ReactNode, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import type { OpsSector } from "./api.ts";
import { TaskCard } from "./TaskBits.tsx";
import { type OpsStatus, type OpsTaskRow, useSetTaskStatus } from "./tasksApi.ts";

export interface BoardColumn {
  id: string;
  name: string;
  color: string;
  hint?: string;
}

function DraggableCard({ id, label, children, disabled }: { id: string; label: string; children: ReactNode; disabled: boolean }) {
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({ id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} data-testid="ops-kanban-card" data-task={label}
      className={cn("touch-manipulation", isDragging && "relative z-30 rotate-1 opacity-90 shadow-xl")}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}>
      {children}
    </div>
  );
}

function Column({ column, count, children }: { column: BoardColumn; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section ref={setNodeRef} aria-label={`${column.name}: ${count}`} data-testid="ops-kanban-column" data-status={column.id}
      className={cn("flex w-72 shrink-0 flex-col rounded-2xl bg-slate-100/80 p-2 ring-1 ring-inset transition", isOver ? "ring-2 ring-blue-400" : "ring-slate-200")}>
      <header className="px-2 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: column.color }} aria-hidden />
          <h3 className="text-sm font-bold text-slate-800">{column.name}</h3>
          <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{count}</span>
        </div>
        {column.hint && <p className="mt-0.5 text-[11px] text-slate-400">{column.hint}</p>}
      </header>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

/**
 * Quadro com arrastar e soltar, genérico (status, filas por setor, etapas do
 * cliente). Arrastar chama onMove; se o banco recusar, o erro aparece e o
 * cartão volta (a lista é recarregada). Sem permissão, os cartões ficam parados.
 */
export function DndBoard<T>({ items, columns, getId, getLabel, columnOf, renderCard, canDrag, onMove, empty = "Nenhuma tarefa" }: {
  items: T[];
  columns: BoardColumn[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  columnOf: (item: T) => string | null;
  renderCard: (item: T) => ReactNode;
  canDrag: (item: T) => boolean;
  onMove: (item: T, columnId: string) => Promise<void>;
  empty?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function onDragEnd(e: DragEndEvent) {
    const item = items.find((t) => getId(t) === e.active.id);
    const to = e.over?.id ? String(e.over.id) : null;
    if (!item || !to || to === columnOf(item)) return;
    setError(null);
    setBusy(true);
    try {
      await onMove(item, to);
    } catch (err) {
      setError(`${getLabel(item)}: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3" data-testid="ops-kanban">
          {columns.map((c) => {
            const list = items.filter((t) => columnOf(t) === c.id);
            return (
              <Column key={c.id} column={c} count={list.length}>
                {list.map((t) => (
                  <DraggableCard key={getId(t)} id={getId(t)} label={getLabel(t).replace(/^#/, "")} disabled={!canDrag(t) || busy}>
                    {renderCard(t)}
                  </DraggableCard>
                ))}
                {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">{empty}</p>}
              </Column>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

/** Kanban por status (Central de Tarefas e Minhas tarefas). */
export function KanbanBoard({ tasks, statuses, sectors, today, canMove, onOpen }: {
  tasks: OpsTaskRow[];
  statuses: OpsStatus[];
  sectors: OpsSector[];
  today: string;
  canMove: boolean;
  onOpen: (id: string) => void;
}) {
  const setStatus = useSetTaskStatus();
  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const columns = statuses.filter((s) => s.active || tasks.some((t) => t.status_id === s.id));
  return (
    <DndBoard items={tasks} columns={columns} getId={(t) => t.id} getLabel={(t) => `#${t.number}`} columnOf={(t) => t.status_id}
      canDrag={() => canMove}
      onMove={async (t, to) => { await setStatus.mutateAsync({ id: t.id, version: t.version, statusId: to }); }}
      renderCard={(t) => (
        <TaskCard task={t} today={today} sectorName={sectorById.get(t.sector_id)?.name} sectorColor={sectorById.get(t.sector_id)?.color} onOpen={() => onOpen(t.id)} />
      )} />
  );
}
