import {
  OPS_PERSON_ROLE_LABELS, OPS_PRIORITIES, OPS_PRIORITY_LABELS, OPS_VISIBILITIES, OPS_VISIBILITY_LABELS, type OpsPriority, type OpsVisibility,
} from "@backstage/shared";
import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import type { OpsSector } from "./api.ts";
import {
  type OpsDirectory, type OpsPeopleInput, type OpsStatus, type OpsTaskDetail, type OpsTaskInput, type OpsTaskPerson, useSaveTask,
} from "./tasksApi.ts";

type Person = OpsDirectory["people"][number];

export function peopleInputFrom(people: OpsTaskPerson[]): OpsPeopleInput {
  const of = (role: OpsTaskPerson["role"]) => people.filter((p) => p.role === role).map((p) => p.user_id);
  return { principal: of("principal")[0] ?? null, adicionais: of("adicional"), aprovadores: of("aprovador"), observadores: of("observador") };
}

/** Uma lista de pessoas (chips + escolher mais). */
function PeopleList({ label, value, onChange, options, disabled }: {
  label: string; value: string[]; onChange: (v: string[]) => void; options: Person[]; disabled?: boolean;
}) {
  const names = new Map(options.map((p) => [p.user_id, p.name]));
  const free = options.filter((p) => !value.includes(p.user_id));
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2 pr-1 text-xs font-medium text-blue-800">
            {names.get(id) ?? "Pessoa fora da Central"}
            {!disabled && (
              <button type="button" className="rounded-full p-0.5 hover:bg-blue-100" onClick={() => onChange(value.filter((v) => v !== id))}
                aria-label={`Tirar ${names.get(id) ?? "pessoa"} de ${label}`}><X className="size-3" aria-hidden /></button>
            )}
          </span>
        ))}
        {!disabled && free.length > 0 && (
          <select aria-label={`Adicionar em ${label}`} className="rounded-lg border-0 bg-white py-1 pl-2 pr-7 text-xs text-slate-600 ring-1 ring-inset ring-slate-300"
            value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
            <option value="">+ adicionar</option>
            {free.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
          </select>
        )}
        {value.length === 0 && (disabled || free.length === 0) && <span className="text-xs text-slate-400">Ninguém</span>}
      </div>
    </div>
  );
}

/**
 * Pessoas da tarefa. Sem "atribuir responsáveis", a pessoa só pode colocar a si
 * mesma (o banco confere de novo).
 */
export function PeopleFields({ value, onChange, people, me, canAssign }: {
  value: OpsPeopleInput; onChange: (v: OpsPeopleInput) => void; people: Person[]; me: string; canAssign: boolean;
}) {
  const options = canAssign ? people : people.filter((p) => p.user_id === me);
  const others = (except: keyof OpsPeopleInput) =>
    options.filter((p) => (["principal", "adicionais", "aprovadores", "observadores"] as const)
      .filter((k) => k !== except)
      .every((k) => (k === "principal" ? value.principal !== p.user_id : !value[k].includes(p.user_id))));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={OPS_PERSON_ROLE_LABELS.principal}>
        {(id) => (
          <Select id={id} value={value.principal ?? ""} onChange={(e) => onChange({ ...value, principal: e.target.value || null })}>
            <option value="">Sem responsável</option>
            {others("principal").map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
            {value.principal && !options.some((p) => p.user_id === value.principal) && <option value={value.principal}>Pessoa atual</option>}
          </Select>
        )}
      </Field>
      <PeopleList label="Responsáveis adicionais" value={value.adicionais} onChange={(v) => onChange({ ...value, adicionais: v })} options={others("adicionais")} />
      <PeopleList label="Aprovadores" value={value.aprovadores} onChange={(v) => onChange({ ...value, aprovadores: v })} options={others("aprovadores")} />
      <PeopleList label="Observadores" value={value.observadores} onChange={(v) => onChange({ ...value, observadores: v })} options={others("observadores")} />
    </div>
  );
}

export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out.slice(0, 20);
}

