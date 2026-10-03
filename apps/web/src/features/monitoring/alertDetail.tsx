import type { ComparedMetric } from "@backstage/shared";
import { CheckCircle2, ClipboardList, ExternalLink, MessageSquare, Wrench } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useMyOpsPermissions, useOpsSectors } from "@/features/operations/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatDateTime } from "@/lib/format.ts";
import {
  type AlertEvent,
  type AlertStatus,
  useAlertAssignees,
  useAlertDetail,
  useAlertProvidence,
  useAlertToTask,
  useAssignAlert,
  useCommentAlert,
  useMarkAlertSeen,
  useResolveAlert,
  useSetAlertStatus,
} from "./api.ts";
import { fmtMetric, SEVERITY_LOOK, SeverityBadge } from "./compare.tsx";

export const STATUS_LABELS: Record<AlertStatus, string> = {
  novo: "Novo",
  visualizado: "Visualizado",
  em_analise: "Em análise",
  aguardando_acao: "Aguardando ação",
  resolvido: "Resolvido",
  ignorado: "Ignorado",
};

/** Estados que a pessoa escolhe (Novo é só o inicial; Resolvido tem botão próprio). */
const SETTABLE: AlertStatus[] = ["visualizado", "em_analise", "aguardando_acao", "ignorado"];

export function StatusBadge({ status }: { status: AlertStatus }) {
  const tone = status === "novo" ? "bg-brand-50 text-brand-700 ring-brand-200"
    : status === "resolvido" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : status === "ignorado" ? "bg-slate-100 text-slate-500 ring-slate-200"
    : "bg-amber-50 text-amber-800 ring-amber-200";
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tone)} data-status={status}>{STATUS_LABELS[status]}</span>;
}

const label = (v: string | null) => (v && v in STATUS_LABELS ? STATUS_LABELS[v as AlertStatus] : v ?? "—");

/** Texto de cada item da linha do tempo. */
function eventText(e: AlertEvent): string {
  switch (e.kind) {
    case "criado": return "Alerta criado pelo monitoramento.";
    case "piorou": return `Piorou: de ${label(e.from_value)} para ${label(e.to_value)}.`;
    case "melhorou": return `Melhorou: de ${label(e.from_value)} para ${label(e.to_value)}.`;
    case "normalizado": return e.note ?? "Encerrado automaticamente.";
    case "estado": return e.to_value === "resolvido" ? "Resolveu o alerta." : `Mudou o estado de “${label(e.from_value)}” para “${label(e.to_value)}”.`;
    case "atribuido": return e.to_value === "ninguém" ? "Tirou o responsável." : `Definiu como responsável: ${e.to_value}.`;
    case "comentario": return "Comentou:";
    case "providencia": return "Registrou a providência:";
    case "tarefa": return `Criou a tarefa nº ${String(e.data.task_number ?? "")} na Central de Operações.`;
    case "avaliacao": return e.note ?? "Avaliação posterior.";
  }
}

const EVENT_DOT: Partial<Record<AlertEvent["kind"], string>> = {
  criado: "bg-red-500", piorou: "bg-red-500", melhorou: "bg-emerald-500", normalizado: "bg-emerald-500", providencia: "bg-brand-600",
  tarefa: "bg-brand-600", avaliacao: "bg-amber-500",
};

