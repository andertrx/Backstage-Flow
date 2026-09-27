import { OPS_COLORS, OPS_STATUS_CATEGORIES, OPS_STATUS_CATEGORY_LABELS, type OpsStatusCategory } from "@backstage/shared";
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
import { type OpsStatus, useOpsStatuses, useReorderStatuses, useSaveStatus, useSetStatusActive } from "./tasksApi.ts";

function StatusModal({ status, onClose }: { status: OpsStatus | null; onClose: () => void }) {
  const [name, setName] = useState(status?.name ?? "");
  const [color, setColor] = useState(status?.color ?? OPS_COLORS[8]);
  const [category, setCategory] = useState<OpsStatusCategory>(status?.category ?? "andamento");
  const [error, setError] = useState<string | null>(null);
  const save = useSaveStatus();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome do status.");
    try { await save.mutateAsync({ id: status?.id ?? null, name, color, category }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={status ? "Editar status" : "Novo status"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Grupo" hint="É o grupo que conta nos painéis (ex.: atrasadas não contam Concluído nem Cancelado). Status já usado não muda de grupo.">
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as OpsStatusCategory)}>
              {OPS_STATUS_CATEGORIES.map((c) => <option key={c} value={c}>{OPS_STATUS_CATEGORY_LABELS[c]}</option>)}
            </Select>
          )}
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">Cor</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do status">
            {OPS_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color.toLowerCase() === c.toLowerCase()} aria-label={`Cor ${c}`} onClick={() => setColor(c)}
                className={cn("size-8 rounded-full ring-offset-2", color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-slate-900" : "ring-1 ring-slate-200")}
                style={{ background: c }} />
            ))}
          </div>
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

function ActiveModal({ status, statuses, onClose }: { status: OpsStatus; statuses: OpsStatus[]; onClose: () => void }) {
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = useSetStatusActive();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await set.mutateAsync({ id: status.id, active: !status.active, moveTo: moveTo || null }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={status.active ? `Desativar "${status.name}"` : `Reativar "${status.name}"`} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {status.active ? (
          <Field label="Tarefas que estão neste status vão para" hint="Obrigatório se alguma tarefa usa este status. A mudança fica no histórico de cada tarefa como feita pelo sistema.">
            {(id) => (
              <Select id={id} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Nenhuma tarefa usa (ou escolha…)</option>
                {statuses.filter((s) => s.active && s.id !== status.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
        ) : <p className="text-sm text-slate-600">O status volta a aparecer no Kanban e nas listas.</p>}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={set.isPending}>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Status das tarefas (só admin): nome, cor, grupo, ordem; desativar pede o destino. */
export function StatusSettings() {
  const statuses = useOpsStatuses();
  const reorder = useReorderStatuses();
  const [editing, setEditing] = useState<OpsStatus | null | undefined>(undefined);
  const [toggling, setToggling] = useState<OpsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const all = statuses.data ?? [];

  async function move(i: number, d: -1 | 1) {
    const ids = all.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setError(null);
    try { await reorder.mutateAsync(ids); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <div className="space-y-3" data-testid="ops-statuses">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Status das tarefas</h2>
          <p className="text-sm text-slate-500">São as colunas do Kanban, nesta ordem. Nada é apagado: status desativado some das escolhas novas.</p>
        </div>
        <Button onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden /> Novo status</Button>
      </div>
      {(error || statuses.error) && <Alert tone="error">{error ?? errorMessage(statuses.error)}</Alert>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {all.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="ops-status-row">
              <span className="h-8 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
              <div className="min-w-40 flex-1">
                <p className={cn("font-medium", s.active ? "text-slate-900" : "text-slate-400")}>{s.name}</p>
                <p className="text-xs text-slate-500">Grupo: {OPS_STATUS_CATEGORY_LABELS[s.category]}</p>
              </div>
              <Badge tone={s.active ? "success" : "neutral"}>{s.active ? "Ativo" : "Desativado"}</Badge>
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)} aria-label={`Subir ${s.name}`}><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === all.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)} aria-label={`Descer ${s.name}`}><ArrowDown className="size-4" aria-hidden /></button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(s)} aria-label={`Editar ${s.name}`}>
                  <Pencil className="size-3.5" aria-hidden /> Editar
                </Button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setToggling(s)} aria-label={`${s.active ? "Desativar" : "Reativar"} ${s.name}`}>
                  {s.active ? "Desativar" : "Reativar"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {editing !== undefined && <StatusModal key={editing?.id ?? "new"} status={editing} onClose={() => setEditing(undefined)} />}
      {toggling && <ActiveModal status={toggling} statuses={all} onClose={() => setToggling(null)} />}
    </div>
  );
}
