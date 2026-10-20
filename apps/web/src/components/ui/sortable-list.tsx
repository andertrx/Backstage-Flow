import {
  closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn.ts";

/** Move o item `from` para a posição `to` (lista nova; a original não muda). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Lista para pôr em ordem arrastando (mouse, dedo ou teclado: Espaço para pegar,
 * setas para mover, Espaço para soltar). Cada linha tem a alça ⠿ à esquerda.
 */
export function SortableList<T extends string>({ items, onReorder, children, label, testId }: {
  items: T[];
  onReorder: (next: T[]) => void;
  children: (item: T) => ReactNode;
  /** Nome de cada item para leitores de tela ("Arrastar <nome>"). */
  label: (item: T) => string;
  testId?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(moveItem(items, items.indexOf(active.id as T), items.indexOf(over.id as T)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200" data-testid={testId}>
        {items.map((item) => (
          <Row key={item} id={item} label={label(item)}>{children(item)}</Row>
        ))}
      </ul>
    </DndContext>
  );
}

function Row({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const drag = useDraggable({ id });
  const drop = useDroppable({ id });
  const t = drag.transform;
  return (
    <li
      ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el); }}
      data-sortable-item={id}
      style={t ? { transform: `translate3d(0, ${Math.round(t.y)}px, 0)` } : undefined}
      className={cn("relative flex items-center gap-2 bg-white px-2 py-1.5 text-sm",
        drag.isDragging && "z-10 rounded-lg shadow-lg ring-1 ring-blue-300",
        drop.isOver && !drag.isDragging && "bg-blue-50")}
    >
      <button type="button" {...drag.listeners} {...drag.attributes} aria-label={`Arrastar ${label}`}
        className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing">
        <GripVertical className="size-4" aria-hidden />
      </button>
      {children}
    </li>
  );
}
