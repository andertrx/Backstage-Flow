import { Ban, Building2, ChevronDown, PhoneCall, Plus, Search, UserPlus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatDateTime } from "@/lib/format.ts";
import { useDebouncedValue } from "@/lib/useDebouncedValue.ts";
import { usePersistentState } from "@/lib/usePersistentState.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { ClientOpsDrawer, ProgressBar, StagePill, StartClientModal } from "./ClientOps.tsx";
import { OPS_ONB_CONTACT_LABELS, type OpsBoardClient, useMoveClientStage, useOpsClientBoard, useOpsClientStages } from "./clientsApi.ts";
import { DndBoard } from "./KanbanBoard.tsx";
import { useMyOpsPermissions } from "./api.ts";
import { RequireOps, tabAllowed } from "./OpsLayout.tsx";
import { NewClientModal } from "./OnboardingFicha.tsx";
import { isOnboardingStage, MeetingSeal, OnboardingMeetingActions } from "./OnboardingMeeting.tsx";
import { QueuesPage } from "./QueuesPage.tsx";
import { type TaskView, ViewToggle } from "./TasksPage.tsx";
import { TaskDetailHost, type TasksContext, useTasksContext } from "./tasksContext.tsx";

/** Etapa 51.2/52: seta no canto do cartão que abre o menu "Mover para…" (mesmas regras do arrastar). */
function MoveMenu({ c, targets, onMoveTo }: { c: OpsBoardClient; targets: { id: string; name: string }[]; onMoveTo: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const options = targets.filter((t) => t.id !== c.stage_id);
  if (!c.can_move || options.length === 0) return null;
  // não deixa o clique no menu começar o arrastar do cartão
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div className="absolute right-2 top-2" onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onKeyDown={stop}>
      <button type="button" aria-label={`Mover ${c.name} para`} aria-haspopup="menu" aria-expanded={open} data-testid="ops-client-move-to" title="Mover para…"
        onClick={() => setOpen((v) => !v)}
        className="flex size-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 aria-expanded:bg-slate-100 aria-expanded:text-slate-700">
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" aria-label="Mover para" className="absolute right-0 top-8 z-50 w-56 rounded-xl bg-white p-1 shadow-elevated ring-1 ring-slate-200">
            <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mover para</p>
            {options.map((t) => (
              <button key={t.id} type="button" role="menuitem" onClick={() => { setOpen(false); onMoveTo(t.id); }}
                className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100">
                {t.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ClientCard({ c, ctx, onOpen, targets, onMoveTo }: {
  c: OpsBoardClient; ctx: TasksContext; onOpen: () => void; targets: { id: string; name: string }[]; onMoveTo: (to: string) => void;
}) {
  const s = c.summary;
  return (
    <div className="relative space-y-2 rounded-xl bg-white p-3.5 shadow-card ring-1 ring-slate-200/80 transition duration-150 hover:shadow-elevated hover:ring-brand-300">
      <button type="button" onClick={onOpen} data-testid="ops-client-card" className="block w-full space-y-2 text-left focus-visible:outline-2 focus-visible:outline-blue-600">
        <p className="break-words pr-7 text-base font-bold leading-tight text-slate-950" data-testid="ops-client-card-name">{c.name}</p>
        <p className="text-[11px] text-slate-500">AM: {c.am_name ?? "sem Account Manager"}</p>
        {isOnboardingStage(c.stage_id) && <MeetingSeal c={c} />}
        {c.last_contact ? (
          <div className="space-y-0.5 rounded-lg bg-blue-50/70 px-2 py-1.5" data-testid="ops-client-last-contact">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-blue-800">
              <PhoneCall className="size-3" aria-hidden /> Último contato: {formatDateTime(c.last_contact.at)}
            </p>
            <p className="line-clamp-2 text-[11px] text-slate-600">{OPS_ONB_CONTACT_LABELS[c.last_contact.kind]}: {c.last_contact.body}</p>
          </div>
        ) : isOnboardingStage(c.stage_id) && <p className="text-[11px] text-slate-400">Nenhum contato registrado</p>}
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{s.abertas} abertas</span>
          {s.atrasadas > 0 && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{s.atrasadas} atrasadas</span>}
          {s.bloqueadas > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{s.bloqueadas} bloqueadas</span>}
          {s.aguardando_cliente > 0 && <span className="rounded bg-yellow-50 px-1.5 py-0.5 text-yellow-800">{s.aguardando_cliente} aguardando cliente</span>}
        </div>
        {c.stage_pending > 0 && <p className="text-[11px] font-medium text-amber-700">{c.stage_pending} obrigatória(s) aberta(s) nesta etapa</p>}
        <div className="border-t border-slate-100 pt-2"><ProgressBar done={s.obrigatorias_concluidas} total={s.obrigatorias} /></div>
      </button>
      <OnboardingMeetingActions c={c} ctx={ctx} />
      <MoveMenu c={c} targets={targets} onMoveTo={onMoveTo} />
    </div>
  );
}

/** Pop-up quando uma regra não deixa o cliente ir para a coluna escolhida (arrastando ou pelo "Mover para…"). */
function BlockedMoveModal({ info, onClose }: { info: { client: string; to: string; message: string }; onClose: () => void }) {
  return (
    <Modal title={`Não dá para mover ${info.client}`} open onClose={onClose}>
      <div className="space-y-4" data-testid="ops-client-move-blocked">
        <div className="flex items-start gap-3">
          <Ban className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Para ir para "{info.to}":</p>
            <p className="text-sm text-slate-700">{info.message}</p>
          </div>
        </div>
        <div className="flex justify-end"><Button onClick={onClose} autoFocus>Entendi</Button></div>
      </div>
    </Modal>
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
              <td className="px-4 py-3"><div className="space-y-1"><StagePill stage={stages?.find((s) => s.id === c.stage_id)} />{isOnboardingStage(c.stage_id) && <div><MeetingSeal c={c} /></div>}</div></td>
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
  const [creatingClient, setCreatingClient] = useState(false);
  const [blocked, setBlocked] = useState<{ client: string; to: string; message: string } | null>(null);
  const debounced = useDebouncedValue(q.trim(), 300);
  const f = useMemo(() => ({ q: debounced || undefined, mine: mine || undefined, am_user_id: am || undefined }), [debounced, mine, am]);
  const board = useOpsClientBoard(f, !ctx.loading);
  const clients = board.data?.clients ?? [];
  const columns = (stages.data ?? []).filter((s) => s.active || clients.some((c) => c.stage_id === s.id))
    .map((s) => ({ id: s.id, name: s.name, color: s.color, hint: s.auto_advance ? "Avança sozinho com as obrigatórias concluídas" : undefined }));
  const targets = (stages.data ?? []).filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }));
  /** Arrastar ou "Mover para…": se uma regra recusar, abre o pop-up explicando (o cartão volta para onde estava). */
  async function moveClient(c: OpsBoardClient, to: string) {
    try {
      await move.mutateAsync({ clientId: c.client_id, version: c.version, stageId: to });
    } catch (err) {
      setBlocked({ client: c.name, to: stages.data?.find((s) => s.id === to)?.name ?? to, message: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-4" data-testid="ops-clients">
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
        {board.data?.can.create_client && (
          <Button variant="secondary" onClick={() => setCreatingClient(true)}><UserPlus className="size-4" aria-hidden /> Cliente novo</Button>
        )}
      </div>
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
          onMove={moveClient}
          renderCard={(c) => <ClientCard c={c} ctx={ctx} onOpen={() => open(c.client_id)} targets={targets} onMoveTo={(to) => void moveClient(c, to)} />} />
      ) : (
        <ClientTable clients={clients} stages={stages.data} onOpen={open} />
      )}

      {starting && board.data && <StartClientModal ctx={ctx} clients={board.data.available} onClose={() => setStarting(false)} />}
      {creatingClient && <NewClientModal ctx={ctx} canPickAm={Boolean(board.data?.can.manage)} onClose={() => setCreatingClient(false)} onCreated={open} />}
      {blocked && <BlockedMoveModal info={blocked} onClose={() => setBlocked(null)} />}
      {openId && <ClientOpsDrawer key={openId} clientId={openId} ctx={ctx} onClose={close} />}
      <TaskDetailHost ctx={ctx} />
    </div>
  );
}

/** Só quem tem "ver a ficha operacional" ou é Account Manager de algum cliente. */
const CLIENT_PERMS = { permission: "ops.clients.view", anyOf: ["ops.clients.view", "ops.am"] } as const;

/**
 * Aba Onboarding: só os clientes (52.8: a aba "Filas dos setores" saiu daqui).
 * Quem não vê clientes (ex.: papel Equipe) continua vendo as filas do próprio setor, sem abas.
 */
function OperationPage() {
  const perms = useMyOpsPermissions();
  const canClients = tabAllowed(perms.data, { permission: CLIENT_PERMS.permission, anyOf: [...CLIENT_PERMS.anyOf] });
  const [params] = useSearchParamsUpdater();
  // O endereço antigo "?ver=filas" continua abrindo as filas (links e favoritos), mas sem aba visível.
  return canClients && params.get("ver") !== "filas" ? <ClientsPage /> : <QueuesPage />;
}

export function ClientsRoute() {
  return (
    <RequireOps permission="ops.access">
      <OperationPage />
    </RequireOps>
  );
}
