import { opsAddDays, opsToday } from "@backstage/shared";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import type { OpsBoardClient } from "./clientsApi.ts";
import { type OpsOnboardingTemplate, useOnboardingTemplates } from "./onboardingTemplatesApi.ts";
import { type OpsTaskInput, useSaveTask } from "./tasksApi.ts";
import type { TasksContext } from "./tasksContext.tsx";

/** Quem recebe a tarefa dentro do setor: todo mundo do setor, ou uma pessoa. */
type Mode = "setor" | "pessoa";
interface Row {
  key: string;
  template: OpsOnboardingTemplate | null;
  checked: boolean;
  title: string;
  sectorId: string;
  mode: Mode;
  person: string;
  description: string;
  showDesc: boolean;
}

const isCommercial = (name: string | undefined) => (name ?? "").trim().toLowerCase() === "comercial";

/**
 * Etapa 50.1 — "Tarefas do onboarding" do cartão do cliente: marcar as tarefas padrão (setor já definido) e/ou criar outras;
 * em cada uma, liberar para o setor inteiro ou para uma pessoa do setor.
 */
export function OnboardingTasksModal({ c, ctx, onClose, onDone, onFullForm }: {
  c: OpsBoardClient;
  ctx: TasksContext;
  onClose: () => void;
  onDone: (n: number) => void;
  onFullForm: () => void;
}) {
  const templates = useOnboardingTemplates();
  const save = useSaveTask();
  const canAssign = ctx.can("ops.tasks.assign");
  const activeTemplates = (templates.data ?? []).filter((t) => t.active);
  const [state, setState] = useState<Record<string, Row>>({});
  const [extras, setExtras] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sectorList = ctx.sectors.filter((s) => s.status === "ativo");
  const extraSectors = sectorList.filter((s) => !isCommercial(s.name));
  const peopleOf = (sectorId: string) => ctx.directory.people.filter((p) => p.sectors.includes(sectorId) || p.sector_id === sectorId);

  const rowFor = (t: OpsOnboardingTemplate): Row =>
    state[t.id] ?? { key: t.id, template: t, checked: false, title: t.title, sectorId: t.sector_id, mode: "setor", person: "", description: t.description ?? "", showDesc: false };
  const patch = (r: Row, p: Partial<Row>) => {
    if (r.template) setState((s) => ({ ...s, [r.key]: { ...r, ...p } }));
    else setExtras((l) => l.map((x) => (x.key === r.key ? { ...x, ...p } : x)));
  };
  const addExtra = () => setExtras((l) => [...l, { key: crypto.randomUUID(), template: null, checked: true, title: "", sectorId: "", mode: "setor", person: "", description: "", showDesc: true }]);

  const selected = [...activeTemplates.map(rowFor).filter((r) => r.checked), ...extras];

  const rowBody = (r: Row) => {
    const people = peopleOf(r.sectorId);
    return (
      <div className="mt-2 space-y-2 border-t border-slate-100 pt-2" data-testid="ops-onb-task-assign">
        {r.template && !r.showDesc && (
          <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => patch(r, { showDesc: true })}>
            {r.description.trim() ? "Editar descrição" : "Adicionar descrição"}
          </button>
        )}
        {(r.showDesc || !r.template) && (
          <Textarea aria-label={`Descrição: ${r.title || "nova tarefa"}`} className={r.template ? "min-h-20" : "min-h-28"} value={r.description} maxLength={5000}
            placeholder="Descreva o que precisa ser feito, o que o setor deve pedir ou entregar…" onChange={(e) => patch(r, { description: e.target.value })} />
        )}
        {canAssign ? (
          <>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700" role="radiogroup" aria-label={`Quem recebe: ${r.title || "nova tarefa"}`}>
              <label className="flex items-center gap-1.5">
                <input type="radio" name={`mode-${r.key}`} checked={r.mode === "setor"} onChange={() => patch(r, { mode: "setor" })} />
                Todo o setor{r.sectorId ? ` (${people.length} ${people.length === 1 ? "pessoa" : "pessoas"})` : ""}
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name={`mode-${r.key}`} checked={r.mode === "pessoa"} onChange={() => patch(r, { mode: "pessoa" })} />
                Uma pessoa do setor
              </label>
            </div>
            {r.mode === "pessoa" && (
              <Select aria-label={`Pessoa: ${r.title || "nova tarefa"}`} value={r.person} onChange={(e) => patch(r, { person: e.target.value })}>
                <option value="">Escolha a pessoa</option>
                {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </Select>
            )}
            {r.mode === "setor" && r.sectorId && people.length === 0 && <p className="text-xs text-amber-700">Este setor ainda não tem pessoas na Central: cadastre alguém nele antes de liberar a tarefa. Toda tarefa precisa de um responsável.</p>}
          </>
        ) : <p className="text-xs text-slate-500">A tarefa fica no setor. Quem tem a permissão de atribuir escolhe as pessoas.</p>}
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.length === 0) return setError("Marque ao menos uma tarefa padrão ou crie uma tarefa.");
    for (const r of selected) {
      if (r.title.trim().length < 3) return setError("Toda tarefa precisa de um título (mínimo 3 letras).");
      if (!r.sectorId) return setError(`Escolha o setor de "${r.title}".`);
      if (canAssign && r.mode === "pessoa" && !r.person) return setError(`Escolha a pessoa de "${r.title}" ou libere para o setor inteiro.`);
      if (canAssign && r.mode === "setor" && peopleOf(r.sectorId).length === 0) return setError(`O setor de "${r.title}" não tem ninguém na Central: escolha uma pessoa de outro setor ou cadastre alguém no setor. Toda tarefa precisa de um responsável.`);
    }
    setBusy(true);
    let made = 0;
    try {
      const statusId = ctx.statuses.find((s) => s.active)?.id;
      for (const r of selected) {
        const ids = peopleOf(r.sectorId).map((p) => p.user_id);
        const people = !canAssign ? { principal: ctx.me, adicionais: [], aprovadores: [], observadores: [] }
          : r.mode === "pessoa" ? { principal: r.person, adicionais: [], aprovadores: [], observadores: [] }
          : { principal: ids[0] ?? null, adicionais: ids.slice(1), aprovadores: [], observadores: [] };
        const t = r.template;
        const input: OpsTaskInput = {
          title: r.title.trim(), description: r.description.trim(), client_id: c.client_id, sector_id: r.sectorId, priority: t?.priority ?? "media",
          start_date: "", due_date: t?.due_days != null ? opsAddDays(opsToday(), t.due_days) : "", effort_hours: "", visibility: "setor", tags: [],
          client_stage_id: "", mandatory: false, status_id: statusId, people,
        };
        await save.mutateAsync({ id: null, version: null, input });
        made += 1;
      }
      onDone(made);
      onClose();
    } catch (err) {
      setError(`${made > 0 ? `${made} tarefa(s) já criada(s). ` : ""}${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Tarefas do onboarding: ${c.name}`} open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-5" data-testid="ops-onb-tasks">
        <p className="text-sm text-slate-600">
          Marque as tarefas padrão que quer pedir. Cada uma já vai para o setor certo; escolha se vale para <b>todo o setor</b> ou para <b>uma pessoa</b>.
          Para ir a Onboarding Realizado é preciso ao menos 1 tarefa (qualquer setor, menos Comercial).
        </p>

        <section className="space-y-2" aria-label="Tarefas padrão">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Tarefas padrão</h3>
          {templates.isLoading && <div className="h-16 animate-pulse rounded-lg bg-slate-100" aria-label="Carregando" />}
          {templates.error && <Alert tone="error">{errorMessage(templates.error)}</Alert>}
          {templates.isSuccess && activeTemplates.length === 0 && <p className="text-sm text-slate-500">Nenhuma tarefa padrão ativa. Crie outra abaixo (ou cadastre em Central → Configurações).</p>}
          {activeTemplates.map((t) => {
            const r = rowFor(t);
            const sector = ctx.sectors.find((s) => s.id === t.sector_id);
            return (
              <div key={t.id} className={cn("rounded-lg p-3 ring-1", r.checked ? "bg-blue-50/40 ring-blue-300" : "bg-white ring-slate-200")} data-testid="ops-onb-template">
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={r.checked} onChange={(e) => patch(r, { checked: e.target.checked })} />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-slate-900">{t.title}</span>
                    <span className="block text-xs text-slate-500">Setor: {sector?.name ?? "—"}{t.due_days != null ? ` · prazo ${t.due_days} dia(s)` : ""}</span>
                  </span>
                </label>
                {r.checked && rowBody(r)}
              </div>
            );
          })}
        </section>

        <section className="space-y-2" aria-label="Outras tarefas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Outras tarefas</h3>
            <Button type="button" variant="secondary" className="px-2.5 py-1 text-xs" onClick={addExtra}><Plus className="size-3.5" aria-hidden /> Criar outra tarefa</Button>
          </div>
          {extras.map((r) => (
            <div key={r.key} className="rounded-lg bg-blue-50/40 p-3 ring-1 ring-blue-300" data-testid="ops-onb-extra">
              <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                <Input aria-label="Título da outra tarefa" value={r.title} maxLength={200} placeholder="Título da tarefa" onChange={(e) => patch(r, { title: e.target.value })} />
                <Select aria-label="Setor da outra tarefa" value={r.sectorId} onChange={(e) => patch(r, { sectorId: e.target.value, person: "" })}>
                  <option value="">Setor</option>
                  {extraSectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
                <Button type="button" variant="ghost" className="px-2" onClick={() => setExtras((l) => l.filter((x) => x.key !== r.key))} aria-label="Retirar esta tarefa"><Trash2 className="size-4" aria-hidden /></Button>
              </div>
              {rowBody(r)}
            </div>
          ))}
          {extras.length === 0 && <p className="text-xs text-slate-500">Não achou a tarefa certa? Use "Criar outra tarefa".</p>}
        </section>

        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="text-xs" onClick={onFullForm}>Abrir o formulário completo de tarefa</Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={busy} data-testid="ops-onb-tasks-submit">{selected.length > 0 ? `Criar ${selected.length} tarefa(s)` : "Criar tarefas"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
