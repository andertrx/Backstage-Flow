import {
  BR_STATES, formatCnpj, formatPhone, OPS_LEAD_CURRENCIES, OPS_LEAD_KIND_LABELS, OPS_LEAD_KINDS, OPS_LEAD_ORIGIN_SUGGESTIONS, OPS_PRIORITIES,
  OPS_PRIORITY_LABELS, normalizePhone, opsToday, type OpsLeadKind, type OpsPriority,
} from "@backstage/shared";
import { AlertTriangle, Archive, ArchiveRestore, Building2, CalendarClock, Handshake, Pencil, X } from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format.ts";
import { useDebouncedValue } from "@/lib/useDebouncedValue.ts";
import {
  type OpsLeadDetail, type OpsLeadEvent, type OpsLeadInput, type OpsLeadStage, type OpsLossReason, parseMoneyInput, useAddLeadNote, useArchiveLead,
  useConvertLead, useLead, useLeadDuplicates, useLeadStages, useLossReasons, useMoveLead, useSaveLead,
} from "./commercialApi.ts";
import type { TasksContext } from "./tasksContext.tsx";

const EMPTY: OpsLeadInput = {
  company_name: "", contact_name: "", phone: "", email: "", cnpj: "", segment: "", city: "", state: "", origin: "", service_interest: "",
  owner_id: "", notes: "", potential_value: "", currency: "BRL", priority: "media", entered_at: "", next_action: "", next_action_date: "",
};

/** Aviso de possíveis duplicados: mostra, mas não impede (contatos relacionados são legítimos). */
function DuplicateWarning({ input, id }: { input: OpsLeadInput; id?: string }) {
  // Debounce de um texto (estável): um objeto novo a cada render reiniciaria o tempo sem parar.
  const key = useDebouncedValue(JSON.stringify({ id, company_name: input.company_name.trim(), email: input.email.trim(), phone: normalizePhone(input.phone),
    cnpj: input.cnpj.replace(/[^\dA-Za-z]/g, "") }), 400);
  const q = useMemo(() => JSON.parse(key) as { id?: string; company_name: string; email: string; phone: string; cnpj: string }, [key]);
  const dup = useLeadDuplicates(q, q.company_name.length >= 3 || q.email.length > 3 || q.phone.length >= 10 || q.cnpj.length >= 14);
  const d = dup.data;
  if (!d || (d.leads.length === 0 && d.clients.length === 0)) return null;
  return (
    <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="ops-lead-duplicates">
      <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-4" aria-hidden /> Parecido com cadastros que já existem</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {d.leads.map((l) => <li key={l.id}>Lead #{l.number} {l.company_name} ({l.stage_name}{l.archived ? ", arquivado" : ""}) · {l.reason}</li>)}
        {d.clients.map((c) => <li key={c.id}>Cliente {c.name} · {c.reason}</li>)}
      </ul>
      <p className="mt-1 text-xs">Confira antes de salvar. Se for outro contato da mesma empresa, pode cadastrar normalmente.</p>
    </div>
  );
}

