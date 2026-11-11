import { OPS_PRIORITIES, OPS_PRIORITY_LABELS, type OpsPriority } from "@backstage/shared";
import { ListChecks, Pencil, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { SortableList } from "@/components/ui/sortable-list.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { ConfigExcluir } from "./ConfigExcluir.tsx";
import { splitActive } from "./configOptionsApi.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type OpsOnboardingTemplate, useOnboardingTemplates, useReorderOnboardingTemplates, useSaveOnboardingTemplate, useSetOnboardingTemplateActive } from "./onboardingTemplatesApi.ts";
import { useOpsSectors } from "./api.ts";

function TemplateModal({ template, onClose }: { template: OpsOnboardingTemplate | null; onClose: () => void }) {
  const sectors = useOpsSectors();
  const save = useSaveOnboardingTemplate();
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [sector, setSector] = useState(template?.sector_id ?? "");
  const [priority, setPriority] = useState<OpsPriority>(template?.priority ?? "media");
  const [days, setDays] = useState(template?.due_days != null ? String(template.due_days) : "");
  const [error, setError] = useState<string | null>(null);
  const options = (sectors.data ?? []).filter((s) => (s.status === "ativo" && s.name.trim().toLowerCase() !== "comercial") || s.id === template?.sector_id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError("Dê um título à tarefa padrão (mínimo 3 letras).");
    if (!sector) return setError("Escolha o setor.");
    try {
      await save.mutateAsync({ id: template?.id ?? null, input: { title, description, sector_id: sector, priority, due_days: days } });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title={template ? "Editar tarefa padrão" : "Nova tarefa padrão"} open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" data-testid="ops-template-form">
        <Field label="Título">{(id) => <Input id={id} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Pegar acessos (Meta, Google)" />}</Field>
        <Field label="Setor" hint="A tarefa já nasce atribuída a este setor; no cartão do cliente escolhe-se o setor inteiro ou uma pessoa.">
          {(id) => (
            <Select id={id} value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Escolha o setor</option>
              {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Descrição (opcional)">{(id) => <Textarea id={id} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prioridade">
            {(id) => (
              <Select id={id} value={priority} onChange={(e) => setPriority(e.target.value as OpsPriority)}>
                {OPS_PRIORITIES.map((p) => <option key={p} value={p}>{OPS_PRIORITY_LABELS[p]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Prazo em dias (opcional)" hint="Conta a partir do dia em que a tarefa é criada.">
            {(id) => <Input id={id} inputMode="numeric" value={days} maxLength={2} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 3" />}
          </Field>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Configurações → Tarefas padrão do onboarding (só admin). */
export function OnboardingTemplatesSettings() {
  const templates = useOnboardingTemplates();
  const sectors = useOpsSectors();
  const setActive = useSetOnboardingTemplateActive();
  const reorder = useReorderOnboardingTemplates();
  const [editing, setEditing] = useState<OpsOnboardingTemplate | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const list = templates.data ?? [];
  const sectorName = (id: string) => sectors.data?.find((s) => s.id === id)?.name ?? "—";

  async function toggle(t: OpsOnboardingTemplate) {
    setError(null);
    try { await setActive.mutateAsync({ id: t.id, active: !t.active }); } catch (err) { setError(errorMessage(err)); }
  }
  const { active, inactive } = splitActive(list, (t) => t.active);
  const byId = new Map(list.map((t) => [t.id, t]));
  async function reorderTo(next: string[]) {
    setError(null);
    try { await reorder.mutateAsync([...next, ...inactive.map((t) => t.id)]); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <div className="space-y-3" data-testid="ops-onboarding-templates">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><ListChecks className="size-4 text-blue-600" aria-hidden /> Tarefas padrão do onboarding</h2>
          <p className="text-sm text-slate-500">Aparecem para marcar no cartão do cliente (Onboarding). Cada uma já vem com o setor; lá se escolhe o setor inteiro ou uma pessoa.</p>
        </div>
        <Button onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden /> Nova tarefa padrão</Button>
      </div>
      {(error || templates.error) && <Alert tone="error">{error ?? errorMessage(templates.error)}</Alert>}
      <SortableList items={active.map((t) => t.id)} fixed={inactive.map((t) => t.id)} onReorder={(ids) => void reorderTo(ids)}
        label={(id) => byId.get(id)?.title ?? id} testId="ops-template-list">
        {(id) => {
          const t = byId.get(id)!;
          return (
            <div className="flex flex-1 flex-wrap items-center gap-3 py-1.5" data-testid="ops-template-row">
              <div className="min-w-48 flex-1">
                <p className={t.active ? "font-medium text-slate-900" : "font-medium text-slate-400"}>{t.title}</p>
                <p className="text-xs text-slate-500">{sectorName(t.sector_id)} · {OPS_PRIORITY_LABELS[t.priority]}{t.due_days != null ? ` · prazo ${t.due_days} dia(s)` : ""}</p>
              </div>
              <Badge tone={t.active ? "success" : "neutral"}>{t.active ? "Ativa" : "Desativada"}</Badge>
              <div className="flex items-center gap-1">
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(t)} aria-label={`Editar tarefa padrão ${t.title}`}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => toggle(t)} aria-label={`${t.active ? "Desativar" : "Reativar"} tarefa padrão ${t.title}`}>{t.active ? "Desativar" : "Reativar"}</Button>
                <ConfigExcluir kind="onboarding_template" id={t.id} name={t.title} />
              </div>
            </div>
          );
        }}
      </SortableList>
      {templates.isSuccess && list.length === 0 && <p className="rounded-lg px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nenhuma tarefa padrão ainda.</p>}
      {editing !== undefined && <TemplateModal key={editing?.id ?? "new"} template={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
