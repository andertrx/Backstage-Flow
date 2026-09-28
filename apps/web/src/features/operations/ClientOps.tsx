import { opsProgress, opsToday } from "@backstage/shared";
import { CalendarClock, ClipboardList, FileText, History, Megaphone, NotebookPen, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatDateTime } from "@/lib/format.ts";
import { ACTION_LABELS, activityText } from "./activity.ts";
import {
  type OpsClientDetail, type OpsClientStage, useAddClientNote, useMoveClientStage, useOpsActivityTypes, useOpsClient, useOpsClientStages,
  useRemoveClientNote, useSetClientAm, useStartClient,
} from "./clientsApi.ts";
import { DemandReleaseModal } from "./DemandReleaseModal.tsx";
import { TaskTable } from "./TasksPage.tsx";
import { OPS_FILE_ACCEPT, openAttachment, useOpsTasks } from "./tasksApi.ts";
import { TaskDetailHost, type TasksContext, useOpenTask, useTasksContext } from "./tasksContext.tsx";

export function StagePill({ stage }: { stage: OpsClientStage | undefined }) {
  if (!stage) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold text-slate-800" style={{ background: `${stage.color}24` }}>
      <span className="size-2 rounded-full" style={{ background: stage.color }} aria-hidden />{stage.name}
    </span>
  );
}

