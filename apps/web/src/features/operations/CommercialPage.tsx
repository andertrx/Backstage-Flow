import { OPS_PRIORITIES, OPS_PRIORITY_LABELS, opsSumByCurrency, opsToday } from "@backstage/shared";
import { CalendarClock, Handshake, Plus, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatMoney } from "@/lib/format.ts";
import { useDebouncedValue } from "@/lib/useDebouncedValue.ts";
import { usePersistentState } from "@/lib/usePersistentState.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { SavedViews } from "./SavedViews.tsx";
import { type OpsLeadCard, useLeadBoard, useLeadStages, useLossReasons, useMoveLead } from "./commercialApi.ts";
import { DndBoard } from "./KanbanBoard.tsx";
import { LeadDrawer, LeadFormModal, LossModal } from "./Leads.tsx";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { RequireOps } from "./OpsLayout.tsx";
import { Avatar, PriorityBadge } from "./TaskBits.tsx";
import { type TaskView, ViewToggle } from "./TasksPage.tsx";
import { useTasksContext } from "./tasksContext.tsx";

const totalsText = (items: OpsLeadCard[]) =>
  Object.entries(opsSumByCurrency(items)).map(([cur, v]) => formatMoney(v, cur)).join(" · ");

function LeadCard({ l, onOpen }: { l: OpsLeadCard; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} data-testid="ops-lead-card"
      className="block w-full space-y-2 rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-400">#{l.number}</span>
        <PriorityBadge priority={l.priority} />
      </div>
      <p className="text-sm font-semibold text-slate-900">{l.company_name}</p>
      <p className="truncate text-xs text-slate-500">{[l.segment, l.origin].filter(Boolean).join(" · ") || "—"}</p>
      {l.potential_value != null && <p className="text-xs font-semibold text-emerald-700">{formatMoney(Number(l.potential_value), l.currency)}</p>}
      {l.loss_reason && <p className="text-xs text-red-700">Motivo: {l.loss_reason}</p>}
      {l.client_id && <p className="text-xs font-semibold text-emerald-700">Virou cliente</p>}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <span className={cn("inline-flex items-center gap-1 text-xs", l.overdue ? "font-semibold text-red-600" : "text-slate-500")}>
          <CalendarClock className="size-3.5" aria-hidden />
          {l.next_action_date ? `${l.overdue ? "Atrasada · " : ""}${formatDate(l.next_action_date)}` : "Sem próxima ação"}
        </span>
        {l.owner_name ? <Avatar name={l.owner_name} /> : <span className="text-xs text-slate-400">Sem responsável</span>}
      </div>
      {l.next_action && <p className="truncate text-xs text-slate-600">Próxima: {l.next_action}</p>}
      <p className="text-[11px] text-slate-400">Entrada {formatDate(l.entered_at)}{l.last_interaction_at ? ` · última interação ${formatDate(l.last_interaction_at.slice(0, 10))}` : ""}</p>
    </button>
  );
}

function useOpenLead() {
  const [params, update] = useSearchParamsUpdater();
  const openId = params.get("lead");
  const open = useCallback((id: string) => update((p) => { p.set("lead", id); return p; }), [update]);
  const close = useCallback(() => update((p) => { p.delete("lead"); return p; }), [update]);
  return { openId, open, close };
}

