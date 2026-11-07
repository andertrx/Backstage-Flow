import { formatCnpj, formatPhone, OPS_LEAD_KIND_LABELS, type OpsLeadKind } from "@backstage/shared";
import { Building2, Handshake, NotebookPen, PhoneCall, Trash2, UserPlus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format.ts";
import {
  OPS_ONB_CONTACT_KINDS, OPS_ONB_CONTACT_LABELS, type OpsClientDataInput, type OpsClientDetail, type OpsOnbContactKind,
  useAddOnbContact, useCreateStartClient, useOpsClientData, useOpsClientStages, useRemoveOnbContact, useSaveClientData, useSaveOnbNotes,
} from "./clientsApi.ts";
import type { TasksContext } from "./tasksContext.tsx";

// ---------------------------------------------------------------------------
// Etapa 51.1 — Ficha do cliente no Onboarding: dados do cliente, o que veio do
// Comercial, contatos do onboarding (registro rápido) e observações.
// ---------------------------------------------------------------------------

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="break-words text-sm text-slate-800">{children || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

const EMPTY: OpsClientDataInput = { name: "", company: "", cnpj: "", owner_name: "", phone: "", email: "" };

/** Campos de dados do cliente (usados ao editar e ao cadastrar cliente novo). */
function DataFields({ v, set }: { v: OpsClientDataInput; set: (k: keyof OpsClientDataInput, value: string) => void }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do cliente">{(id) => <Input id={id} value={v.name} maxLength={120} onChange={(e) => set("name", e.target.value)} autoFocus />}</Field>
        <Field label="Empresa" hint="Opcional. Razão social ou nome da empresa.">{(id) => <Input id={id} value={v.company} maxLength={160} onChange={(e) => set("company", e.target.value)} />}</Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="CNPJ" hint="Opcional. Aceita o formato com letras.">{(id) => <Input id={id} value={v.cnpj} maxLength={20} onChange={(e) => set("cnpj", e.target.value)} />}</Field>
        <Field label="Responsável" hint="Opcional. Quem fala pelo cliente.">{(id) => <Input id={id} value={v.owner_name} maxLength={120} onChange={(e) => set("owner_name", e.target.value)} />}</Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Telefone" hint="Opcional. Com DDD.">{(id) => <Input id={id} type="tel" value={v.phone} maxLength={20} onChange={(e) => set("phone", e.target.value)} />}</Field>
        <Field label="E-mail" hint="Opcional.">{(id) => <Input id={id} type="email" value={v.email} maxLength={254} onChange={(e) => set("email", e.target.value)} />}</Field>
      </div>
    </>
  );
}

/** 1) Dados do cliente (o mesmo cadastro de Clientes: nada é duplicado). */
function ClientDataCard({ clientId }: { clientId: string }) {
  const q = useOpsClientData(clientId);
  const save = useSaveClientData();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<OpsClientDataInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const d = q.data;
  const set = (k: keyof OpsClientDataInput, value: string) => setV((p) => ({ ...p, [k]: value }));
  function startEdit() {
    if (!d) return;
    setV({ name: d.name, company: d.company ?? "", cnpj: d.cnpj ? formatCnpj(d.cnpj) : "", owner_name: d.owner_name ?? "",
      phone: d.phone ? formatPhone(d.phone) : "", email: d.email ?? "" });
    setError(null);
    setEditing(true);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (v.name.trim().length < 2) return setError("Escreva o nome do cliente.");
    try { await save.mutateAsync({ clientId, input: v }); setEditing(false); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Card className="space-y-3 p-4" data-testid="ops-onb-data">
      <div className="flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 text-sm font-bold text-slate-800"><Building2 className="size-4 text-blue-600" aria-hidden /> Dados do cliente</h3>
        {d?.can_edit && !editing && <Button variant="secondary" className="px-2 py-1 text-xs" onClick={startEdit}>Editar</Button>}
      </div>
      {q.error && <Alert tone="error">{errorMessage(q.error)}</Alert>}
      {q.isLoading && <div className="h-16 animate-pulse rounded-lg bg-slate-100" aria-label="Carregando" />}
      {d && !editing && (
        <dl className="grid gap-3 sm:grid-cols-3">
          <Row label="Nome">{d.name}</Row>
          <Row label="Empresa">{d.company}</Row>
          <Row label="CNPJ">{d.cnpj && formatCnpj(d.cnpj)}</Row>
          <Row label="Responsável">{d.owner_name}</Row>
          <Row label="Telefone">{d.phone && formatPhone(d.phone)}</Row>
          <Row label="E-mail">{d.email}</Row>
        </dl>
      )}
      {d && editing && (
        <form onSubmit={submit} className="space-y-3" data-testid="ops-onb-data-form">
          <DataFields v={v} set={set} />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>Salvar dados</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/** 2) O que veio alinhado do Comercial (só leitura). */
function LeadSummaryCard({ detail }: { detail: OpsClientDetail }) {
  const l = detail.onboarding?.lead;
  return (
    <Card className="space-y-3 p-4" data-testid="ops-onb-lead">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Handshake className="size-4 text-blue-600" aria-hidden /> Veio do Comercial</h3>
      {!l ? (
        <p className="text-sm text-slate-500">Entrou direto no onboarding (sem passar pelo Comercial).</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Lead #{l.number}{l.owner_name ? ` · vendido por ${l.owner_name}` : ""}{l.converted_at ? ` · liberado em ${formatDateTime(l.converted_at)}` : ""}
          </p>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Row label="Serviço de interesse">{l.service_interest}</Row>
            <Row label="Origem">{l.origin}</Row>
            <Row label="Segmento">{l.segment}</Row>
            <Row label="Cidade / Estado">{[l.city, l.state].filter(Boolean).join(" / ")}</Row>
            <Row label="Valor potencial">{l.potential_value != null && l.currency ? formatMoney(Number(l.potential_value), l.currency) : ""}</Row>
            <Row label="Entrou no Comercial">{l.entered_at && formatDate(l.entered_at)}</Row>
          </dl>
          {l.notes && (
            <div>
              <p className="text-xs font-medium text-slate-500">Resumo / observações do Comercial</p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{l.notes}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-slate-500">Contatos registrados no Comercial</p>
            {l.contacts.length === 0 ? <p className="text-sm text-slate-400">Nenhum contato registrado.</p> : (
              <ol className="mt-1 max-h-60 space-y-2 overflow-y-auto border-l-2 border-slate-100 pl-4" data-testid="ops-onb-lead-contacts">
                {l.contacts.map((c, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-slate-800">{c.kind ? OPS_LEAD_KIND_LABELS[c.kind as OpsLeadKind] ?? c.kind : "Registro"}</span>
                    {c.body && <span className="text-slate-600">: {c.body}</span>}
                    <p className="text-xs text-slate-400">{c.actor ?? "—"} · {formatDateTime(c.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/** 3) Contatos do onboarding: registro rápido (como no Comercial), mais recente primeiro. */
function ContactsCard({ detail, ctx }: { detail: OpsClientDetail; ctx: TasksContext }) {
  const add = useAddOnbContact();
  const remove = useRemoveOnbContact();
  const [kind, setKind] = useState<OpsOnbContactKind>("contato");
  const [when, setWhen] = useState(localNow());
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const contacts = detail.onboarding?.contacts ?? [];
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (body.trim().length < 3) return setError("Escreva o que aconteceu.");
    try {
      await add.mutateAsync({ clientId: detail.client.id, kind, body, when });
      setBody("");
      setWhen(localNow());
    } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Card className="space-y-3 p-4" data-testid="ops-onb-contacts">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><PhoneCall className="size-4 text-blue-600" aria-hidden /> Contatos do onboarding</h3>
      {detail.can.contact && detail.ops && (
        <form onSubmit={submit} className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="ops-onb-contact-form">
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Tipo do contato" className="w-auto py-1.5" value={kind} onChange={(e) => setKind(e.target.value as OpsOnbContactKind)}>
              {OPS_ONB_CONTACT_KINDS.map((k) => <option key={k} value={k}>{OPS_ONB_CONTACT_LABELS[k]}</option>)}
            </Select>
            <Input aria-label="Quando" type="datetime-local" className="w-auto py-1.5" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <Textarea aria-label="O que aconteceu" className="min-h-16" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)}
            placeholder="Ex.: Conversei com ele hoje, não deu certo. Marquei para amanhã às 10h." />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end"><Button type="submit" className="px-3 py-1.5 text-xs" loading={add.isPending}>Registrar</Button></div>
        </form>
      )}
      {contacts.length === 0 ? <p className="text-sm text-slate-400">Nenhum contato registrado no onboarding.</p> : (
        <ol className="space-y-2 border-l-2 border-slate-100 pl-4" data-testid="ops-onb-contact-list">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm" data-testid="ops-onb-contact">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-blue-800">{OPS_ONB_CONTACT_LABELS[c.kind]}</span>
                <span className="whitespace-pre-wrap break-words text-slate-700">: {c.body}</span>
                <p className="text-xs text-slate-400">{c.author ?? "—"} · {formatDateTime(c.happened_at)}</p>
              </div>
              {(c.created_by === ctx.me || detail.can.admin) && (
                <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label={`Retirar contato: ${c.body.slice(0, 40)}`}
                  onClick={() => remove.mutateAsync(c.id).catch((err) => setError(errorMessage(err)))}><Trash2 className="size-3.5" aria-hidden /></button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** 4) Observações do onboarding (texto livre; cada alteração fica no histórico). */
function NotesCard({ detail }: { detail: OpsClientDetail }) {
  const save = useSaveOnbNotes();
  const current = detail.onboarding?.notes ?? "";
  const [text, setText] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const o = detail.ops;
  const canEdit = Boolean(o && detail.can.move);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!o) return;
    setError(null);
    setSaved(false);
    try { await save.mutateAsync({ clientId: detail.client.id, version: o.version, notes: text }); setSaved(true); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Card className="space-y-3 p-4" data-testid="ops-onb-notes">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><NotebookPen className="size-4 text-blue-600" aria-hidden /> Observações</h3>
      {canEdit ? (
        <form onSubmit={submit} className="space-y-2">
          <Textarea aria-label="Observações do onboarding" className="min-h-28" value={text} maxLength={10000}
            onChange={(e) => { setText(e.target.value); setSaved(false); }} placeholder="Anotações sobre o cliente para o onboarding." />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs font-medium text-emerald-700">Observações salvas.</span>}
            <Button type="submit" className="px-3 py-1.5 text-xs" loading={save.isPending} disabled={text === current}>Salvar observações</Button>
          </div>
        </form>
      ) : (
        current ? <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{current}</p> : <p className="text-sm text-slate-400">Sem observações.</p>
      )}
      {detail.onboarding?.notes_at && (
        <p className="text-xs text-slate-400">Última alteração: {formatDateTime(detail.onboarding.notes_at)}{detail.onboarding.notes_by ? ` · ${detail.onboarding.notes_by}` : ""}</p>
      )}
    </Card>
  );
}

/** Aba "Onboarding" da ficha do cliente. */
export function ClientOnboardingPanel({ detail, ctx }: { detail: OpsClientDetail; ctx: TasksContext }) {
  return (
    <div className="space-y-4" data-testid="ops-client-onboarding">
      <ClientDataCard clientId={detail.client.id} />
      <LeadSummaryCard detail={detail} />
      <ContactsCard detail={detail} ctx={ctx} />
      <NotesCard detail={detail} />
    </div>
  );
}

/** Cliente novo direto no onboarding (sem passar pelo Comercial): administrador, gestor ou Account Manager. */
export function NewClientModal({ ctx, canPickAm, onClose, onCreated }: {
  ctx: TasksContext; canPickAm: boolean; onClose: () => void; onCreated?: (id: string) => void;
}) {
  const stages = useOpsClientStages();
  const create = useCreateStartClient();
  const [v, setV] = useState<OpsClientDataInput>(EMPTY);
  const [stageId, setStageId] = useState("");
  const [amId, setAmId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof OpsClientDataInput, value: string) => setV((p) => ({ ...p, [k]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (v.name.trim().length < 2) return setError("Escreva o nome do cliente.");
    try {
      const id = await create.mutateAsync({ input: v, stageId, amId: canPickAm ? amId : "" });
      onCreated?.(id);
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title="Cadastrar cliente novo no onboarding" open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4" data-testid="ops-new-client-form">
        <Alert tone="info">Para cliente que não passou pelo Comercial. Ele entra no cadastro de Clientes e já começa o onboarding.</Alert>
        <DataFields v={v} set={set} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Etapa inicial">
            {(id) => (
              <Select id={id} value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Primeira etapa</option>
                {(stages.data ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
          {canPickAm ? (
            <Field label="Account Manager">
              {(id) => (
                <Select id={id} value={amId} onChange={(e) => setAmId(e.target.value)}>
                  <option value="">Definir depois</option>
                  {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                </Select>
              )}
            </Field>
          ) : <p className="self-end text-xs text-slate-500">Você fica como Account Manager deste cliente.</p>}
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={create.isPending}><UserPlus className="size-4" aria-hidden /> Cadastrar e iniciar onboarding</Button>
        </div>
      </form>
    </Modal>
  );
}