export function ProgressBar({ done, total, unit = "obrigatórias" }: { done: number; total: number; unit?: string }) {
  const pct = opsProgress(done, total);
  if (pct === null) return <span className="text-xs text-slate-400">Sem tarefas obrigatórias</span>;
  return (
    <span className="flex items-center gap-2" aria-label={`Progresso: ${pct}%`}>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs font-semibold text-slate-600">{pct}% · {done}/{total} {unit}</span>
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <p className={cn("text-xl font-black", tone ?? "text-slate-900")}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

/** Colocar um cliente no fluxo operacional (etapa inicial e Account Manager). */
export function StartClientModal({ ctx, clients, preset, onClose }: {
  ctx: TasksContext; clients: { id: string; name: string }[]; preset?: string; onClose: () => void;
}) {
  const stages = useOpsClientStages();
  const [clientId, setClientId] = useState(preset ?? "");
  const [stageId, setStageId] = useState("");
  const [amId, setAmId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const start = useStartClient();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId) return setError("Escolha o cliente.");
    try { await start.mutateAsync({ clientId, stageId, amId }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title="Colocar cliente no fluxo operacional" open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Cliente" hint="Os clientes vêm do cadastro atual. Nada é duplicado.">
          {(id) => (
            <Select id={id} value={clientId} disabled={Boolean(preset)} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Escolha…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Etapa inicial">
          {(id) => (
            <Select id={id} value={stageId} onChange={(e) => setStageId(e.target.value)}>
              <option value="">Primeira etapa</option>
              {(stages.data ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Account Manager" hint="Vê as demandas de todos os setores deste cliente.">
          {(id) => (
            <Select id={id} value={amId} onChange={(e) => setAmId(e.target.value)}>
              <option value="">Definir depois</option>
              {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
            </Select>
          )}
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={start.isPending}>Colocar no fluxo</Button>
        </div>
      </form>
    </Modal>
  );
}

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Registro manual de atividade na ficha do cliente. */
export function NoteFormModal({ clientId, ctx, onClose }: { clientId: string; ctx: TasksContext; onClose: () => void }) {
  const types = useOpsActivityTypes();
  const [v, setV] = useState({ type_id: "", title: "", description: "", happened_at: localNow(), responsible_id: ctx.me, sector_id: ctx.mySector ?? "", next_step: "" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const add = useAddClientNote();
  const set = (k: keyof typeof v, value: string) => setV((p) => ({ ...p, [k]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!v.type_id) return setError("Escolha o tipo de atividade.");
    if (v.title.trim().length < 3) return setError("Escreva o título (mínimo 3 letras).");
    if (!v.happened_at) return setError("Informe a data e a hora.");
    try { await add.mutateAsync({ client_id: clientId, ...v, file }); onClose(); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Modal title="Registrar atividade" open onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4" data-testid="ops-note-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo de atividade">
            {(id) => (
              <Select id={id} value={v.type_id} onChange={(e) => set("type_id", e.target.value)}>
                <option value="">Escolha…</option>
                {(types.data ?? []).filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Data e hora">{(id) => <Input id={id} type="datetime-local" value={v.happened_at} onChange={(e) => set("happened_at", e.target.value)} />}</Field>
        </div>
        <Field label="Título">{(id) => <Input id={id} value={v.title} maxLength={200} onChange={(e) => set("title", e.target.value)} />}</Field>
        <Field label="Descrição" hint="Opcional.">{(id) => <Textarea id={id} value={v.description} maxLength={5000} onChange={(e) => set("description", e.target.value)} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Responsável">
            {(id) => (
              <Select id={id} value={v.responsible_id} onChange={(e) => set("responsible_id", e.target.value)}>
                <option value="">—</option>
                {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Setor">
            {(id) => (
              <Select id={id} value={v.sector_id} onChange={(e) => set("sector_id", e.target.value)}>
                <option value="">—</option>
                {ctx.sectors.filter((s) => s.status === "ativo").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Próximo passo" hint="Opcional.">{(id) => <Input id={id} value={v.next_step} maxLength={500} onChange={(e) => set("next_step", e.target.value)} />}</Field>
        <Field label="Anexo" hint="Opcional. Até 25 MB; fica privado e abre por link temporário.">
          {(id) => <input id={id} type="file" accept={OPS_FILE_ACCEPT} className="block text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={add.isPending}>Registrar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Resumo operacional + etapa e Account Manager (visão consolidada do AM). */
export function ClientOpsSummary({ detail, ctx }: { detail: OpsClientDetail; ctx: TasksContext }) {
  const stages = useOpsClientStages();
  const move = useMoveClientStage();
  const setAm = useSetClientAm();
  const [error, setError] = useState<string | null>(null);
  const s = detail.summary;
  const o = detail.ops;
  const sectorById = new Map(ctx.sectors.map((x) => [x.id, x]));
  const stage = stages.data?.find((x) => x.id === o?.stage_id);

  async function changeStage(stageId: string) {
    if (!o) return;
    setError(null);
    try { await move.mutateAsync({ clientId: detail.client.id, version: o.version, stageId }); } catch (err) { setError(errorMessage(err)); }
  }
  async function changeAm(amId: string) {
    if (!o) return;
    setError(null);
    try { await setAm.mutateAsync({ clientId: detail.client.id, version: o.version, amId }); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <div className="space-y-3" data-testid="ops-client-summary">
      {o && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Etapa do onboarding / operação</p>
            {detail.can.move ? (
              <Select aria-label="Etapa do cliente" className="w-auto py-1.5" value={o.stage_id} disabled={move.isPending} onChange={(e) => changeStage(e.target.value)}>
                {(stages.data ?? []).filter((x) => x.active || x.id === o.stage_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            ) : <StagePill stage={stage} />}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Account Manager</p>
            {detail.can.manage ? (
              <Select aria-label="Account Manager" className="w-auto py-1.5" value={o.am_user_id ?? ""} disabled={setAm.isPending} onChange={(e) => changeAm(e.target.value)}>
                <option value="">Sem Account Manager</option>
                {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                {o.am_user_id && !ctx.directory.people.some((p) => p.user_id === o.am_user_id) && <option value={o.am_user_id}>{o.am_name ?? "Pessoa atual"}</option>}
              </Select>
            ) : <p className="text-sm font-semibold text-slate-800">{o.am_name ?? "Sem Account Manager"}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Progresso operacional</p>
            <ProgressBar done={s.obrigatorias_concluidas} total={s.obrigatorias} />
          </div>
          <p className="text-xs text-slate-500">Na etapa desde {formatDateTime(o.stage_since)}</p>
        </div>
      )}
      {o && o.stage_pending > 0 && (
        <Alert tone="warning">
          {o.stage_pending} tarefa(s) obrigatória(s) desta etapa ainda aberta(s): o cliente só avança depois que forem concluídas.
        </Alert>
      )}
      {stage?.auto_advance && <p className="text-xs text-blue-700">Regra desta etapa: avança sozinho quando todas as tarefas obrigatórias forem concluídas.</p>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Abertas" value={s.abertas} />
        <Stat label="Concluídas" value={s.concluidas} tone="text-emerald-700" />
        <Stat label="Atrasadas" value={s.atrasadas} tone={s.atrasadas ? "text-red-600" : undefined} />
        <Stat label="Urgentes" value={s.urgentes} tone={s.urgentes ? "text-red-600" : undefined} />
        <Stat label="Bloqueadas" value={s.bloqueadas} tone={s.bloqueadas ? "text-amber-700" : undefined} />
        <Stat label="Aguardando o cliente" value={s.aguardando_cliente} tone={s.aguardando_cliente ? "text-amber-700" : undefined} />
        <Stat label="Próxima entrega" value={<span className="text-base">{s.proxima_entrega ? formatDate(s.proxima_entrega) : "—"}</span>} />
        <Stat label="Última atividade" value={<span className="text-base">{s.ultima_atividade ? formatDateTime(s.ultima_atividade).split(" ")[0] : "—"}</span>} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-slate-500">Setores envolvidos:</span>
        {s.setores.length === 0 && <span className="text-xs text-slate-400">nenhuma tarefa aberta</span>}
        {s.setores.map((id) => {
          const sec = sectorById.get(id);
          return sec ? (
            <span key={id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-slate-700" style={{ background: `${sec.color}1f` }}>
              <span className="size-1.5 rounded-full" style={{ background: sec.color }} aria-hidden />{sec.name}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}

/** Tarefas do cliente (de todos os setores que a pessoa pode ver) e demandas liberadas. */
export function ClientOpsTasks({ detail, ctx }: { detail: OpsClientDetail; ctx: TasksContext }) {
  const { open } = useOpenTask();
  const [archived, setArchived] = useState(false);
  const tasks = useOpsTasks({ client_id: detail.client.id, archived: archived || undefined });
  const today = opsToday();
  return (
    <div className="space-y-4" data-testid="ops-client-tasks">
      {detail.demands.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800"><Megaphone className="size-4 text-blue-600" aria-hidden /> Demandas liberadas</h3>
          <ul className="divide-y divide-slate-100 text-sm" data-testid="ops-client-demands">
            {detail.demands.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-semibold text-slate-800">#{d.number} {d.title}</span>
                <span className="text-xs text-slate-500">{formatDateTime(d.created_at)}</span>
                <span className="ml-auto"><ProgressBar done={d.done} total={d.total} unit="tarefas concluídas" /></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Só arquivadas
      </label>
      {tasks.error && <Alert tone="error">{errorMessage(tasks.error)}</Alert>}
      {tasks.isLoading ? <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
        : (tasks.data ?? []).length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">Nenhuma tarefa deste cliente que você possa ver.</Card>
        ) : <TaskTable tasks={tasks.data ?? []} ctx={ctx} today={today} onOpen={open} />}
    </div>
  );
}

type TimelineFilter = "tudo" | "tarefas" | "cliente" | "registros";

/** Histórico Operacional: linha do tempo das tarefas, etapas, demandas e atividades registradas. */
export function ClientOpsHistory({ detail, ctx }: { detail: OpsClientDetail; ctx: TasksContext }) {
  const stages = useOpsClientStages();
  const { open } = useOpenTask();
  const remove = useRemoveClientNote();
  const [filter, setFilter] = useState<TimelineFilter>("tudo");
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => {
    const st = new Map(ctx.statuses.map((x) => [x.id, x.name]));
    const sg = new Map((stages.data ?? []).map((x) => [x.id, x.name]));
    const pp = new Map(ctx.directory.people.map((x) => [x.user_id, x.name]));
    return { status: (id: string) => st.get(id) ?? id, stage: (id: string) => sg.get(id) ?? id, person: (id: string) => pp.get(id) ?? "pessoa" };
  }, [ctx.statuses, ctx.directory.people, stages.data]);

  type Item = { key: string; at: string; kind: "evento" | "registro"; node: ReactNode };
  const items: Item[] = [];
  if (filter !== "registros") {
    for (const a of detail.timeline) {
      const isClient = !a.task_id;
      if (filter === "tarefas" && isClient) continue;
      if (filter === "cliente" && !isClient) continue;
      const text = activityText(a, names);
      items.push({
        key: `a${a.id}`, at: a.created_at, kind: "evento",
        node: (
          <>
            <p className="text-sm">
              <span className="font-medium text-slate-800">{ACTION_LABELS[a.action] ?? a.action}</span>
              {text && <span className="text-slate-600"> · {text}</span>}
            </p>
            {a.task_id && (
              a.task_visible
                ? <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => open(a.task_id!)}>#{a.task_number} {a.task_title}</button>
                : <p className="text-xs text-slate-400">#{a.task_number} (tarefa de outro setor)</p>
            )}
            <p className="text-xs text-slate-400">{a.origin === "sistema" ? "Sistema" : a.actor ?? "—"} · {formatDateTime(a.created_at)}</p>
          </>
        ),
      });
    }
  }
  if (filter === "tudo" || filter === "registros") {
    for (const n of detail.notes) {
      items.push({
        key: `n${n.id}`, at: n.happened_at, kind: "registro",
        node: (
          <div className="rounded-xl bg-blue-50/60 p-3 ring-1 ring-blue-100" data-testid="ops-client-note">
            <div className="flex items-start gap-2">
              <NotebookPen className="mt-0.5 size-4 text-blue-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{n.title} <span className="font-normal text-slate-500">· {n.type_name}</span></p>
                {n.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{n.description}</p>}
                {n.next_step && <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Próximo passo:</span> {n.next_step}</p>}
                {n.attachment_path && (
                  <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                    onClick={() => openAttachment(n.attachment_path!).catch((err) => setError(errorMessage(err)))}>
                    <FileText className="size-3.5" aria-hidden />{n.attachment_name ?? "anexo"}
                  </button>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {formatDateTime(n.happened_at)} · {n.responsible ?? "sem responsável"}{n.sector_id ? ` · ${ctx.sectors.find((x) => x.id === n.sector_id)?.name ?? ""}` : ""} · registrado por {n.author ?? "—"}
                </p>
              </div>
              {(n.created_by === ctx.me || detail.can.admin) && (
                <button type="button" className="rounded p-1 text-slate-400 hover:bg-blue-100" aria-label={`Retirar atividade ${n.title}`}
                  onClick={() => remove.mutateAsync(n.id).catch((err) => setError(errorMessage(err)))}><Trash2 className="size-3.5" aria-hidden /></button>
              )}
            </div>
          </div>
        ),
      });
    }
  }
  items.sort((a, b) => b.at.localeCompare(a.at));

  const tab = (id: TimelineFilter, label: string) => (
    <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
      className={cn("rounded-md px-3 py-1 text-xs font-semibold", filter === id ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}>
      {label}
    </button>
  );
  return (
    <div className="space-y-3" data-testid="ops-client-history">
      <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="O que mostrar">
        {tab("tudo", "Tudo")}{tab("tarefas", "Eventos das tarefas")}{tab("cliente", "Etapas e demandas")}{tab("registros", "Atividades registradas")}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {items.length === 0 ? <p className="text-sm text-slate-400">Nada registrado ainda.</p> : (
        <ol className="space-y-3 border-l-2 border-slate-100 pl-4">
          {items.map((i) => <li key={i.key}>{i.node}</li>)}
        </ol>
      )}
    </div>
  );
}

/** Ações da ficha: liberar demanda e registrar atividade. */
export function ClientOpsActions({ detail, ctx }: { detail: OpsClientDetail; ctx: TasksContext }) {
  const [releasing, setReleasing] = useState(false);
  const [noting, setNoting] = useState(false);
  const [starting, setStarting] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {!detail.ops && detail.can.manage && (
        <Button onClick={() => setStarting(true)}><Plus className="size-4" aria-hidden /> Colocar no fluxo operacional</Button>
      )}
      {detail.can.release && <Button variant="secondary" onClick={() => setReleasing(true)}><Megaphone className="size-4" aria-hidden /> Liberar demanda</Button>}
      {detail.can.note && <Button variant="secondary" onClick={() => setNoting(true)}><NotebookPen className="size-4" aria-hidden /> Registrar atividade</Button>}
      {releasing && <DemandReleaseModal ctx={ctx} presetClient={detail.client} onClose={() => setReleasing(false)} />}
      {noting && <NoteFormModal clientId={detail.client.id} ctx={ctx} onClose={() => setNoting(false)} />}
      {starting && <StartClientModal ctx={ctx} clients={[detail.client]} preset={detail.client.id} onClose={() => setStarting(false)} />}
    </div>
  );
}

type PanelTab = "resumo" | "tarefas" | "historico";

/** Ficha operacional do cliente (painel lateral na Central). */
export function ClientOpsDrawer({ clientId, ctx, onClose }: { clientId: string; ctx: TasksContext; onClose: () => void }) {
  const q = useOpsClient(clientId);
  const [tab, setTab] = useState<PanelTab>("resumo");
  const d = q.data;
  const tabBtn = (id: PanelTab, label: string, Icon: typeof History) => (
    <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
      className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold",
        tab === id ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white" : "text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-blue-700")}>
      <Icon className="size-4" aria-hidden />{label}
    </button>
  );
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={d ? `Ficha operacional: ${d.client.name}` : "Ficha operacional"} data-testid="ops-client-drawer"
        className="flex h-full w-full max-w-4xl flex-col bg-slate-50 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400">Ficha operacional</p>
            <h2 className="text-lg font-bold text-slate-900">{d?.client.name ?? "Carregando…"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar ficha"><X className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {q.error && <Alert tone="error">{errorMessage(q.error)}</Alert>}
          {q.isLoading && <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />}
          {q.isSuccess && !d && <Alert tone="error">Você não tem acesso à ficha operacional deste cliente.</Alert>}
          {d && (
            <>
              <ClientOpsActions detail={d} ctx={ctx} />
              <div className="flex flex-wrap gap-2">
                {tabBtn("resumo", "Resumo", CalendarClock)}{tabBtn("tarefas", "Tarefas", ClipboardList)}{tabBtn("historico", "Histórico Operacional", History)}
              </div>
              {tab === "resumo" && <ClientOpsSummary detail={d} ctx={ctx} />}
              {tab === "tarefas" && <ClientOpsTasks detail={d} ctx={ctx} />}
              {tab === "historico" && <ClientOpsHistory detail={d} ctx={ctx} />}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Abas "Tarefas" e "Histórico Operacional" dentro da ficha do cliente (cadastro atual). */
export function ClientOpsTab({ clientId, tab }: { clientId: string; tab: "tarefas" | "historico" }) {
  const ctx = useTasksContext();
  const q = useOpsClient(clientId);
  if (q.isLoading || ctx.loading) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  if (q.error) return <Alert tone="error">{errorMessage(q.error)}</Alert>;
  const d = q.data;
  if (!d) return <Alert tone="info">Você não acompanha este cliente na Central de Operações.</Alert>;
  return (
    <div className="space-y-4" data-testid="client-ops-tab">
      {!d.ops && <Alert tone="info">Este cliente ainda não está no fluxo operacional (onboarding).</Alert>}
      <ClientOpsActions detail={d} ctx={ctx} />
      <ClientOpsSummary detail={d} ctx={ctx} />
      {tab === "tarefas" ? <ClientOpsTasks detail={d} ctx={ctx} /> : <ClientOpsHistory detail={d} ctx={ctx} />}
      <TaskDetailHost ctx={ctx} />
    </div>
  );
}