/** Comercial: leads da prospecção ao fechamento (separado do fluxo operacional). */
export function CommercialPage() {
  const ctx = useTasksContext();
  const { openId, open, close } = useOpenLead();
  const stages = useLeadStages();
  const reasons = useLossReasons();
  const move = useMoveLead();
  const [view, setView] = usePersistentState<TaskView>("ops.commercial.view", "kanban");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [origin, setOrigin] = useState("");
  const [priority, setPriority] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [losing, setLosing] = useState<{ lead: OpsLeadCard; stageId: string } | null>(null);
  const [lossError, setLossError] = useState<string | null>(null);
  const debounced = useDebouncedValue(q.trim(), 300);
  const f = useMemo(() => ({ q: debounced || undefined, owner_id: owner || undefined, origin: origin || undefined, priority: priority || undefined,
    overdue: overdue || undefined, archived: archived || undefined }), [debounced, owner, origin, priority, overdue, archived]);
  const board = useLeadBoard(f);
  const leads = board.data?.leads ?? [];
  const stageList = stages.data ?? [];
  const columns = stageList.filter((s) => s.active || leads.some((l) => l.stage_id === s.id)).map((s) => {
    const total = totalsText(leads.filter((l) => l.stage_id === s.id));
    const rules = [s.require_previous && "só da anterior", s.require_next_action && "exige próxima ação"].filter(Boolean).join(" · ");
    return { id: s.id, name: s.name, color: s.color, hint: [total, rules].filter(Boolean).join(" · ") || undefined };
  });
  const openTotal = totalsText(leads.filter((l) => stageList.find((s) => s.id === l.stage_id)?.category === "aberto"));
  const viewFilters = { owner_id: owner, origin, priority, overdue, archived };
  const applyView = (v: Record<string, unknown>) => {
    setOwner(typeof v.owner_id === "string" ? v.owner_id : "");
    setOrigin(typeof v.origin === "string" ? v.origin : "");
    setPriority(typeof v.priority === "string" ? v.priority : "");
    setOverdue(v.overdue === true);
    setArchived(v.archived === true);
  };
  const active = Boolean(f.q || f.owner_id || f.origin || f.priority || f.overdue || f.archived);

  async function confirmLoss(reason: string, note: string) {
    if (!losing) return;
    setLossError(null);
    try {
      await move.mutateAsync({ id: losing.lead.id, version: losing.lead.version, stageId: losing.stageId, lossReason: reason, lossNote: note });
      setLosing(null);
    } catch (err) {
      setLossError(errorMessage(err));
      setLosing(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="ops-commercial">
      <OpsModuleHeader icon={Handshake} title="Comercial" description="Leads da prospecção ao contrato pago. No Contrato Pago, o lead vira cliente sem duplicar o cadastro." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input aria-label="Buscar lead" placeholder="Buscar por empresa, contato, segmento ou #número" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ViewToggle view={view} onChange={setView} canKanban />
        <Button onClick={() => setCreating(true)} disabled={!stages.data}><Plus className="size-4" aria-hidden /> Novo lead</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Filtrar por responsável" className="w-auto" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          <option value="nenhum">Sem responsável</option>
          {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por origem" className="w-auto" value={origin} onChange={(e) => setOrigin(e.target.value)}>
          <option value="">Todas as origens</option>
          {(board.data?.origins ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Select aria-label="Filtrar por prioridade" className="w-auto" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Todas as prioridades</option>
          {OPS_PRIORITIES.map((p) => <option key={p} value={p}>{OPS_PRIORITY_LABELS[p]}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Próxima ação atrasada</label>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Só arquivados</label>
        {openTotal && <span className="ml-auto text-sm text-slate-600" data-testid="ops-commercial-total">Em negociação: <b>{openTotal}</b></span>}
      </div>
      <SavedViews page="comercial" keys={["owner_id", "origin", "priority", "overdue", "archived"]} current={viewFilters} onApply={applyView} />

      {lossError && <Alert tone="error">{lossError}</Alert>}
      {board.error || stages.error ? <Alert tone="error">{errorMessage(board.error ?? stages.error)}</Alert> : null}
      {board.isLoading || stages.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : leads.length === 0 ? (
        <Card className="space-y-2 p-8 text-center" data-testid="ops-commercial-empty">
          <Handshake className="mx-auto size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">{active ? "Nenhum lead com esses filtros." : "Nenhum lead ainda."}</p>
          {!active && <p className="text-sm text-slate-500">Use "Novo lead" para cadastrar o primeiro.</p>}
        </Card>
      ) : view === "kanban" ? (
        <DndBoard items={leads} columns={columns} getId={(l) => l.id} getLabel={(l) => `#${l.number}`} columnOf={(l) => l.stage_id}
          canDrag={(l) => !l.archived_at} empty="Nenhum lead"
          onMove={async (l, to) => {
            if (stageList.find((s) => s.id === to)?.category === "perdido") { setLosing({ lead: l, stageId: to }); return; }
            await move.mutateAsync({ id: l.id, version: l.version, stageId: to });
          }}
          renderCard={(l) => <LeadCard l={l} onOpen={() => open(l.id)} />} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="ops-lead-table">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Coluna</th><th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Valor</th><th className="px-4 py-3">Próxima ação</th><th className="px-4 py-3">Prioridade</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l) => {
                const s = stageList.find((x) => x.id === l.stage_id);
                return (
                  <tr key={l.id} className="cursor-pointer hover:bg-blue-50/40" onClick={() => open(l.id)} data-testid="ops-lead-row">
                    <td className="px-4 py-3"><span className="text-xs font-semibold text-slate-400">#{l.number} </span><span className="font-semibold text-slate-900">{l.company_name}</span>
                      <span className="block text-xs text-slate-500">{[l.contact_name, l.segment].filter(Boolean).join(" · ")}</span></td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-xs font-semibold"><span className="size-2 rounded-full" style={{ background: s?.color }} aria-hidden />{s?.name}</span></td>
                    <td className="px-4 py-3 text-slate-600">{l.owner_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{l.potential_value != null ? formatMoney(Number(l.potential_value), l.currency) : "—"}</td>
                    <td className={cn("px-4 py-3", l.overdue ? "font-semibold text-red-600" : "text-slate-600")}>
                      {l.next_action ? `${l.next_action}${l.next_action_date ? ` · ${formatDate(l.next_action_date)}` : ""}` : "—"}</td>
                    <td className="px-4 py-3"><PriorityBadge priority={l.priority} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-slate-500">Totais somados só dentro da mesma moeda. Hoje: {formatDate(opsToday())}.</p>

      {creating && stages.data && <LeadFormModal lead={null} stages={stages.data} ctx={ctx} onClose={() => setCreating(false)} onSaved={open} />}
      {losing && <LossModal reasons={reasons.data ?? []} busy={move.isPending} onCancel={() => setLosing(null)} onConfirm={confirmLoss} />}
      {openId && <LeadDrawer key={openId} id={openId} ctx={ctx} onClose={close} />}
    </div>
  );
}

export function CommercialRoute() {
  return (
    <RequireOps permission="ops.commercial">
      <CommercialPage />
    </RequireOps>
  );
}
