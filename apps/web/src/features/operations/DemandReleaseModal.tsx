import { OPS_PRIORITIES, OPS_PRIORITY_LABELS, type OpsPriority } from "@backstage/shared";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type OpsDemandItem, useOpsClientStages, useReleaseDemand } from "./clientsApi.ts";
import { OPS_FILE_ACCEPT } from "./tasksApi.ts";
import type { TasksContext } from "./tasksContext.tsx";

const emptyItem = (): OpsDemandItem => ({ sector_id: "", title: "", principal: "", due_date: "", priority: "media", depends_on: null });

/**
 * Liberar demanda para um ou vários setores: cada setor recebe a SUA tarefa
 * (responsável, prazo e prioridade próprios), todas ligadas à demanda original.
 */
export function DemandReleaseModal({ ctx, presetClient, onClose, onDone }: {
  ctx: TasksContext;
  presetClient?: { id: string; name: string };
  onClose: () => void;
  onDone?: (r: { number: number }) => void;
}) {
  const stages = useOpsClientStages();
  const [clientId, setClientId] = useState(presetClient?.id ?? "");
  const [title, setTitle] = useState("");
  const [briefing, setBriefing] = useState("");
  const [stageId, setStageId] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [items, setItems] = useState<OpsDemandItem[]>([emptyItem()]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const release = useReleaseDemand();
  const canAssign = ctx.can("ops.tasks.assign");
  const people = canAssign ? ctx.directory.people : ctx.directory.people.filter((p) => p.user_id === ctx.me);
  const sectorName = (id: string) => ctx.sectors.find((s) => s.id === id)?.name ?? "setor";

  const setItem = (i: number, patch: Partial<OpsDemandItem>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems((list) => list.filter((_, j) => j !== i)
    .map((it) => ({ ...it, depends_on: it.depends_on === null ? null : it.depends_on === i ? null : it.depends_on > i ? it.depends_on - 1 : it.depends_on })));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId) return setError("Escolha o cliente.");
    if (title.trim().length < 3) return setError("Escreva o título da demanda.");
    if (items.some((i) => !i.sector_id)) return setError("Escolha o setor de cada linha.");
    try {
      const r = await release.mutateAsync({ client_id: clientId, title, briefing, client_stage_id: stageId, mandatory, items, files });
      if (r.failedFiles.length) {
        setWarning(`Demanda #${r.number} liberada, mas estes arquivos não foram anexados: ${r.failedFiles.join(", ")}. Anexe pelo detalhe de cada tarefa.`);
        return;
      }
      onDone?.(r);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Liberar demanda" open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4" data-testid="ops-demand-form">
        <p className="text-sm text-slate-500">Cada setor escolhido recebe a sua tarefa, com responsável, prazo e prioridade próprios. Todas ficam ligadas a esta demanda.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            {(id) => (
              <Select id={id} value={clientId} disabled={Boolean(presetClient)} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Escolha…</option>
                {(presetClient ? [presetClient] : ctx.directory.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Título da demanda">{(id) => <Input id={id} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />}</Field>
        </div>
        <Field label="Briefing" hint="Vai na descrição de cada tarefa.">
          {(id) => <Textarea id={id} value={briefing} maxLength={10000} onChange={(e) => setBriefing(e.target.value)} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Etapa do onboarding" hint="Opcional. Liga as tarefas a uma etapa do cliente.">
            {(id) => (
              <Select id={id} value={stageId} onChange={(e) => { setStageId(e.target.value); if (!e.target.value) setMandatory(false); }}>
                <option value="">Nenhuma</option>
                {(stages.data ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={mandatory} disabled={!stageId} onChange={(e) => setMandatory(e.target.checked)} />
            Obrigatórias para o cliente avançar desta etapa
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">Setores</legend>
          {!canAssign && <p className="text-xs text-slate-500">Sem "Atribuir responsáveis", você só pode se colocar como responsável.</p>}
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-12" data-testid="ops-demand-row">
              <Select aria-label={`Setor da linha ${i + 1}`} className="sm:col-span-3" value={it.sector_id} onChange={(e) => setItem(i, { sector_id: e.target.value })}>
                <option value="">Setor…</option>
                {ctx.sectors.filter((s) => s.status === "ativo").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Input aria-label={`Título da tarefa da linha ${i + 1}`} className="sm:col-span-3" value={it.title} maxLength={200}
                placeholder={title ? `${title} — ${it.sector_id ? sectorName(it.sector_id) : "setor"}` : "Título (opcional)"}
                onChange={(e) => setItem(i, { title: e.target.value })} />
              <Select aria-label={`Responsável da linha ${i + 1}`} className="sm:col-span-2" value={it.principal} onChange={(e) => setItem(i, { principal: e.target.value })}>
                <option value="">Sem responsável</option>
                {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </Select>
              <Input aria-label={`Prazo da linha ${i + 1}`} type="date" className="sm:col-span-2" value={it.due_date} onChange={(e) => setItem(i, { due_date: e.target.value })} />
              <Select aria-label={`Prioridade da linha ${i + 1}`} className="sm:col-span-2" value={it.priority} onChange={(e) => setItem(i, { priority: e.target.value as OpsPriority })}>
                {OPS_PRIORITIES.map((p) => <option key={p} value={p}>{OPS_PRIORITY_LABELS[p]}</option>)}
              </Select>
              <div className="flex items-center gap-2 sm:col-span-12">
                {i > 0 && (
                  <Select aria-label={`Dependência da linha ${i + 1}`} className="w-auto py-1 text-xs" value={it.depends_on ?? ""}
                    onChange={(e) => setItem(i, { depends_on: e.target.value === "" ? null : Number(e.target.value) })}>
                    <option value="">Não depende de outra linha</option>
                    {items.slice(0, i).map((prev, j) => <option key={j} value={j}>Depende da linha {j + 1}{prev.sector_id ? ` (${sectorName(prev.sector_id)})` : ""}</option>)}
                  </Select>
                )}
                {items.length > 1 && (
                  <Button type="button" variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={() => removeItem(i)} aria-label={`Tirar a linha ${i + 1}`}>
                    <Trash2 className="size-3.5" aria-hidden /> Tirar
                  </Button>
                )}
              </div>
            </div>
          ))}
          {items.length < 12 && (
            <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setItems((l) => [...l, emptyItem()])}>
              <Plus className="size-3.5" aria-hidden /> Outro setor
            </Button>
          )}
        </fieldset>

        <Field label="Anexos" hint="Opcional. Vão para cada tarefa criada (até 25 MB cada; privados).">
          {(id) => <input id={id} type="file" multiple accept={OPS_FILE_ACCEPT} className="block text-sm" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />}
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        {warning && <Alert tone="warning">{warning}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>{warning ? "Fechar" : "Cancelar"}</Button>
          {!warning && <Button type="submit" loading={release.isPending}>Liberar para {items.length} setor(es)</Button>}
        </div>
      </form>
    </Modal>
  );
}
