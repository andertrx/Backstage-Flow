import { OPS_COLORS } from "@backstage/shared";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import {
  type OpsActivityType, type OpsClientStage, type OpsQueueColumn, useOpsActivityTypes, useOpsClientStages, useOpsQueueColumns, useReorderClientStages,
  useReorderQueueColumns, useSaveActivityType, useSaveClientStage, useSaveQueueColumn, useSetClientStageActive, useSetQueueColumnActive,
} from "./clientsApi.ts";
import { useOpsSectors } from "./api.ts";
import { useOpsStatuses } from "./tasksApi.ts";

function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-slate-700">Cor</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {OPS_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c.toLowerCase()} aria-label={`Cor ${c}`} onClick={() => onChange(c)}
            className={cn("size-8 rounded-full ring-offset-2", value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-slate-900" : "ring-1 ring-slate-200")}
            style={{ background: c }} />
        ))}
      </div>
    </fieldset>
  );
}

function Row({ color, title, subtitle, active, children, testid }: { color: string; title: string; subtitle: ReactNode; active: boolean; children: ReactNode; testid: string }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid={testid}>
      <span className="h-8 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      <div className="min-w-40 flex-1">
        <p className={cn("font-medium", active ? "text-slate-900" : "text-slate-400")}>{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <Badge tone={active ? "success" : "neutral"}>{active ? "Ativo" : "Desativado"}</Badge>
      <div className="flex items-center gap-1">{children}</div>
    </li>
  );
}

function MoveButtons({ name, first, last, busy, onMove }: { name: string; first: boolean; last: boolean; busy: boolean; onMove: (d: -1 | 1) => void }) {
  return (
    <>
      <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={first || busy} onClick={() => onMove(-1)} aria-label={`Subir ${name}`}>
        <ArrowUp className="size-4" aria-hidden />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={last || busy} onClick={() => onMove(1)} aria-label={`Descer ${name}`}>
        <ArrowDown className="size-4" aria-hidden />
      </button>
    </>
  );
}

