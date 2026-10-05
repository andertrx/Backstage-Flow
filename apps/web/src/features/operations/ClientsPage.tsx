import { ArrowRight, Building2, Layers, Megaphone, Plus, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
import { ClientOpsDrawer, ProgressBar, StagePill, StartClientModal } from "./ClientOps.tsx";
import { type OpsBoardClient, useMoveClientStage, useOpsClientBoard, useOpsClientStages } from "./clientsApi.ts";
import { DemandReleaseModal } from "./DemandReleaseModal.tsx";
import { DndBoard } from "./KanbanBoard.tsx";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { useMyOpsPermissions } from "./api.ts";
import { RequireOps, tabAllowed } from "./OpsLayout.tsx";
import { QueuesPage } from "./QueuesPage.tsx";
import { type TaskView, ViewToggle } from "./TasksPage.tsx";
import { TaskDetailHost, type TasksContext, useTasksContext } from "./tasksContext.tsx";

function ClientCard({ c, onOpen }: { c: OpsBoardClient; onOpen: () => void }) {
  const s = c.summary;
  return (
    <button type="button" onClick={onOpen} data-testid="ops-client-card"
      className="block w-full space-y-2 rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600">
      <p className="text-sm font-semibold text-slate-900">{c.name}</p>
      <p className="text-xs text-slate-500">AM: {c.am_name ?? "sem Account Manager"}</p>
      <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{s.abertas} abertas</span>
        {s.atrasadas > 0 && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{s.atrasadas} atrasadas</span>}
        {s.bloqueadas > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{s.bloqueadas} bloqueadas</span>}
        {s.aguardando_cliente > 0 && <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-yellow-800">{s.aguardando_cliente} aguardando cliente</span>}
      </div>
      {c.stage_pending > 0 && <p className="text-[11px] font-medium text-amber-700">{c.stage_pending} obrigatória(s) aberta(s) nesta etapa</p>}
      <div className="border-t border-slate-100 pt-2"><ProgressBar done={s.obrigatorias_concluidas} total={s.obrigatorias} /></div>
    </button>
  );
}

export function useOpenClient() {
  const [params, update] = useSearchParamsUpdater();
  const openId = params.get("cliente");
  const open = useCallback((id: string) => update((p) => { p.set("cliente", id); return p; }), [update]);
  const close = useCallback(() => update((p) => { p.delete("cliente"); return p; }), [update]);
  return { openId, open, close };
}

function ClientTable({ clients, stages, onOpen }: { clients: OpsBoardClient[]; stages: ReturnType<typeof useOpsClientStages>["data"]; onOpen: (id: string) => void }) {
  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="ops-client-table">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Account Manager</th>
            <th className="px-4 py-3">Tarefas</th><th className="px-4 py-3">Próxima entrega</th><th className="px-4 py-3">Progresso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {clients.map((c) => (
            <tr key={c.client_id} className="cursor-pointer hover:bg-blue-50/40" onClick={() => onOpen(c.client_id)} data-testid="ops-client-row">
              <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
              <td className="px-4 py-3"><StagePill stage={stages?.find((s) => s.id === c.stage_id)} /></td>
              <td className="px-4 py-3 text-slate-600">{c.am_name ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                {c.summary.abertas} abertas{c.summary.atrasadas > 0 && <span className="font-semibold text-red-600"> · {c.summary.atrasadas} atrasadas</span>}
              </td>
              <td className="px-4 py-3 text-slate-600">{c.summary.proxima_entrega ? formatDate(c.summary.proxima_entrega) : "—"}</td>
              <td className="px-4 py-3"><ProgressBar done={c.summary.obrigatorias_concluidas} total={c.summary.obrigatorias} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Clientes (03): onboarding e operação — visão consolidada do Account Manager. */
export function ClientsPage() {
  const ctx: TasksContext = useTasksContext();
  const { openId, open, close } = useOpenClient();
  const stages = useOpsClientStages();
  const move = useMoveClientStage();
  const [view, setView] = usePersistentState<TaskView>("ops.clients.view", "kanban");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [am, setAm] = useState("");
  const [starting, setStarting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const debounced = useDebouncedValue(q.trim(), 300);
  const f = useMemo(() => ({ q: debounced || undefined, mine: mine || undefined, am_user_id: am || undefined }), [debounced, mine, am]);
  const board = useOpsClientBoard(f, !ctx.loading);
  const clients = board.data?.clients ?? [];
  const columns = (stages.data ?? []).filter((s) => s.active || clients.some((c) => c.stage_id === s.id))
    .map((s) => ({ id: s.id, name: s.name, color: s.color, hint: s.auto_advance ? "Avança sozinho com as obrigatórias concluídas" : undefined }));

  return (
    <div className="space-y-4" data-testid="ops-clients">
      <OpsModuleHeader number="03" icon={Building2} title="Operação: clientes liberados"
        description="Clientes que o Comercial liberou: etapa de cada um, Account Manager e o andamento das demandas de todos os setores." />
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
        <span>Comercial (Prospecção → Contrato Pago)</span>
        <ArrowRight className="size-4 text-blue-500" aria-hidden />
        <span className="text-blue-700">Operação (Onboarding → execução por setor → acompanhamento)</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input aria-label="Buscar cliente" placeholder="Buscar cliente" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {ctx.can("ops.clients.view") && (
          <Select aria-label="Filtrar por Account Manager" className="w-auto" value={am} onChange={(e) => setAm(e.target.value)}>
            <option value="">Todos os Account Managers</option>
            {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
          </Select>
        )}
        {ctx.can("ops.am") && ctx.can("ops.clients.view") && (
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Só os meus</label>
        )}
        <ViewToggle view={view} onChange={setView} canKanban />
        {board.data?.can.manage && (board.data.available.length ?? 0) > 0 && (
          <Button variant="secondary" onClick={() => setStarting(true)}><Plus className="size-4" aria-hidden /> Colocar cliente no fluxo</Button>
        )}
        {board.data?.can.release && <Button onClick={() => setReleasing(true)}><Megaphone className="size-4" aria-hidden /> Liberar demanda</Button>}
      </div>
      {done && <Alert tone="success">{done}</Alert>}
      {ctx.error || board.error || stages.error ? <Alert tone="error">{errorMessage(ctx.error ?? board.error ?? stages.error)}</Alert> : null}
      {ctx.loading || board.isLoading || stages.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : clients.length === 0 ? (
        <Card className="space-y-2 p-8 text-center" data-testid="ops-clients-empty">
          <Building2 className="mx-auto size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">{f.q || f.mine || f.am_user_id ? "Nenhum cliente com esses filtros." : "Nenhum cliente no fluxo operacional ainda."}</p>
          {board.data?.can.manage && <p className="text-sm text-slate-500">Use "Colocar cliente no fluxo" para começar o onboarding de um cliente do cadastro.</p>}
        </Card>
      ) : view === "kanban" ? (
        <DndBoard items={clients} columns={columns} getId={(c) => c.client_id} getLabel={(c) => c.name} columnOf={(c) => c.stage_id}
          canDrag={(c) => c.can_move} empty="Nenhum cliente"
          onMove={async (c, to) => { await move.mutateAsync({ clientId: c.client_id, version: c.version, stageId: to }); }}
          renderCard={(c) => <ClientCard c={c} onOpen={() => open(c.client_id)} />} />
      ) : (
        <ClientTable clients={clients} stages={stages.data} onOpen={open} />
      )}

      {starting && board.data && <StartClientModal ctx={ctx} clients={board.data.available} onClose={() => setStarting(false)} />}
      {releasing && <DemandReleaseModal ctx={ctx} onClose={() => setReleasing(false)} onDone={(r) => setDone(`Demanda #${r.number} liberada.`)} />}
      {openId && <ClientOpsDrawer key={openId} clientId={openId} ctx={ctx} onClose={close} />}
      <TaskDetailHost ctx={ctx} />
    </div>
  );
}

/** Só quem tem "ver a ficha operacional" ou é Account Manager de algum cliente. */
const CLIENT_PERMS = { permission: "ops.clients.view", anyOf: ["ops.clients.view", "ops.am"] } as const;

/**
 * Etapa 38.2: aba Operação com duas partes — Clientes (onboarding e acompanhamento; ficha operacional ou Account Manager)
 * e Filas dos setores (todos da Central). Quem não vê clientes (ex.: papel Equipe) vê só as Filas, como antes.
 */
function OperationPage() {
  const perms = useMyOpsPermissions();
  const canClients = tabAllowed(perms.data, { permission: CLIENT_PERMS.permission, anyOf: [...CLIENT_PERMS.anyOf] });
  const [params, update] = useSearchParamsUpdater();
  const sub = params.get("ver") === "filas" || !canClients ? "filas" : "clientes";
  const setSub = (v: "clientes" | "filas") => update((p) => { if (v === "clientes") p.delete("ver"); else p.set("ver", v); p.delete("cliente"); return p; });
  const parts = [
    ...(canClients ? [{ id: "clientes" as const, label: "Clientes", icon: Building2 }] : []),
    { id: "filas" as const, label: "Filas dos setores", icon: Layers },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist" aria-label="Partes da operação">
        {parts.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={sub === id} onClick={() => setSub(id)} data-testid={`ops-operation-tab-${id}`}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
              sub === id ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {sub === "filas" ? <QueuesPage /> : <ClientsPage />}
    </div>
  );
}

export function ClientsRoute() {
  return (
    <RequireOps permission="ops.access">
      <OperationPage />
    </RequireOps>
  );
}
