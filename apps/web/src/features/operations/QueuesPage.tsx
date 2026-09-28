import { OPS_OTHER_COLUMN, opsQueueColumnFor, opsToday } from "@backstage/shared";
import { Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { errorMessage, FriendlyError } from "@/lib/errors.ts";
import { useMoveQueue, useOpsQueueColumns } from "./clientsApi.ts";
import { DndBoard, KanbanBoard } from "./KanbanBoard.tsx";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { TaskCard } from "./TaskBits.tsx";
import { useOpsTasks } from "./tasksApi.ts";
import { TaskDetailHost, useOpenTask, useTasksContext } from "./tasksContext.tsx";

/** Filas por setor: o trabalho de cada setor nas colunas dele (ex.: Design → Criativos pendentes). */
export function QueuesPage() {
  const ctx = useTasksContext();
  const { open } = useOpenTask();
  const columnsQ = useOpsQueueColumns();
  const move = useMoveQueue();
  const [picked, setPicked] = useState<string | null>(null);
  const activeSectors = ctx.sectors.filter((s) => s.status === "ativo");
  const sectorId = picked ?? ctx.mySector ?? activeSectors[0]?.id ?? "";
  const tasks = useOpsTasks({ sector_id: sectorId }, Boolean(sectorId) && !ctx.loading);
  const today = opsToday();
  const canMove = ctx.can("ops.cards.move") || ctx.can("ops.tasks.edit");
  const sector = ctx.sectors.find((s) => s.id === sectorId);

  const cols = useMemo(() => (columnsQ.data ?? []).filter((c) => c.sector_id === sectorId && c.active).sort((a, b) => a.position - b.position),
    [columnsQ.data, sectorId]);
  const list = tasks.data ?? [];
  const columnOf = (t: (typeof list)[number]) => opsQueueColumnFor(t, cols) ?? OPS_OTHER_COLUMN;
  const statusName = (id: string) => ctx.statuses.find((s) => s.id === id)?.name ?? id;
  const boardColumns = [
    ...cols.map((c) => ({ id: c.id, name: c.name, color: c.color, hint: `Status: ${statusName(c.status_id)}` })),
    ...(list.some((t) => columnOf(t) === OPS_OTHER_COLUMN) ? [{ id: OPS_OTHER_COLUMN, name: "Outros status", color: "#94A3B8", hint: "Status sem coluna nesta fila" }] : []),
  ];

  return (
    <div className="space-y-4" data-testid="ops-queues">
      <OpsModuleHeader icon={Layers} title="Filas por setor" description="Cada setor com as suas colunas de trabalho. Mover o cartão muda o status da tarefa." />
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Setor" className="w-auto" value={sectorId} onChange={(e) => setPicked(e.target.value)}>
          {activeSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {sector && cols.length === 0 && !columnsQ.isLoading && (
          <p className="text-sm text-slate-500">{sector.name} ainda não tem fila própria: usa as colunas de status. O admin cria colunas em Configurações.</p>
        )}
      </div>
      {ctx.error || tasks.error || columnsQ.error ? <Alert tone="error">{errorMessage(ctx.error ?? tasks.error ?? columnsQ.error)}</Alert> : null}
      {ctx.loading || tasks.isLoading || columnsQ.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : !sectorId ? (
        <Card className="p-8 text-center text-sm text-slate-500">Nenhum setor ativo.</Card>
      ) : cols.length === 0 ? (
        <KanbanBoard tasks={list} statuses={ctx.statuses} sectors={ctx.sectors} today={today} canMove={canMove} onOpen={open} />
      ) : (
        <DndBoard items={list} columns={boardColumns} getId={(t) => t.id} getLabel={(t) => `#${t.number}`} columnOf={columnOf}
          canDrag={() => canMove}
          onMove={async (t, to) => {
            const column = cols.find((c) => c.id === to);
            if (!column) throw new FriendlyError("Escolha uma coluna da fila.");
            await move.mutateAsync({ id: t.id, version: t.version, column });
          }}
          renderCard={(t) => <TaskCard task={t} today={today} showStatus onOpen={() => open(t.id)} />} />
      )}
      <TaskDetailHost ctx={ctx} />
    </div>
  );
}
