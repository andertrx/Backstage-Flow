import { type CampaignDraft, normalizeDraft, OBJECTIVE_LABELS, type ObjectiveId, stripAccountSpecific, TEMPLATE_SOURCE_IMPORTED, type TemplateSource } from "@backstage/shared";
import { Download, LayoutTemplate, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useMetaAccounts } from "@/features/ads-builder/api.ts";
import { confirmar } from "@/lib/confirmStore.ts";
import { errorMessage } from "@/lib/errors.ts";
import { toast } from "@/lib/toastStore.ts";
import { type BuilderTemplate, useAccountCampaigns, useArchiveTemplate, useCreateDraft, useImportCampaign, useSaveTemplate, useTemplates } from "./api.ts";

const objLabel = (o: string) => OBJECTIVE_LABELS[o as ObjectiveId] ?? "Objetivo a escolher";

function Notes({ notes, title }: { notes: string[]; title: string }) {
  if (!notes.length) return null;
  return (
    <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900" data-testid="modelo-notas">
      <p className="font-semibold">{title}</p>
      <ul className="space-y-0.5">{notes.map((n) => <li key={n}>• {n}</li>)}</ul>
    </div>
  );
}

/** Salvar um rascunho como modelo (tira o que é de uma conta só). */
export function SaveTemplateModal({ open, draft, defaultName, source = "rascunho", onClose }: { open: boolean; draft: CampaignDraft; defaultName: string; source?: TemplateSource; onClose: () => void }) {
  const save = useSaveTemplate();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stripped = stripAccountSpecific(draft);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ name, description, source, data: stripped.draft });
      toast.success("Modelo salvo. Ele aparece em Criar campanhas → Modelos de campanha.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title="Salvar como modelo de campanha" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5" noValidate data-testid="modelo-salvar">
        <p className="text-sm text-slate-600">O modelo guarda a estrutura (objetivo, orçamento, conjuntos, públicos e textos) para usar em qualquer conta.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Nome do modelo">{(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Descrição (opcional)">{(id) => <Textarea id={id} rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Notes title="Fica de fora do modelo (é de cada conta):" notes={stripped.notes} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending} disabled={name.trim().length < 2}>Salvar modelo</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Copiar uma campanha do Meta para um rascunho novo (e, se quiser, guardar como modelo). */
function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useMetaAccounts();
  const [accountId, setAccountId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const campaigns = useAccountCampaigns(accountId || null);
  const imp = useImportCampaign();
  const create = useCreateDraft();
  const navigate = useNavigate();
  const [asTemplate, setAsTemplate] = useState(false);
  const saveTemplate = useSaveTemplate();
  const [error, setError] = useState<string | null>(null);
  const account = accounts.data?.find((a) => a.id === accountId);
  const result = imp.data;

  async function createDraft() {
    if (!account || !result) return;
    setError(null);
    try {
      if (asTemplate) await saveTemplate.mutateAsync({ name: result.draft.campaign.name.replace(/ \(cópia\)$/, ""), description: `Copiado da campanha ${campaignId}`, source: TEMPLATE_SOURCE_IMPORTED, data: stripAccountSpecific(result.draft).draft });
      const r = await create.mutateAsync({ name: result.draft.campaign.name.slice(0, 120), clientId: account.client_id, adAccountId: account.id, data: result.draft });
      toast.success(asTemplate ? "Rascunho criado e modelo salvo. Confira o que precisa ser escolhido de novo." : "Rascunho criado. Confira o que precisa ser escolhido de novo.");
      onClose();
      navigate(`/criar/campanhas/${r.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Copiar campanha do Meta" open={open} size="lg" onClose={onClose}>
      <div className="space-y-4 p-5 text-sm" data-testid="modelo-copiar">
        <p className="text-slate-600">O CRM só <strong>lê</strong> a campanha no Meta e cria um rascunho aqui. A campanha original não muda.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Conta de anúncio">
            {(id) => (
              <Select id={id} value={accountId} onChange={(e) => { setAccountId(e.target.value); setCampaignId(""); imp.reset(); }}>
                <option value="">Escolha a conta...</option>
                {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.client_name} — {a.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Campanha">
            {(id) => (
              <Select id={id} value={campaignId} disabled={!accountId} onChange={(e) => { setCampaignId(e.target.value); imp.reset(); }}>
                <option value="">Escolha a campanha...</option>
                {(campaigns.data ?? []).map((c) => <option key={c.external_id} value={c.external_id}>{c.name}{c.effective_status && c.effective_status !== "ACTIVE" ? ` (${c.effective_status.toLowerCase()})` : ""}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Button variant="secondary" loading={imp.isPending} disabled={!accountId || !campaignId} onClick={() => imp.mutate({ adAccountId: accountId, campaignId })}>
          <Download className="size-4" aria-hidden /> Ler campanha no Meta
        </Button>
        {imp.error && <Alert tone="error">{errorMessage(imp.error)}</Alert>}
        {result && (
          <div className="space-y-3" data-testid="modelo-lido">
            <p className="rounded-xl bg-slate-50 p-3">
              <strong>{result.draft.campaign.name}</strong>: {objLabel(result.draft.campaign.objective)} · {result.draft.adSets.length} conjunto(s) · {result.draft.ads.length} anúncio(s).
            </p>
            <Notes title="Precisa de atenção no rascunho:" notes={result.notes} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} /> Também guardar como modelo (sem página, pixel, públicos e arquivos)</label>
            <div className="flex justify-end">
              <Button loading={create.isPending || saveTemplate.isPending} onClick={() => void createDraft()} data-testid="modelo-criar-rascunho"><Plus className="size-4" aria-hidden /> Criar rascunho</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Usar um modelo: escolhe a conta e cria o rascunho. */
function UseTemplateModal({ template, onClose }: { template: BuilderTemplate | null; onClose: () => void }) {
  const accounts = useMetaAccounts();
  const create = useCreateDraft();
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const account = accounts.data?.find((a) => a.id === accountId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!template || !account) return;
    setError(null);
    try {
      const data = normalizeDraft(template.data);
      data.campaign.status = "";
      const r = await create.mutateAsync({ name: template.name, clientId: account.client_id, adAccountId: account.id, data });
      toast.success("Rascunho criado a partir do modelo. Escolha página, pixel, públicos e arquivos da conta.");
      onClose();
      navigate(`/criar/campanhas/${r.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <Modal title={`Usar o modelo "${template?.name ?? ""}"`} open={!!template} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5" noValidate data-testid="modelo-usar">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Conta de anúncio">
          {(id) => (
            <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Escolha a conta...</option>
              {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.client_name} — {a.name}</option>)}
            </Select>
          )}
        </Field>
        <p className="text-xs text-slate-500">Página, Instagram, pixel, públicos personalizados, imagens e vídeos você escolhe no rascunho (são de cada conta). O status não vem preenchido.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={create.isPending} disabled={!account}>Criar rascunho</Button>
        </div>
      </form>
    </Modal>
  );
}

export function TemplatesCard({ canCreate }: { canCreate: boolean }) {
  const templates = useTemplates();
  const archive = useArchiveTemplate();
  const [importing, setImporting] = useState(false);
  const [using, setUsing] = useState<BuilderTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doArchive(t: BuilderTemplate) {
    if (!(await confirmar(`Arquivar o modelo "${t.name}"? Ele sai da lista, mas continua guardado.`))) return;
    setError(null);
    try {
      await archive.mutateAsync({ id: t.id, archive: true });
      toast.success("Modelo arquivado.", { label: "Desfazer", onClick: () => archive.mutateAsync({ id: t.id, archive: false }).then(() => toast.success("Modelo de volta.")).catch((e) => toast.error(errorMessage(e))) });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="space-y-3 p-5" data-testid="modelos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <LayoutTemplate className="mt-0.5 size-5 text-brand-600" aria-hidden />
          <div>
            <h2 className="text-base font-semibold">Modelos de campanha</h2>
            <p className="text-sm text-slate-500">Copie uma campanha que já roda no Meta ou use um modelo salvo para começar um rascunho pronto.</p>
          </div>
        </div>
        {canCreate && <Button variant="secondary" onClick={() => setImporting(true)} data-testid="modelo-copiar-abrir"><Download className="size-4" aria-hidden /> Copiar campanha do Meta</Button>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {templates.error && <Alert tone="error">{errorMessage(templates.error)}</Alert>}
      {templates.data && templates.data.length === 0 && <p className="text-sm text-slate-500">Nenhum modelo ainda. Salve um rascunho como modelo ou copie uma campanha do Meta.</p>}
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200 empty:hidden">
        {templates.data?.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="modelo">
            <div className="min-w-0">
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-slate-500">{objLabel(t.objective)} · {t.source === TEMPLATE_SOURCE_IMPORTED ? "copiado do Meta" : "salvo de um rascunho"}{t.description ? ` · ${t.description}` : ""}</p>
            </div>
            {canCreate && (
              <div className="flex gap-1">
                <Button variant="secondary" className="text-xs" onClick={() => setUsing(t)} aria-label={`Usar ${t.name}`}>Usar modelo</Button>
                <Button variant="ghost" className="text-xs" onClick={() => void doArchive(t)} aria-label={`Arquivar ${t.name}`}>Arquivar</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {importing && <ImportModal open={importing} onClose={() => setImporting(false)} />}
      <UseTemplateModal template={using} onClose={() => setUsing(null)} />
    </Card>
  );
}