function Timeline({ events }: { events: AlertEvent[] }) {
  return (
    <ol className="space-y-3" data-testid="linha-do-tempo">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm" data-kind={e.kind}>
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", EVENT_DOT[e.kind] ?? "bg-slate-400")} aria-hidden />
          <div className="min-w-0">
            <p className="text-slate-800">
              <span className="font-medium">{e.actor_name ?? "Sistema"}</span> · {eventText(e)}
            </p>
            {(e.kind === "comentario" || e.kind === "providencia" || (e.kind === "estado" && e.note)) && (
              <p className="mt-0.5 whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-1 text-slate-700">{e.note}</p>
            )}
            {e.kind === "avaliacao" && e.data.from != null && (
              <p className="text-xs text-slate-500">Dias comparados: {formatDate(String(e.data.from))} a {formatDate(String(e.data.to))} × os 7 dias antes da providência.</p>
            )}
            <p className="text-xs text-slate-400">{formatDateTime(e.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Painel do alerta: dados, ações (quem pode tratar) e a linha do tempo completa. */
export function AlertDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading, error } = useAlertDetail(id);
  const seen = useMarkAlertSeen();
  const seenSent = useRef(false);
  const a = data?.alert;
  const canHandle = Boolean(data?.can_handle);
  const isOpen = Boolean(a && !a.resolved_at);

  // Quem pode tratar e abre um alerta "Novo": vira "Visualizado".
  useEffect(() => {
    if (a && canHandle && a.status === "novo" && !a.resolved_at && !seenSent.current) {
      seenSent.current = true;
      seen.mutate(a.id);
    }
  }, [a, canHandle, seen]);

  const entity = a ? ((a.level === "ad" ? a.ad_name : a.campaign_name) ?? "—") : "";
  return (
    <Modal title="Alerta de desempenho" open onClose={onClose} size="lg">
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {a && data && (
        <div className="space-y-5" data-testid="detalhe-alerta">
          <div className={cn("space-y-1.5 border-l-4 pl-3", SEVERITY_LOOK[a.severity].border)}>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={a.severity} />
              <StatusBadge status={a.status} />
              {a.assignee_name && <span className="text-xs text-slate-600">Responsável: <strong>{a.assignee_name}</strong></span>}
            </div>
            <p className="font-medium text-slate-900">{a.level === "ad" ? "Anúncio" : "Campanha"}: {entity}</p>
            <p className="text-xs text-slate-500">{a.client_name} · {a.account_name}{a.level === "ad" && a.campaign_name ? <> · {a.campaign_name}</> : null}</p>
            <p className="text-sm text-slate-800">{a.explanation}</p>
            {a.kind === "limite" && a.current_value != null && (
              <p className="text-xs text-slate-500">
                Agora: {fmtMetric(a.metric as ComparedMetric, a.current_value, a.currency)} (antes {fmtMetric(a.metric as ComparedMetric, a.previous_value, a.currency)}) ·
                Período: {formatDate(a.period_from)} a {formatDate(a.period_to)}
              </p>
            )}
            {a.task_id && (
              <Link to={`/operacoes/tarefas?tarefa=${a.task_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline" data-testid="link-tarefa">
                <ExternalLink className="size-3.5" aria-hidden /> Ver a tarefa nº {a.task_number} na Central de Operações
              </Link>
            )}
          </div>

          {canHandle ? (
            <HandlePanel key={a.id} detailId={a.id} version={a.version} status={a.status} assignedTo={a.assigned_to} isOpen={isOpen} hasTask={Boolean(a.task_id)} />
          ) : (
            <p className="text-xs text-slate-500" data-testid="so-leitura">Você pode ver este alerta, mas não tratá-lo.</p>
          )}

          <section aria-labelledby="historico-alerta" className="space-y-2">
            <h3 id="historico-alerta" className="text-sm font-semibold">Linha do tempo</h3>
            <Timeline events={data.events} />
          </section>
        </div>
      )}
    </Modal>
  );
}

function HandlePanel({ detailId, version, status, assignedTo, isOpen, hasTask }: {
  detailId: number; version: number; status: AlertStatus; assignedTo: string | null; isOpen: boolean; hasTask: boolean;
}) {
  const setStatus = useSetAlertStatus();
  const assign = useAssignAlert();
  const resolve = useResolveAlert();
  const comment = useCommentAlert();
  const providence = useAlertProvidence();
  const { data: people = [] } = useAlertAssignees(detailId, isOpen);
  const [text, setText] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const busy = setStatus.isPending || assign.isPending || resolve.isPending;
  const err = setStatus.error ?? assign.error ?? resolve.error ?? comment.error ?? providence.error;

  const send = (kind: "comentario" | "providencia") => {
    const v = { id: detailId, text: text.trim() };
    const m = kind === "comentario" ? comment : providence;
    m.mutate(v, { onSuccess: () => setText("") });
  };

  return (
    <div className="space-y-4 rounded-lg bg-slate-50 p-3" data-testid="tratar-alerta">
      {err && <Alert tone="error">{errorMessage(err)}</Alert>}
      {isOpen && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Estado">
            {(fid) => (
              <Select id={fid} value={SETTABLE.includes(status) ? status : ""} disabled={busy}
                onChange={(e) => e.target.value && setStatus.mutate({ id: detailId, status: e.target.value as AlertStatus, version })}>
                {!SETTABLE.includes(status) && <option value="">{STATUS_LABELS[status]}</option>}
                {SETTABLE.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Responsável">
            {(fid) => (
              <Select id={fid} value={assignedTo ?? ""} disabled={busy}
                onChange={(e) => assign.mutate({ id: detailId, userId: e.target.value || null, version })}>
                <option value="">Ninguém</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
      )}
      <Field label="Comentário ou providência" hint="Providência é o que foi feito (ex.: troquei o criativo). 3 e 7 dias depois o sistema compara o antes e o depois.">
        {(fid) => <Textarea id={fid} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!text.trim()} loading={comment.isPending} onClick={() => send("comentario")}>
          <MessageSquare className="size-4" aria-hidden /> Comentar
        </Button>
        <Button variant="secondary" disabled={text.trim().length < 3} loading={providence.isPending} onClick={() => send("providencia")}>
          <Wrench className="size-4" aria-hidden /> Registrar providência
        </Button>
      </div>
      {isOpen && (
        <div className="flex flex-wrap items-start gap-2 border-t border-slate-200 pt-3">
          {!resolving ? (
            <Button variant="secondary" onClick={() => setResolving(true)} disabled={busy}>
              <CheckCircle2 className="size-4" aria-hidden /> Resolver
            </Button>
          ) : (
            <form className="w-full space-y-2" onSubmit={(e) => { e.preventDefault(); resolve.mutate({ id: detailId, note: resolveNote.trim(), version }); }}>
              <Field label="Como foi resolvido? (opcional)">
                {(fid) => <Textarea id={fid} rows={2} maxLength={2000} value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} />}
              </Field>
              <div className="flex gap-2">
                <Button type="submit" loading={resolve.isPending}>Confirmar resolução</Button>
                <Button type="button" variant="ghost" onClick={() => setResolving(false)}>Cancelar</Button>
              </div>
              <p className="text-xs text-slate-500">O alerta fica no histórico. O monitoramento não o reabre nas próximas 24 horas.</p>
            </form>
          )}
          {!hasTask && <TaskButton detailId={detailId} version={version} />}
        </div>
      )}
    </div>
  );
}

/** Virar tarefa: só aparece para quem pode criar tarefa na Central. */
function TaskButton({ detailId, version }: { detailId: number; version: number }) {
  const { data: perms = [] } = useMyOpsPermissions();
  const { data: sectors = [] } = useOpsSectors();
  const toTask = useAlertToTask();
  const [open, setOpen] = useState(false);
  const active = sectors.filter((s) => s.status === "ativo");
  const [sector, setSector] = useState("");
  const [due, setDue] = useState("");
  if (!(perms.includes("ops.tasks.create") || perms.includes("ops.admin"))) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    toTask.mutate({ id: detailId, sectorId: sector || active[0]?.id || "", dueDate: due || null, version });
  };
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="virar-tarefa">
        <ClipboardList className="size-4" aria-hidden /> Virar tarefa
      </Button>
    );
  }
  return (
    <form className="w-full space-y-2" onSubmit={submit} data-testid="form-tarefa">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Setor da tarefa">
          {(fid) => (
            <Select id={fid} value={sector || active[0]?.id || ""} onChange={(e) => setSector(e.target.value)}>
              {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Prazo (opcional)">
          {(fid) => <Input id={fid} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
        </Field>
      </div>
      {toTask.error && <Alert tone="error">{errorMessage(toTask.error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" loading={toTask.isPending} disabled={!active.length}>Criar tarefa</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
      <p className="text-xs text-slate-500">A tarefa nasce na Central de Operações com a explicação do alerta, o cliente e a prioridade (alta se for crítico).</p>
    </form>
  );
}