// ---------------------------------------------------------------- etapas do cliente
function StageModal({ stage, onClose }: { stage: OpsClientStage | null; onClose: () => void }) {
  const [name, setName] = useState(stage?.name ?? "");
  const [color, setColor] = useState(stage?.color ?? OPS_COLORS[8]);
  const [require, setRequire] = useState(stage?.require_mandatory ?? true);
  const [auto, setAuto] = useState(stage?.auto_advance ?? false);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveClientStage();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome da etapa.");
    try { await save.mutateAsync({ id: stage?.id ?? null, name, color, require, auto }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={stage ? "Editar etapa" : "Nova etapa"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</Field>
        <ColorPicker value={color} onChange={setColor} label="Cor da etapa" />
        <fieldset className="space-y-2 rounded-xl bg-slate-50 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-800">Regras de avanço</legend>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={require} onChange={(e) => setRequire(e.target.checked)} />
            <span>Só avança com as tarefas obrigatórias desta etapa concluídas <span className="block text-xs text-slate-500">Tarefas opcionais nunca travam o avanço.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>Avançar sozinho quando todas as obrigatórias desta etapa forem concluídas
              <span className="block text-xs text-slate-500">Um passo por vez, registrado no histórico como "Sistema" com a regra usada. Sem esta opção, o avanço é sempre manual.</span></span>
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

function StageActiveModal({ stage, stages, onClose }: { stage: OpsClientStage; stages: OpsClientStage[]; onClose: () => void }) {
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = useSetClientStageActive();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await set.mutateAsync({ id: stage.id, active: !stage.active, moveTo: moveTo || null }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={stage.active ? `Desativar "${stage.name}"` : `Reativar "${stage.name}"`} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {stage.active ? (
          <Field label="Clientes que estão nesta etapa vão para" hint="Obrigatório se algum cliente está nela. Fica no histórico de cada cliente como feito pelo sistema.">
            {(id) => (
              <Select id={id} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Nenhum cliente nela (ou escolha…)</option>
                {stages.filter((s) => s.active && s.id !== stage.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
        ) : <p className="text-sm text-slate-600">A etapa volta a aparecer no Kanban dos clientes.</p>}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={set.isPending}>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ClientStagesSettings() {
  const stages = useOpsClientStages();
  const reorder = useReorderClientStages();
  const [editing, setEditing] = useState<OpsClientStage | null | undefined>(undefined);
  const [toggling, setToggling] = useState<OpsClientStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const all = stages.data ?? [];
  async function move(i: number, d: -1 | 1) {
    const ids = all.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setError(null);
    try { await reorder.mutateAsync(ids); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <div className="space-y-3" data-testid="ops-client-stages">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Etapas do onboarding e da operação</h2>
          <p className="text-sm text-slate-500">Colunas do Kanban de clientes, nesta ordem, com as regras de avanço de cada uma.</p>
        </div>
        <Button onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden /> Nova etapa</Button>
      </div>
      {(error || stages.error) && <Alert tone="error">{error ?? errorMessage(stages.error)}</Alert>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {all.map((s, i) => (
            <Row key={s.id} testid="ops-client-stage-row" color={s.color} title={s.name} active={s.active}
              subtitle={[s.require_mandatory ? "Exige obrigatórias concluídas" : "Não exige obrigatórias", s.auto_advance ? "avança sozinho" : "avanço manual"].join(" · ")}>
              <MoveButtons name={s.name} first={i === 0} last={i === all.length - 1} busy={reorder.isPending} onMove={(d) => move(i, d)} />
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(s)} aria-label={`Editar etapa ${s.name}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setToggling(s)} aria-label={`${s.active ? "Desativar" : "Reativar"} etapa ${s.name}`}>
                {s.active ? "Desativar" : "Reativar"}
              </Button>
            </Row>
          ))}
        </ul>
      </Card>
      {editing !== undefined && <StageModal key={editing?.id ?? "new"} stage={editing} onClose={() => setEditing(undefined)} />}
      {toggling && <StageActiveModal stage={toggling} stages={all} onClose={() => setToggling(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- filas por setor
function QueueColumnModal({ column, sectorId, onClose }: { column: OpsQueueColumn | null; sectorId: string; onClose: () => void }) {
  const statuses = useOpsStatuses();
  const [name, setName] = useState(column?.name ?? "");
  const [color, setColor] = useState(column?.color ?? OPS_COLORS[2]);
  const [statusId, setStatusId] = useState(column?.status_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useSaveQueueColumn();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome da coluna.");
    if (!statusId) return setError("Escolha o status ligado à coluna.");
    try { await save.mutateAsync({ id: column?.id ?? null, sectorId, name, color, statusId }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={column ? "Editar coluna da fila" : "Nova coluna da fila"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Status ligado" hint="Mover o cartão para esta coluna muda a tarefa para este status.">
          {(id) => (
            <Select id={id} value={statusId} onChange={(e) => setStatusId(e.target.value)}>
              <option value="">Escolha…</option>
              {(statuses.data ?? []).filter((s) => s.active || s.id === statusId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        <ColorPicker value={color} onChange={setColor} label="Cor da coluna" />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

export function QueueSettings() {
  const sectors = useOpsSectors();
  const columns = useOpsQueueColumns();
  const statuses = useOpsStatuses();
  const reorder = useReorderQueueColumns();
  const setActive = useSetQueueColumnActive();
  const [sectorId, setSectorId] = useState("");
  const [editing, setEditing] = useState<OpsQueueColumn | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const active = (sectors.data ?? []).filter((s) => s.status !== "arquivado");
  const current = sectorId || active[0]?.id || "";
  const cols = (columns.data ?? []).filter((c) => c.sector_id === current).sort((a, b) => a.position - b.position);
  const statusById = new Map((statuses.data ?? []).map((s) => [s.id, s]));
  async function move(i: number, d: -1 | 1) {
    const ids = cols.map((c) => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setError(null);
    try { await reorder.mutateAsync({ sectorId: current, ids }); } catch (err) { setError(errorMessage(err)); }
  }
  async function toggle(c: OpsQueueColumn) {
    setError(null);
    try { await setActive.mutateAsync({ id: c.id, active: !c.active }); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <div className="space-y-3" data-testid="ops-queue-settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Filas por setor</h2>
          <p className="text-sm text-slate-500">Colunas de trabalho de cada setor. Cada coluna é ligada a um status.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select aria-label="Setor da fila" className="w-auto" value={current} onChange={(e) => setSectorId(e.target.value)}>
            {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Button onClick={() => setEditing(null)} disabled={!current}><Plus className="size-4" aria-hidden /> Nova coluna</Button>
        </div>
      </div>
      {(error || columns.error) && <Alert tone="error">{error ?? errorMessage(columns.error)}</Alert>}
      <Card>
        {cols.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">Este setor ainda não tem fila própria: a tela Filas mostra as colunas de status.</p> : (
          <ul className="divide-y divide-slate-100">
            {cols.map((c, i) => {
              const st = statusById.get(c.status_id);
              return (
                <Row key={c.id} testid="ops-queue-row" color={c.color} title={c.name} active={c.active}
                  subtitle={<>Status: {st?.name ?? c.status_id}{st && !st.active && <span className="text-amber-700"> (status desativado)</span>}</>}>
                  <MoveButtons name={c.name} first={i === 0} last={i === cols.length - 1} busy={reorder.isPending} onMove={(d) => move(i, d)} />
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(c)} aria-label={`Editar coluna ${c.name}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => toggle(c)} aria-label={`${c.active ? "Desativar" : "Reativar"} coluna ${c.name}`}>
                    {c.active ? "Desativar" : "Reativar"}
                  </Button>
                </Row>
              );
            })}
          </ul>
        )}
      </Card>
      {editing !== undefined && current && <QueueColumnModal key={editing?.id ?? "new"} column={editing} sectorId={current} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

// ---------------------------------------------------------------- tipos de atividade
function ActivityTypeModal({ type, onClose }: { type: OpsActivityType | null; onClose: () => void }) {
  const [name, setName] = useState(type?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useSaveActivityType();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome do tipo.");
    try { await save.mutateAsync({ id: type?.id ?? null, name, active: type?.active ?? true }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={type ? "Editar tipo de atividade" : "Novo tipo de atividade"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ActivityTypesSettings() {
  const types = useOpsActivityTypes();
  const save = useSaveActivityType();
  const [editing, setEditing] = useState<OpsActivityType | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  async function toggle(t: OpsActivityType) {
    setError(null);
    try { await save.mutateAsync({ id: t.id, name: t.name, active: !t.active }); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <div className="space-y-3" data-testid="ops-activity-types">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Tipos de atividade</h2>
          <p className="text-sm text-slate-500">Usados no registro manual da ficha do cliente.</p>
        </div>
        <Button onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden /> Novo tipo</Button>
      </div>
      {(error || types.error) && <Alert tone="error">{error ?? errorMessage(types.error)}</Alert>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {(types.data ?? []).map((t) => (
            <Row key={t.id} testid="ops-activity-type-row" color="#3B82F6" title={t.name} active={t.active} subtitle="Registro manual">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(t)} aria-label={`Editar tipo ${t.name}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => toggle(t)} aria-label={`${t.active ? "Desativar" : "Reativar"} tipo ${t.name}`}>
                {t.active ? "Desativar" : "Reativar"}
              </Button>
            </Row>
          ))}
        </ul>
      </Card>
      {editing !== undefined && <ActivityTypeModal key={editing?.id ?? "new"} type={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
