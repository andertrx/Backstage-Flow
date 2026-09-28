import { OPS_COLORS } from "@backstage/shared";
import { Pencil, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type OpsMeetingCategory, useMeetingCategories, useSaveMeetingCategory } from "./meetingsApi.ts";

function CategoryModal({ category, onClose }: { category: OpsMeetingCategory | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? OPS_COLORS[8]);
  const [error, setError] = useState<string | null>(null);
  const save = useSaveMeetingCategory();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome do tipo.");
    try { await save.mutateAsync({ id: category?.id ?? null, name, color, active: category?.active ?? true }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title={category ? "Editar tipo de reunião" : "Novo tipo de reunião"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-slate-700">Cor</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do tipo de reunião">
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

/** Tipos de reunião (Daily, Reunião de setor…). Desativar esconde das novas; as antigas continuam. */
export function MeetingCategoriesSettings() {
  const categories = useMeetingCategories();
  const save = useSaveMeetingCategory();
  const [editing, setEditing] = useState<OpsMeetingCategory | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  async function toggle(c: OpsMeetingCategory) {
    setError(null);
    try { await save.mutateAsync({ id: c.id, name: c.name, color: c.color, active: !c.active }); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <div className="space-y-3" data-testid="ops-meeting-categories">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Tipos de reunião</h2>
          <p className="text-sm text-slate-500">Usados ao agendar Dailies e reuniões. Desativar não muda as reuniões antigas.</p>
        </div>
        <Button onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden /> Novo tipo</Button>
      </div>
      {(error || categories.error) && <Alert tone="error">{error ?? errorMessage(categories.error)}</Alert>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {(categories.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="ops-meeting-category-row">
              <span className="h-8 w-1.5 rounded-full" style={{ background: c.color }} aria-hidden />
              <p className={cn("min-w-40 flex-1 font-medium", c.active ? "text-slate-900" : "text-slate-400")}>{c.name}</p>
              <Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Ativo" : "Desativado"}</Badge>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(c)} aria-label={`Editar tipo ${c.name}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => toggle(c)} aria-label={`${c.active ? "Desativar" : "Reativar"} tipo ${c.name}`}>{c.active ? "Desativar" : "Reativar"}</Button>
            </li>
          ))}
        </ul>
      </Card>
      {editing !== undefined && <CategoryModal key={editing?.id ?? "new"} category={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
