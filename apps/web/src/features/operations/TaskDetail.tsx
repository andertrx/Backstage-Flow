import { OPS_PERSON_ROLE_LABELS, OPS_VISIBILITY_LABELS, opsIsClosed, opsToday } from "@backstage/shared";
import { Archive, ArchiveRestore, AtSign, FileText, Link2, Paperclip, Pencil, Trash2, Upload, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Select, Textarea } from "@/components/ui/field.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatDateTime } from "@/lib/format.ts";
import type { OpsSector } from "./api.ts";
import { ACTION_LABELS, activityText } from "./activity.ts";
import { Avatar, DueLabel, PriorityBadge, StatusPill } from "./TaskBits.tsx";
import { PeopleFields, peopleInputFrom, TaskFormModal } from "./TaskFormModal.tsx";
import {
  OPS_FILE_ACCEPT, type OpsDirectory, type OpsPeopleInput, type OpsStatus, type OpsTaskDetail, openAttachment, useAddAttachment, useAddComment,
  useArchiveTask, useOpsTask, useOpsTasks, useRemoveAttachment, useRemoveComment, useSetTaskPeople, useSetTaskStatus, useTaskDependency,
} from "./tasksApi.ts";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Comments({ detail, directory, me }: { detail: OpsTaskDetail; directory: OpsDirectory; me: string }) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const add = useAddComment();
  const remove = useRemoveComment();
  const people = directory.people.filter((p) => p.user_id !== me && !mentions.some((m) => m.id === p.user_id));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) return setError("Escreva o comentário.");
    // Só vale a menção cujo @Nome ainda está no texto.
    const still = mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id);
    try {
      await add.mutateAsync({ taskId: detail.task.id, body, mentions: still });
      setBody("");
      setMentions([]);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function drop(id: number) {
    setError(null);
    try { await remove.mutateAsync(id); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <Section title={`Comentários (${detail.comments.length})`}>
      <ul className="space-y-2" data-testid="ops-task-comments">
        {detail.comments.map((c) => (
          <li key={c.id} className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Avatar name={c.author ?? "?"} />
              <span className="text-sm font-semibold text-slate-800">{c.author ?? "Pessoa removida"}</span>
              <span className="text-xs text-slate-400">{formatDateTime(c.created_at)}</span>
              {(c.author_id === me || detail.can.admin) && (
                <button type="button" className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" onClick={() => drop(c.id)}
                  aria-label="Retirar comentário"><Trash2 className="size-3.5" aria-hidden /></button>
              )}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-700">{c.body}</p>
            {c.mentions.length > 0 && <p className="mt-1 text-xs text-blue-700">Mencionou: {c.mentions.join(", ")}</p>}
          </li>
        ))}
        {detail.comments.length === 0 && <li className="text-sm text-slate-400">Nenhum comentário ainda.</li>}
      </ul>
      <form onSubmit={submit} className="space-y-2">
        <Textarea aria-label="Novo comentário" className="min-h-20" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)}
          placeholder="Escreva um comentário…" />
        <div className="flex flex-wrap items-center gap-2">
          {people.length > 0 && (
            <label className="inline-flex items-center gap-1 text-xs text-slate-600">
              <AtSign className="size-3.5" aria-hidden />
              <select aria-label="Mencionar pessoa" className="rounded-lg border-0 bg-white py-1 pl-2 pr-7 text-xs ring-1 ring-inset ring-slate-300" value=""
                onChange={(e) => {
                  const p = directory.people.find((x) => x.user_id === e.target.value);
                  if (!p) return;
                  setMentions((m) => [...m, { id: p.user_id, name: p.name }]);
                  setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${p.name} `);
                }}>
                <option value="">Mencionar…</option>
                {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <span className="text-xs text-slate-400">Só dá para mencionar quem pode ver esta tarefa.</span>
          <Button type="submit" className="ml-auto px-3 py-1.5 text-xs" loading={add.isPending}>Comentar</Button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Section>
  );
}

function Attachments({ detail, me }: { detail: OpsTaskDetail; me: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const add = useAddAttachment();
  const remove = useRemoveAttachment();
  async function upload(files: FileList | null) {
    setError(null);
    for (const file of Array.from(files ?? [])) {
      try { await add.mutateAsync({ taskId: detail.task.id, file }); } catch (err) { setError(`${file.name}: ${errorMessage(err)}`); break; }
    }
    if (input.current) input.current.value = "";
  }
  async function open(path: string) {
    setError(null);
    try { await openAttachment(path); } catch (err) { setError(errorMessage(err)); }
  }
  async function drop(id: string) {
    setError(null);
    try { await remove.mutateAsync(id); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Section title={`Anexos (${detail.attachments.length})`} action={
      <>
        <input ref={input} type="file" multiple accept={OPS_FILE_ACCEPT} className="sr-only" aria-label="Escolher arquivos para anexar"
          onChange={(e) => upload(e.target.files)} data-testid="ops-attach-input" />
        <Button type="button" variant="secondary" className="px-2.5 py-1 text-xs" loading={add.isPending} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" aria-hidden /> Anexar
        </Button>
      </>
    }>
      <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200" data-testid="ops-task-attachments">
        {detail.attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-3 py-2">
            <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
            <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium text-blue-700 hover:underline" onClick={() => open(a.path)}>
              {a.name}
            </button>
            <span className="shrink-0 text-xs text-slate-400">{formatSize(a.size_bytes)} · {a.uploader ?? "—"}</span>
            {(a.uploaded_by === me || detail.can.edit) && (
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => drop(a.id)}
                aria-label={`Retirar ${a.name}`}><Trash2 className="size-3.5" aria-hidden /></button>
            )}
          </li>
        ))}
        {detail.attachments.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Nenhum anexo. Até 25 MB por arquivo; abre por link temporário.</li>}
      </ul>
      {error && <Alert tone="error">{error}</Alert>}
    </Section>
  );
}

function Dependencies({ detail }: { detail: OpsTaskDetail }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dep = useTaskDependency();
  const options = useOpsTasks({}, adding);
  const taken = new Set([detail.task.id, ...detail.depends_on.map((d) => d.id)]);
  async function change(dependsOn: string, add: boolean) {
    setError(null);
    try { await dep.mutateAsync({ id: detail.task.id, dependsOn, add }); setAdding(false); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Section title="Dependências" action={detail.can.edit && !adding ? (
      <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setAdding(true)}><Link2 className="size-3.5" aria-hidden /> Depende de…</Button>
    ) : undefined}>
      {detail.task.blockers > 0 && (
        <Alert tone="warning">Esta tarefa depende de {detail.task.blockers} tarefa(s) ainda aberta(s): não pode ser finalizada antes.</Alert>
      )}
      <ul className="space-y-1 text-sm">
        {detail.depends_on.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <span className={cn("font-medium", d.done ? "text-slate-400 line-through" : "text-slate-800")}>
              #{d.number} {d.visible ? d.title : "(tarefa de outro setor)"}
            </span>
            <StatusPill name={d.status_name} color={d.status_color} />
            {detail.can.edit && (
              <button type="button" className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => change(d.id, false)} aria-label={`Retirar dependência #${d.number}`}>
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </li>
        ))}
        {detail.depends_on.length === 0 && !adding && <li className="text-slate-400">Não depende de outra tarefa.</li>}
      </ul>
      {adding && (
        <div className="flex items-center gap-2">
          <Select aria-label="Tarefa da qual esta depende" value="" onChange={(e) => e.target.value && change(e.target.value, true)} disabled={dep.isPending}>
            <option value="">{options.isLoading ? "Carregando…" : "Escolha a tarefa…"}</option>
            {(options.data ?? []).filter((t) => !taken.has(t.id)).map((t) => <option key={t.id} value={t.id}>#{t.number} {t.title}</option>)}
          </Select>
          <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setAdding(false)}>Cancelar</Button>
        </div>
      )}
      {detail.dependents.length > 0 && (
        <p className="text-xs text-slate-500">Estas esperam por ela: {detail.dependents.map((d) => `#${d.number} ${d.title}`).join(" · ")}</p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </Section>
  );
}

function People({ detail, directory, me }: { detail: OpsTaskDetail; directory: OpsDirectory; me: string }) {
  const [editing, setEditing] = useState<OpsPeopleInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = useSetTaskPeople();
  async function save() {
    if (!editing) return;
    setError(null);
    try { await set.mutateAsync({ id: detail.task.id, version: detail.task.version, people: editing }); setEditing(null); } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <Section title="Pessoas" action={detail.can.assign && !editing && !detail.task.archived_at ? (
      <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(peopleInputFrom(detail.people))}>
        <Pencil className="size-3.5" aria-hidden /> Mudar
      </Button>
    ) : undefined}>
      {editing ? (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <PeopleFields value={editing} onChange={setEditing} people={directory.people} me={me} canAssign />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="button" className="px-3 py-1.5 text-xs" loading={set.isPending} onClick={save}>Salvar pessoas</Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-1.5" data-testid="ops-task-people">
          {detail.people.map((p) => (
            <li key={`${p.role}-${p.user_id}`} className="flex items-center gap-2 text-sm">
              <Avatar name={p.name} />
              <span className="font-medium text-slate-800">{p.name}</span>
              <span className="text-xs text-slate-500">{OPS_PERSON_ROLE_LABELS[p.role]}</span>
            </li>
          ))}
          {detail.people.length === 0 && <li className="text-sm text-slate-400">Ninguém na tarefa ainda.</li>}
        </ul>
      )}
    </Section>
  );
}

/** Detalhe da tarefa (painel lateral). O endereço guarda a tarefa aberta (?tarefa=…). */
export function TaskDetail({ id, sectors, statuses, directory, me, onClose }: {
  id: string;
  sectors: OpsSector[];
  statuses: OpsStatus[];
  directory: OpsDirectory;
  me: string;
  onClose: () => void;
}) {
  const q = useOpsTask(id);
  const setStatus = useSetTaskStatus();
  const archive = useArchiveTask();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = opsToday();
  const statusName = useMemo(() => {
    const m = new Map(statuses.map((s) => [s.id, s.name]));
    return (sid: string) => m.get(sid) ?? sid;
  }, [statuses]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !editing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  const d = q.data;
  const t = d?.task;
  const sector = sectors.find((s) => s.id === t?.sector_id);

  async function changeStatus(statusId: string) {
    if (!t) return;
    setError(null);
    try { await setStatus.mutateAsync({ id: t.id, version: t.version, statusId }); } catch (err) { setError(errorMessage(err)); }
  }
  async function toggleArchive() {
    if (!t) return;
    setError(null);
    try { await archive.mutateAsync({ id: t.id, archived: !t.archived_at }); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={t ? `Tarefa #${t.number}` : "Tarefa"} data-testid="ops-task-detail"
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400">{t ? `#${t.number}` : " "}{t?.archived_at ? " · arquivada" : ""}</p>
            <h2 className="break-words text-lg font-bold text-slate-900">{t?.title ?? "Carregando…"}</h2>
          </div>
          {t && d.can.edit && !t.archived_at && (
            <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => setEditing(true)}><Pencil className="size-3.5" aria-hidden /> Editar</Button>
          )}
          {t && d.can.archive && (
            <Button variant="secondary" className="px-2.5 py-1.5 text-xs" loading={archive.isPending} onClick={toggleArchive}>
              {t.archived_at ? <><ArchiveRestore className="size-3.5" aria-hidden /> Desarquivar</> : <><Archive className="size-3.5" aria-hidden /> Arquivar</>}
            </Button>
          )}
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar tarefa"><X className="size-5" /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {q.error && <Alert tone="error">{errorMessage(q.error)}</Alert>}
          {q.isLoading && <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />}
          {d && t && (
            <>
              {error && <Alert tone="error">{error}</Alert>}
              <div className="flex flex-wrap items-center gap-2">
                {d.can.move && !t.archived_at ? (
                  <Select aria-label="Status da tarefa" className="w-auto py-1.5" value={t.status_id} disabled={setStatus.isPending}
                    onChange={(e) => changeStatus(e.target.value)} data-testid="ops-task-status">
                    {statuses.filter((s) => s.active || s.id === t.status_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                ) : <StatusPill name={t.status_name} color={t.status_color} />}
                <PriorityBadge priority={t.priority} />
                <DueLabel task={t} today={today} />
                {opsIsClosed(t.category) && t.completed_at && <span className="text-xs text-emerald-700">Concluída em {formatDateTime(t.completed_at)}</span>}
              </div>

              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Cliente</dt><dd className="font-medium text-slate-800">{t.client_name ?? "Tarefa interna"}</dd></div>
                <div><dt className="text-xs text-slate-500">Setor</dt><dd className="font-medium text-slate-800">{sector?.name ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Início</dt><dd className="text-slate-800">{t.start_date ? formatDate(t.start_date) : "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Esforço estimado</dt><dd className="text-slate-800">{t.effort_hours != null ? `${String(t.effort_hours).replace(".", ",")} h` : "—"}</dd></div>
                {d.stage_name && (
                  <div><dt className="text-xs text-slate-500">Etapa do onboarding</dt>
                    <dd className="text-slate-800">{d.stage_name}{t.mandatory ? " · obrigatória para avançar" : " · opcional"}</dd></div>
                )}
                <div><dt className="text-xs text-slate-500">Quem vê</dt><dd className="text-slate-800">{OPS_VISIBILITY_LABELS[t.visibility]}</dd></div>
                <div><dt className="text-xs text-slate-500">Criada por</dt><dd className="text-slate-800">{t.created_by_name ?? "—"} · {formatDateTime(t.created_at)}</dd></div>
                {d.tags.length > 0 && (
                  <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Etiquetas</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">{d.tags.map((g) => <span key={g} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{g}</span>)}</dd>
                  </div>
                )}
              </dl>
              {t.description && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{t.description}</p>}

              {d.demand && (
                <Section title={`Demanda #${d.demand.number}: ${d.demand.title}`}>
                  <ul className="space-y-1 text-sm" data-testid="ops-task-demand">
                    {d.demand.tasks.map((x) => (
                      <li key={x.id} className="flex items-center gap-2">
                        <span className={cn("font-medium", x.done ? "text-slate-400 line-through" : "text-slate-800", x.id === t.id && "text-blue-700")}>
                          #{x.number} {x.visible ? x.title : "(tarefa de outro setor)"}
                        </span>
                        <span className="text-xs text-slate-500">{sectors.find((s) => s.id === x.sector_id)?.name}</span>
                        <StatusPill name={x.status_name} color={x.status_color} />
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              <People detail={d} directory={directory} me={me} />
              <Dependencies detail={d} />
              <Comments detail={d} directory={directory} me={me} />
              <Attachments detail={d} me={me} />

              <Section title="Histórico">
                <ol className="space-y-2 border-l-2 border-slate-100 pl-4" data-testid="ops-task-history">
                  {d.activity.map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="font-medium text-slate-800">{ACTION_LABELS[a.action] ?? a.action}</span>
                      {activityText(a, { status: statusName }) && <span className="text-slate-600"> · {activityText(a, { status: statusName })}</span>}
                      <p className="text-xs text-slate-400">
                        {a.origin === "sistema" ? "Sistema" : a.actor ?? "—"} · {formatDateTime(a.created_at)}
                      </p>
                    </li>
                  ))}
                </ol>
              </Section>
              <p className="flex items-center gap-1 text-xs text-slate-400"><Paperclip className="size-3" aria-hidden /> Nada é apagado: comentários e anexos retirados ficam no histórico.</p>
            </>
          )}
        </div>
      </aside>
      {editing && d && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <TaskFormModal detail={d} sectors={sectors} statuses={statuses} directory={directory} me={me} mySector={null}
            canAssign={d.can.assign} canChangeSector={d.can.sector} onClose={() => setEditing(false)} />
        </div>
      )}
    </div>
  );
}