/** Nova tarefa ou editar os dados (status e pessoas de uma tarefa existente mudam no detalhe). */
export function TaskFormModal({ detail, sectors, statuses, directory, me, mySector, canAssign, canChangeSector, onClose, onSaved }: {
  detail: OpsTaskDetail | null;
  sectors: OpsSector[];
  statuses: OpsStatus[];
  directory: OpsDirectory;
  me: string;
  mySector: string | null;
  canAssign: boolean;
  canChangeSector: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const t = detail?.task;
  const [input, setInput] = useState<OpsTaskInput>({
    title: t?.title ?? "",
    description: t?.description ?? "",
    client_id: t?.client_id ?? "",
    sector_id: t?.sector_id ?? mySector ?? "",
    priority: t?.priority ?? "media",
    start_date: t?.start_date ?? "",
    due_date: t?.due_date ?? "",
    effort_hours: t?.effort_hours != null ? String(t.effort_hours).replace(".", ",") : "",
    visibility: t?.visibility ?? "setor",
    tags: detail?.tags ?? [],
    status_id: t ? undefined : statuses.find((s) => s.active)?.id,
    people: t ? undefined : { principal: me, adicionais: [], aprovadores: [], observadores: [] },
  });
  const [tagsText, setTagsText] = useState((detail?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const save = useSaveTask();
  const set = <K extends keyof OpsTaskInput>(k: K, v: OpsTaskInput[K]) => setInput((p) => ({ ...p, [k]: v }));

  const sectorOptions = sectors.filter((s) => s.status === "ativo" || s.id === t?.sector_id);
  const clientOptions = directory.clients.filter((c) => c.status !== "encerrado" || c.id === t?.client_id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (input.title.trim().length < 3) return setError("Escreva o título (mínimo 3 letras).");
    if (!input.sector_id) return setError("Escolha o setor da tarefa.");
    if (input.start_date && input.due_date && input.due_date < input.start_date) return setError("O prazo não pode ser antes do início.");
    if (input.effort_hours.trim() && !/^\d{1,5}([.,]\d{1,2})?$/.test(input.effort_hours.trim())) return setError("Esforço: use horas, por exemplo 2 ou 1,5.");
    try {
      const id = await save.mutateAsync({ id: t?.id ?? null, version: t?.version ?? null, input: { ...input, tags: parseTags(tagsText) } });
      onSaved?.(id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={t ? `Editar tarefa #${t.number}` : "Nova tarefa"} open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4" data-testid="ops-task-form">
        <Field label="Título">{(id) => <Input id={id} value={input.title} maxLength={200} onChange={(e) => set("title", e.target.value)} autoFocus />}</Field>
        <Field label="Descrição" hint="Opcional.">
          {(id) => <Textarea id={id} value={input.description} maxLength={10000} onChange={(e) => set("description", e.target.value)} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente" hint="Opcional. Só o nome: nada de anúncios aqui.">
            {(id) => (
              <Select id={id} value={input.client_id} onChange={(e) => set("client_id", e.target.value)}>
                <option value="">Sem cliente (tarefa interna)</option>
                {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Setor" hint={t && !canChangeSector ? "Mudar o setor pede a permissão \"Mudar o setor das tarefas\"." : undefined}>
            {(id) => (
              <Select id={id} value={input.sector_id} disabled={Boolean(t) && !canChangeSector} onChange={(e) => set("sector_id", e.target.value)}>
                <option value="">Escolha…</option>
                {sectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
          {!t && (
            <Field label="Status inicial">
              {(id) => (
                <Select id={id} value={input.status_id} onChange={(e) => set("status_id", e.target.value)}>
                  {statuses.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Field label="Prioridade">
            {(id) => (
              <Select id={id} value={input.priority} onChange={(e) => set("priority", e.target.value as OpsPriority)}>
                {OPS_PRIORITIES.map((p) => <option key={p} value={p}>{OPS_PRIORITY_LABELS[p]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Início">{(id) => <Input id={id} type="date" value={input.start_date} onChange={(e) => set("start_date", e.target.value)} />}</Field>
          <Field label="Prazo">{(id) => <Input id={id} type="date" value={input.due_date} onChange={(e) => set("due_date", e.target.value)} />}</Field>
          <Field label="Esforço estimado (horas)" hint="Opcional.">
            {(id) => <Input id={id} inputMode="decimal" value={input.effort_hours} onChange={(e) => set("effort_hours", e.target.value)} placeholder="Ex.: 1,5" />}
          </Field>
          <Field label="Quem vê">
            {(id) => (
              <Select id={id} value={input.visibility} onChange={(e) => set("visibility", e.target.value as OpsVisibility)}>
                {OPS_VISIBILITIES.map((v) => <option key={v} value={v}>{OPS_VISIBILITY_LABELS[v]}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Etiquetas" hint="Separe por vírgula. Ex.: Campanha, Urgente cliente">
          {(id) => <Input id={id} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />}
        </Field>
        {!t && input.people && (
          <fieldset className="space-y-2 rounded-xl bg-slate-50 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">Pessoas</legend>
            {!canAssign && <p className="text-xs text-slate-500">Você pode colocar só você mesmo. Para atribuir outras pessoas, peça a permissão "Atribuir responsáveis".</p>}
            <PeopleFields value={input.people} onChange={(v) => set("people", v)} people={directory.people} me={me} canAssign={canAssign} />
          </fieldset>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>{t ? "Salvar" : "Criar tarefa"}</Button>
        </div>
      </form>
    </Modal>
  );
}
