import { OPS_COLORS, OPS_SECTOR_STATUS_LABELS, type OpsSectorStatus } from "@backstage/shared";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type OpsSector, useOpsSectors, useOpsTeam, useReorderSectors, useSaveSector, useSetSectorStatus } from "./api.ts";

function SectorModal({ sector, onClose }: { sector: OpsSector | null; onClose: () => void }) {
  const [name, setName] = useState(sector?.name ?? "");
  const [color, setColor] = useState(sector?.color ?? OPS_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveSector();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome do setor.");
    try {
      await save.mutateAsync({ id: sector?.id ?? null, name, color });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title={sector ? "Editar setor" : "Novo setor"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">Cor</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do setor">
            {OPS_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Cor ${c}`} onClick={() => setColor(c)}
                className={cn("size-8 rounded-full ring-offset-2", color === c ? "ring-2 ring-slate-900" : "ring-1 ring-slate-200")}
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

/** Mudar a situação. Se houver pessoas no setor, pergunta para onde elas vão. */
function StatusModal({ sector, sectors, people, onClose }: { sector: OpsSector; sectors: OpsSector[]; people: number; onClose: () => void }) {
  const [status, setStatus] = useState<OpsSectorStatus>(sector.status === "ativo" ? "inativo" : "ativo");
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = useSetSectorStatus();
  const needsDestination = status !== "ativo" && people > 0;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsDestination && !moveTo) return setError("Escolha para qual setor as pessoas vão.");
    try {
      await set.mutateAsync({ id: sector.id, status, moveTo: needsDestination ? moveTo : null });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title={`Situação: ${sector.name}`} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova situação" hint="Inativo: some das listas novas. Arquivado: guardado só para o histórico. Nada é apagado.">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as OpsSectorStatus)}>
              {(Object.keys(OPS_SECTOR_STATUS_LABELS) as OpsSectorStatus[]).filter((s) => s !== sector.status).map((s) => (
                <option key={s} value={s}>{OPS_SECTOR_STATUS_LABELS[s]}</option>
              ))}
            </Select>
          )}
        </Field>
        {needsDestination && (
          <Field label={`Mover as ${people} pessoa(s) deste setor para`}>
            {(id) => (
              <Select id={id} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Escolha um setor…</option>
                {sectors.filter((s) => s.status === "ativo" && s.id !== sector.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={set.isPending}>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Configurações da Central (36.1: setores). Só o admin chega aqui. */
export function SectorsSettingsPage() {
  const sectors = useOpsSectors();
  const team = useOpsTeam();
  const reorder = useReorderSectors();
  const [editing, setEditing] = useState<OpsSector | null | undefined>(undefined);
  const [statusOf, setStatusOf] = useState<OpsSector | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => {
    const count = new Map<string, number>();
    for (const m of team.data ?? []) {
      if (!m.in_ops) continue;
      for (const s of [m.primary_sector_id, ...m.secondary_sector_ids]) if (s) count.set(s, (count.get(s) ?? 0) + 1);
    }
    return count;
  }, [team.data]);
  const all = sectors.data ?? [];
  const visible = all.filter((s) => showArchived || s.status !== "arquivado");

  async function move(i: number, d: -1 | 1) {
    const ids = visible.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setError(null);
    try { await reorder.mutateAsync(ids); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <div className="space-y-4" data-testid="ops-sectors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Setores</h2>
          <p className="text-sm text-slate-500">Nome, cor e ordem dos setores. Desativar pede para onde as pessoas vão; nada é apagado.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivados
          </label>
          <Button onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden /> Novo setor</Button>
        </div>
      </div>
      {(error || sectors.error) && <Alert tone="error">{error ?? errorMessage(sectors.error)}</Alert>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {visible.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="ops-sector-row">
              <span className="h-8 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
              <div className="min-w-40 flex-1">
                <p className={cn("font-medium", s.status === "ativo" ? "text-slate-900" : "text-slate-400")}>{s.name}</p>
                <p className="text-xs text-slate-500">{people.get(s.id) ?? 0} pessoa(s)</p>
              </div>
              <Badge tone={s.status === "ativo" ? "success" : s.status === "inativo" ? "warning" : "neutral"}>{OPS_SECTOR_STATUS_LABELS[s.status]}</Badge>
              <div className="flex items-center gap-1">
                <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)} aria-label={`Subir ${s.name}`}><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === visible.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)} aria-label={`Descer ${s.name}`}><ArrowDown className="size-4" aria-hidden /></button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(s)} aria-label={`Editar ${s.name}`}>
                  <Pencil className="size-3.5" aria-hidden /> Editar
                </Button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setStatusOf(s)} aria-label={`Situação de ${s.name}`}>
                  {s.status === "ativo" ? "Desativar" : "Situação"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {editing !== undefined && <SectorModal key={editing?.id ?? "new"} sector={editing} onClose={() => setEditing(undefined)} />}
      {statusOf && <StatusModal sector={statusOf} sectors={all} people={people.get(statusOf.id) ?? 0} onClose={() => setStatusOf(null)} />}
    </div>
  );
}