export function LeadFormModal({ lead, stages, ctx, onClose, onSaved }: {
  lead: OpsLeadDetail["lead"] | null;
  stages: OpsLeadStage[];
  ctx: TasksContext;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const [v, setV] = useState<OpsLeadInput>(lead ? {
    company_name: lead.company_name, contact_name: lead.contact_name ?? "", phone: lead.phone ? formatPhone(lead.phone) : "", email: lead.email ?? "",
    cnpj: lead.cnpj ? formatCnpj(lead.cnpj) : "", segment: lead.segment ?? "", city: lead.city ?? "", state: lead.state ?? "", origin: lead.origin ?? "",
    service_interest: lead.service_interest ?? "", owner_id: lead.owner_id ?? "", notes: lead.notes ?? "",
    potential_value: lead.potential_value != null ? String(lead.potential_value).replace(".", ",") : "", currency: lead.currency,
    priority: lead.priority, entered_at: lead.entered_at, next_action: lead.next_action ?? "", next_action_date: lead.next_action_date ?? "",
  } : { ...EMPTY, owner_id: ctx.me, entered_at: opsToday(), stage_id: stages.find((s) => s.active && s.category === "aberto")?.id });
  const [error, setError] = useState<string | null>(null);
  const save = useSaveLead();
  const set = (k: keyof OpsLeadInput, value: string) => setV((p) => ({ ...p, [k]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (v.company_name.trim().length < 2) return setError("Informe o nome da empresa.");
    if (v.phone.trim() && !/^\d{10,15}$/.test(normalizePhone(v.phone))) return setError("Telefone: use DDD + número (ex.: (45) 99999-8888).");
    if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return setError("E-mail inválido.");
    if (v.potential_value.trim() && !/^\d+(\.\d{1,2})?$/.test(parseMoneyInput(v.potential_value))) return setError("Valor potencial: use só números (ex.: 1.500,00).");
    if (v.next_action_date && !v.next_action.trim()) return setError("Escreva qual é a próxima ação.");
    try {
      const id = await save.mutateAsync({ id: lead?.id ?? null, version: lead?.version ?? null, input: { ...v, phone: normalizePhone(v.phone) } });
      onSaved?.(id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const text = (k: keyof OpsLeadInput, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label}>{(id) => <Input id={id} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...props} />}</Field>
  );
  return (
    <Modal title={lead ? `Editar lead #${lead.number}` : "Novo lead"} open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4" data-testid="ops-lead-form">
        <div className="grid gap-3 sm:grid-cols-2">
          {text("company_name", "Nome da empresa", { maxLength: 160, autoFocus: true })}
          {text("contact_name", "Nome do contato", { maxLength: 120 })}
          {text("phone", "Telefone", { inputMode: "tel", placeholder: "(45) 99999-8888" })}
          {text("email", "E-mail", { type: "email", maxLength: 254 })}
          {text("cnpj", "CNPJ (opcional)", { maxLength: 18 })}
          {text("segment", "Segmento", { maxLength: 80 })}
          {text("city", "Cidade", { maxLength: 80 })}
          <Field label="Estado">
            {(id) => (
              <Select id={id} value={v.state} onChange={(e) => set("state", e.target.value)}>
                <option value="">—</option>
                {BR_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Origem">
            {(id) => (
              <>
                <Input id={id} list="ops-lead-origins" value={v.origin} maxLength={60} onChange={(e) => set("origin", e.target.value)} placeholder="Ex.: Instagram" />
                <datalist id="ops-lead-origins">{OPS_LEAD_ORIGIN_SUGGESTIONS.map((o) => <option key={o} value={o} />)}</datalist>
              </>
            )}
          </Field>
          {text("service_interest", "Serviço de interesse", { maxLength: 160 })}
          <Field label="Responsável comercial">
            {(id) => (
              <Select id={id} value={v.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
                <option value="">Sem responsável</option>
                {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Prioridade">
            {(id) => (
              <Select id={id} value={v.priority} onChange={(e) => set("priority", e.target.value as OpsPriority)}>
                {OPS_PRIORITIES.map((p) => <option key={p} value={p}>{OPS_PRIORITY_LABELS[p]}</option>)}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">{text("potential_value", "Valor potencial", { inputMode: "decimal", placeholder: "Ex.: 2.500,00" })}</div>
            <Field label="Moeda">
              {(id) => (
                <Select id={id} value={v.currency} onChange={(e) => set("currency", e.target.value)}>
                  {OPS_LEAD_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
            </Field>
          </div>
          {text("entered_at", "Data de entrada", { type: "date" })}
          {text("next_action", "Próxima ação", { maxLength: 200, placeholder: "Ex.: Ligar para apresentar a proposta" })}
          {text("next_action_date", "Data da próxima ação", { type: "date" })}
        </div>
        <Field label="Observações">{(id) => <Textarea id={id} value={v.notes} maxLength={5000} onChange={(e) => set("notes", e.target.value)} />}</Field>
        <DuplicateWarning input={v} id={lead?.id} />
        <p className="text-xs text-slate-500">Telefone e e-mail ficam visíveis só para o Comercial e o administrador, e nunca vão para o histórico.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>{lead ? "Salvar" : "Cadastrar lead"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Perder um lead pede o motivo (e uma observação opcional). */
export function LossModal({ reasons, onCancel, onConfirm, busy }: {
  reasons: OpsLossReason[]; onCancel: () => void; onConfirm: (reason: string, note: string) => void; busy?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Motivo da perda" open onClose={onCancel}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!reason) { setError("Escolha o motivo."); return; } onConfirm(reason, note); }}>
        <Field label="Motivo">
          {(id) => (
            <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Escolha…</option>
              {reasons.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Observação" hint="Opcional.">{(id) => <Textarea id={id} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}</Field>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={busy}>Marcar como perdido</Button>
        </div>
      </form>
    </Modal>
  );
}

const EVENT_LABELS: Record<string, string> = {
  "lead.criado": "Cadastrou o lead",
  "lead.editado": "Alterou dados",
  "lead.etapa": "Mudou de coluna",
  "lead.responsavel": "Trocou o responsável",
  "lead.interacao": "Registrou",
  "lead.arquivado": "Arquivou",
  "lead.desarquivado": "Desarquivou",
  "lead.convertido": "Converteu em cliente",
};
const FIELD_NAMES: Record<string, string> = {
  empresa: "empresa", segmento: "segmento", cidade: "cidade", uf: "estado", origem: "origem", servico: "serviço", observacoes: "observações",
  valor: "valor", moeda: "moeda", prioridade: "prioridade", entrada: "entrada", proxima_acao: "próxima ação", data_proxima_acao: "data da próxima ação",
  contato: "contato", telefone: "telefone", email: "e-mail", cnpj: "CNPJ",
};

function eventText(e: OpsLeadEvent, stage: (id: string) => string, person: (id: string) => string, reason: (id: string) => string) {
  const b = e.before ?? {};
  const a = e.after ?? {};
  switch (e.action) {
    case "lead.etapa": return `${stage(String(b.etapa))} → ${stage(String(a.etapa))}${a.motivo ? ` · motivo: ${reason(String(a.motivo))}` : ""}${a.observacao ? ` (${String(a.observacao)})` : ""}${a.regra ? ` (${String(a.regra)})` : ""}`;
    case "lead.editado": return `Mudou: ${Object.keys(a).map((k) => FIELD_NAMES[k] ?? k).join(", ")}`;
    case "lead.responsavel": return `${b.responsavel ? person(String(b.responsavel)) : "ninguém"} → ${a.responsavel ? person(String(a.responsavel)) : "ninguém"}`;
    case "lead.interacao": return `${OPS_LEAD_KIND_LABELS[e.kind as OpsLeadKind] ?? ""}: ${e.body ?? ""}`;
    case "lead.convertido": return `${a.novo ? "cliente novo criado" : "vinculado a cliente existente"}${a.onboarding === "iniciado" ? " · onboarding iniciado" : ""}`;
    default: return "";
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words text-sm text-slate-800">{children || "—"}</dd></div>;
}

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Conversão em cliente: vincular a um cadastro existente ou criar (sem duplicar). */
function ConvertPanel({ d, ctx, onDone }: { d: OpsLeadDetail; ctx: TasksContext; onDone: (msg: string) => void }) {
  const l = d.lead;
  const dup = useLeadDuplicates({ id: l.id, company_name: l.company_name, email: l.email ?? "", phone: l.phone ?? "", cnpj: l.cnpj ?? "" }, true);
  const convert = useConvertLead();
  const [start, setStart] = useState(d.can.onboarding);
  const [am, setAm] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function run(clientId: string | null) {
    setError(null);
    try {
      const r = await convert.mutateAsync({ id: l.id, version: l.version, clientId, start, amId: am });
      onDone(`${r.created ? "Cliente criado" : "Lead vinculado ao cliente"}${r.onboarding === "iniciado" ? " e onboarding iniciado" : r.onboarding === "ja_estava" ? " (o cliente já estava no onboarding)" : ""}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <section className="space-y-3 rounded-xl bg-emerald-50/60 p-4 ring-1 ring-emerald-200" data-testid="ops-lead-convert">
      <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900"><Handshake className="size-4" aria-hidden /> Converter em cliente</h3>
      <p className="text-sm text-slate-700">Antes de criar, confira se o cliente já existe. O histórico comercial fica guardado no lead.</p>
      {(dup.data?.clients.length ?? 0) > 0 ? (
        <ul className="space-y-1.5">
          {dup.data?.clients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <Building2 className="size-4 text-slate-400" aria-hidden />
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className="text-xs text-slate-500">{c.reason}</span>
              <Button className="ml-auto px-2.5 py-1 text-xs" variant="secondary" loading={convert.isPending} onClick={() => run(c.id)}
                aria-label={`Vincular a ${c.name}`}>Vincular a este cliente</Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">{dup.isLoading ? "Procurando clientes parecidos…" : "Nenhum cliente parecido no cadastro."}</p>}
      {d.can.onboarding ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={start} onChange={(e) => setStart(e.target.checked)} /> Iniciar o onboarding</label>
          {start && (
            <Select aria-label="Account Manager do onboarding" className="w-auto py-1.5" value={am} onChange={(e) => setAm(e.target.value)}>
              <option value="">Account Manager: definir depois</option>
              {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
            </Select>
          )}
        </div>
      ) : <p className="text-xs text-slate-500">O onboarding pode ser iniciado depois, em Clientes, por quem cuida do fluxo operacional.</p>}
      {d.can.create_client ? (
        <Button loading={convert.isPending} onClick={() => run(null)}>Criar cliente novo com os dados do lead</Button>
      ) : <p className="text-xs text-slate-500">Criar um cliente novo é só para administrador ou gestor. Você pode vincular a um cliente que já existe.</p>}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}

/** Painel do lead: dados, coluna, registros, histórico comercial e conversão. */
export function LeadDrawer({ id, ctx, onClose }: { id: string; ctx: TasksContext; onClose: () => void }) {
  const q = useLead(id);
  const stages = useLeadStages();
  const reasons = useLossReasons();
  const move = useMoveLead();
  const archive = useArchiveLead();
  const note = useAddLeadNote();
  const [editing, setEditing] = useState(false);
  const [losing, setLosing] = useState<string | null>(null);
  const [kind, setKind] = useState<OpsLeadKind>("contato");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState(localNow());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const d = q.data;
  const l = d?.lead;
  const names = useMemo(() => {
    const st = new Map((stages.data ?? []).map((s) => [s.id, s.name]));
    const pp = new Map(ctx.directory.people.map((p) => [p.user_id, p.name]));
    const rr = new Map((reasons.data ?? []).map((r) => [r.id, r.name]));
    return { stage: (x: string) => st.get(x) ?? x, person: (x: string) => pp.get(x) ?? "pessoa", reason: (x: string) => rr.get(x) ?? x };
  }, [stages.data, ctx.directory.people, reasons.data]);

  async function changeStage(stageId: string, lossReason?: string, lossNote?: string) {
    if (!l) return;
    const target = stages.data?.find((s) => s.id === stageId);
    if (target?.category === "perdido" && !lossReason) { setLosing(stageId); return; }
    setError(null);
    try {
      await move.mutateAsync({ id: l.id, version: l.version, stageId, lossReason, lossNote });
      setLosing(null);
    } catch (err) { setError(errorMessage(err)); setLosing(null); }
  }
  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!l) return;
    setError(null);
    if (body.trim().length < 2) return setError("Escreva o que aconteceu.");
    try { await note.mutateAsync({ leadId: l.id, kind, body, happenedAt: when }); setBody(""); } catch (err) { setError(errorMessage(err)); }
  }
  async function toggleArchive() {
    if (!l) return;
    setError(null);
    try { await archive.mutateAsync({ id: l.id, archived: !l.archived_at }); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={l ? `Lead #${l.number}` : "Lead"} data-testid="ops-lead-drawer"
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400">{l ? `Lead #${l.number}` : " "}{l?.archived_at ? " · arquivado" : ""}</p>
            <h2 className="break-words text-lg font-bold text-slate-900">{l?.company_name ?? "Carregando…"}</h2>
          </div>
          {l && !l.archived_at && <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setEditing(true)}><Pencil className="size-3.5" aria-hidden /> Editar</Button>}
          {l && (
            <Button variant="secondary" className="px-2.5 py-1.5 text-xs" loading={archive.isPending} onClick={toggleArchive}>
              {l.archived_at ? <><ArchiveRestore className="size-3.5" aria-hidden /> Desarquivar</> : <><Archive className="size-3.5" aria-hidden /> Arquivar</>}
            </Button>
          )}
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar lead"><X className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {q.error && <Alert tone="error">{errorMessage(q.error)}</Alert>}
          {q.isLoading && <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />}
          {d && l && (
            <>
              {error && <Alert tone="error">{error}</Alert>}
              {notice && <Alert tone="success">{notice}</Alert>}
              <div className="flex flex-wrap items-center gap-3">
                {!l.archived_at ? (
                  <Select aria-label="Coluna do lead" className="w-auto py-1.5" value={l.stage_id} disabled={move.isPending} onChange={(e) => changeStage(e.target.value)}>
                    {(stages.data ?? []).filter((s) => s.active || s.id === l.stage_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                ) : <span className="text-sm font-semibold">{l.stage_name}</span>}
                <span className="text-xs text-slate-500">desde {formatDateTime(l.stage_since)}</span>
                {l.overdue && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">Próxima ação atrasada</span>}
              </div>
              {l.category === "perdido" && (
                <Alert tone="warning">Perdido: {l.loss_reason ?? "—"}{l.loss_note ? ` · ${l.loss_note}` : ""}{l.lost_at ? ` (${formatDateTime(l.lost_at)})` : ""}</Alert>
              )}
              {l.client_id && (
                <Alert tone="success">
                  Virou cliente: <Link className="font-semibold underline" to={`/clientes/${l.client_id}`}>{l.client_name}</Link>
                  {l.converted_at && ` · ${formatDateTime(l.converted_at)} por ${l.converted_by_name ?? "—"}`}
                  {d.can.client_ops && <> · <Link className="font-semibold underline" to={`/operacoes/clientes?cliente=${l.client_id}`}>ficha operacional</Link></>}
                </Alert>
              )}
              {l.category === "ganho" && !l.client_id && !l.archived_at && <ConvertPanel d={d} ctx={ctx} onDone={setNotice} />}

              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Row label="Contato">{l.contact_name}</Row>
                <Row label="Telefone">{l.phone && formatPhone(l.phone)}</Row>
                <Row label="E-mail">{l.email}</Row>
                <Row label="CNPJ">{l.cnpj && formatCnpj(l.cnpj)}</Row>
                <Row label="Segmento">{l.segment}</Row>
                <Row label="Cidade / Estado">{[l.city, l.state].filter(Boolean).join(" / ")}</Row>
                <Row label="Origem">{l.origin}</Row>
                <Row label="Serviço de interesse">{l.service_interest}</Row>
                <Row label="Responsável comercial">{l.owner_name}</Row>
                <Row label="Prioridade">{OPS_PRIORITY_LABELS[l.priority]}</Row>
                <Row label="Valor potencial">{l.potential_value != null ? formatMoney(Number(l.potential_value), l.currency) : ""}</Row>
                <Row label="Data de entrada">{formatDate(l.entered_at)}</Row>
                <Row label="Próxima ação">{l.next_action ? `${l.next_action}${l.next_action_date ? ` · ${formatDate(l.next_action_date)}` : ""}` : ""}</Row>
                <Row label="Última interação">{l.last_interaction_at && formatDateTime(l.last_interaction_at)}</Row>
              </dl>
              {l.notes && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{l.notes}</p>}

              <form onSubmit={addNote} className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="ops-lead-note-form">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Registrar</p>
                <div className="flex flex-wrap gap-2">
                  <Select aria-label="Tipo de registro" className="w-auto py-1.5" value={kind} onChange={(e) => setKind(e.target.value as OpsLeadKind)}>
                    {OPS_LEAD_KINDS.map((k) => <option key={k} value={k}>{OPS_LEAD_KIND_LABELS[k]}</option>)}
                  </Select>
                  <Input aria-label="Quando" type="datetime-local" className="w-auto py-1.5" value={when} onChange={(e) => setWhen(e.target.value)} />
                </div>
                <Textarea aria-label="O que aconteceu" className="min-h-16" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder="Ex.: Liguei e marquei a reunião para quinta." />
                <div className="flex justify-end"><Button type="submit" className="px-3 py-1.5 text-xs" loading={note.isPending}>Registrar</Button></div>
              </form>

              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Histórico comercial</h3>
                <ol className="space-y-2 border-l-2 border-slate-100 pl-4" data-testid="ops-lead-history">
                  {d.events.map((e) => {
                    const t = eventText(e, names.stage, names.person, names.reason);
                    return (
                      <li key={e.id} className="text-sm">
                        <span className={cn("font-medium", e.action === "lead.interacao" ? "text-blue-800" : "text-slate-800")}>{EVENT_LABELS[e.action] ?? e.action}</span>
                        {t && <span className="text-slate-600"> · {t}</span>}
                        <p className="text-xs text-slate-400">{e.origin === "sistema" ? "Sistema" : e.actor ?? "—"} · {formatDateTime(e.happened_at ?? e.created_at)}</p>
                      </li>
                    );
                  })}
                </ol>
              </section>
              <p className="flex items-center gap-1 text-xs text-slate-400"><CalendarClock className="size-3" aria-hidden /> Cadastrado por {l.created_by_name ?? "—"} em {formatDateTime(l.created_at)}. Nada é apagado.</p>
            </>
          )}
        </div>
      </aside>
      {editing && l && stages.data && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <LeadFormModal lead={l} stages={stages.data} ctx={ctx} onClose={() => setEditing(false)} />
        </div>
      )}
      {losing && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <LossModal reasons={reasons.data ?? []} busy={move.isPending} onCancel={() => setLosing(null)} onConfirm={(r, n) => changeStage(losing, r, n)} />
        </div>
      )}
    </div>
  );
}
