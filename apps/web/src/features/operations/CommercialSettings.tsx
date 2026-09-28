import { OPS_COLORS, OPS_LEAD_CATEGORIES, OPS_LEAD_CATEGORY_LABELS, type OpsLeadCategory } from "@backstage/shared";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import {
  type OpsLeadStage, type OpsLossReason, useLeadStages, useLossReasons, useReorderLeadStages, useSaveLeadStage, useSaveLossReason, useSetLeadStageActive,
} from "./commercialApi.ts";

function StageModal({ stage, onClose }: { stage: OpsLeadStage | null; onClose: () => void }) {
  const [name, setName] = useState(stage?.name ?? "");
  const [color, setColor] = useState(stage?.color ?? OPS_COLORS[8]);
  const [category, setCategory] = useState<OpsLeadCategory>(stage?.category ?? "aberto");
  const [prev, setPrev] = useState(stage?.require_previous ?? false);
  const [next, setNext] = useState(stage?.require_next_action ?? false);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveLeadStage();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome da coluna.");
    try { await save.mutateAsync({ id: stage?.id ?? null, name, color, category, requirePrevious: prev, requireNextAction: next }); onClose(); }
    catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={stage ? "Editar coluna comercial" : "Nova coluna comercial"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Grupo" hint="Ganho libera a conversão em cliente; Perdido exige o motivo. Coluna com leads não muda de grupo.">
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as OpsLeadCategory)}>
              {OPS_LEAD_CATEGORIES.map((c) => <option key={c} value={c}>{OPS_LEAD_CATEGORY_LABELS[c]}</option>)}
            </Select>
          )}
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">Cor</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor da coluna comercial">
            {OPS_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color.toLowerCase() === c.toLowerCase()} aria-label={`Cor ${c}`} onClick={() => setColor(c)}
                className={cn("size-8 rounded-full ring-offset-2", color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-slate-900" : "ring-1 ring-slate-200")}
                style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2 rounded-xl bg-slate-50 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-800">Regras de transição</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={prev} onChange={(e) => setPrev(e.target.checked)} />
            <span>Só recebe leads vindos da coluna anterior <span className="block text-xs text-slate-500">Impede pular etapas. Voltar é sempre livre.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={next} onChange={(e) => setNext(e.target.checked)} />
            <span>Exige próxima ação com data para entrar</span>
          </label>
        </fieldset>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

function ActiveModal({ stage, stages, onClose }: { stage: OpsLeadStage; stages: OpsLeadStage[]; onClose: () => void }) {
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = useSetLeadStageActive();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await set.mutateAsync({ id: stage.id, active: !stage.active, moveTo: moveTo || null }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={stage.active ? `Desativar "${stage.name}"` : `Reativar "${stage.name}"`} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {stage.active ? (
          <Field label="Leads desta coluna vão para" hint="Só colunas do mesmo grupo (perdidos continuam perdidos). Fica no histórico de cada lead como feito pelo sistema.">
            {(id) => (
              <Select id={id} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Nenhum lead nela (ou escolha…)</option>
                {stages.filter((s) => s.active && s.id !== stage.id && s.category === stage.category).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
        ) : <p className="text-sm text-slate-600">A coluna volta a aparecer no Kanban comercial.</p>}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={set.isPending}>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}

export function LeadStagesSettings() {
  const stages = useLeadStages();
  const reorder = useReorderLeadStages();
  const [editing, setEditing] = useState<OpsLeadStage | null | undefined>(undefined);
  const [toggling, setToggling] = useState<OpsLeadStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const all = stages.data ?? [];
  async function move(i: number, d: -1 | 1) {
    const ids = all.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setError(null);
    try { await reorder.mutateAsync(ids); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <div className="space-y-3" data-testid="ops-lead-stages">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Colunas do Kanban comercial</h2>
          <p className="text-sm text-slate-500">Nome, cor, ordem, grupo e regras de transição.</p>
        </div>
        <Button onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden /> Nova coluna</Button>
      </div>
      {(error || stages.error) && <Alert tone="error">{error ?? errorMessage(stages.error)}</Alert>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {all.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="ops-lead-stage-row">
              <span className="h-8 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
              <div className="min-w-40 flex-1">
                <p className={cn("font-medium", s.active ? "text-slate-900" : "text-slate-400")}>{s.name}</p>
                <p className="text-xs text-slate-500">{[OPS_LEAD_CATEGORY_LABELS[s.category], s.require_previous && "só da anterior", s.require_next_action && "exige próxima ação"].filter(Boolean).join(" · ")}</p>
              </div>
              <Badge tone={s.active ? "success" : "neutral"}>{s.active ? "Ativa" : "Desativada"}</Badge>
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)} aria-label={`Subir ${s.name}`}><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === all.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)} aria-label={`Descer ${s.name}`}><ArrowDown className="size-4" aria-hidden /></button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(s)} aria-label={`Editar coluna comercial ${s.name}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setToggling(s)} aria-label={`${s.active ? "Desativar" : "Reativar"} coluna comercial ${s.name}`}>
                  {s.active ? "Desativar" : "Reativar"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {editing !== undefined && <StageModal key={editing?.id ?? "new"} stage={editing} onClose={() => setEditing(undefined)} />}
      {toggling && <ActiveModal stage={toggling} stages={all} onClose={() => setToggling(null)} />}
    </div>
  );
}

function ReasonModal({ reason, onClose }: { reason: OpsLossReason | null; onClose: () => void }) {
  const [name, setName] = useState(reason?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useSaveLossReason();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o motivo.");
    try { await save.mutateAsync({ id: reason?.id ?? null, name, active: reason?.active ?? true }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={reason ? "Editar motivo de perda" : "Novo motivo de perda"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Motivo">{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

export function LossReasonsSettings() {
  const reasons = useLossReasons();
  const save = useSaveLossReason();
  const [editing, setEditing] = useState<OpsLossReason | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  async function toggle(r: OpsLossReason) {
    setError(null);
    try { await save.mutateAsync({ id: r.id, name: r.name, active: !r.active }); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <div className="space-y-3" data-testid="ops-loss-reasons">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Motivos de perda</h2>
          <p className="text-sm text-slate-500">Pedidos ao marcar um lead como perdido.</p>
        </div>
        <Button onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden /> Novo motivo</Button>
      </div>
      {(error || reasons.error) && <Alert tone="error">{error ?? errorMessage(reasons.error)}</Alert>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {(reasons.data ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="ops-loss-reason-row">
              <p className={cn("min-w-40 flex-1 font-medium", r.active ? "text-slate-900" : "text-slate-400")}>{r.name}</p>
              <Badge tone={r.active ? "success" : "neutral"}>{r.active ? "Ativo" : "Desativado"}</Badge>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(r)} aria-label={`Editar motivo ${r.name}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => toggle(r)} aria-label={`${r.active ? "Desativar" : "Reativar"} motivo ${r.name}`}>{r.active ? "Desativar" : "Reativar"}</Button>
            </li>
          ))}
        </ul>
      </Card>
      {editing !== undefined && <ReasonModal key={editing?.id ?? "new"} reason={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
