import { Archive, ArchiveRestore, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { useArchiveLead, useDeleteLead, useRestoreLead } from "./commercialApi.ts";
import { DeleteCardButton } from "./DeleteCardButton.tsx";
import { type OpsArchiveRow, useArchiveTask, useDeleteTask, useOpsArchiveList, useRestoreTask } from "./tasksApi.ts";
import { TaskDetailHost, useOpenTask, useTasksContext } from "./tasksContext.tsx";

type Kind = "tarefas" | "leads";
type State = "arquivados" | "excluidos";

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}
          className={cn("rounded-md px-3 py-1 text-sm font-semibold", value === id ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Row({ r, kind, state, onError }: { r: OpsArchiveRow; kind: Kind; state: State; onError: (m: string) => void }) {
  const { open } = useOpenTask();
  const unTask = useArchiveTask();
  const unLead = useArchiveLead();
  const delTask = useDeleteTask();
  const delLead = useDeleteLead();
  const resTask = useRestoreTask();
  const resLead = useRestoreLead();
  const busy = unTask.isPending || unLead.isPending || resTask.isPending || resLead.isPending;
  const title = kind === "tarefas" ? `#${r.number} ${r.title}` : `Lead #${r.number} ${r.title}`;
  const detail = kind === "tarefas" ? [r.client_name ?? "Tarefa interna", r.sector_name].filter(Boolean).join(" · ")
    : [r.stage_name, r.owner_name ? `responsável: ${r.owner_name}` : null].filter(Boolean).join(" · ");
  const run = (p: Promise<unknown>) => p.catch((err) => onError(errorMessage(err)));
  return (
    <li className="flex flex-wrap items-center gap-3 py-3" data-testid="ops-archive-row">
      <div className="min-w-0 flex-1">
        {kind === "tarefas" && state === "arquivados" ? (
          <button type="button" className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline" onClick={() => open(r.id)}>{title}</button>
        ) : kind === "leads" && state === "arquivados" ? (
          <Link to={`/comercial?lead=${r.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline">{title}</Link>
        ) : <p className="text-sm font-semibold text-slate-900">{title}</p>}
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
        <p className="text-xs text-slate-400">
          {state === "arquivados" ? "Arquivado" : "Excluído"} em {formatDateTime(r.at)}{r.by_name ? ` por ${r.by_name}` : ""}
          {r.created_by_name ? ` · criado por ${r.created_by_name}` : ""}
        </p>
      </div>
      {state === "arquivados" && r.can_unarchive && (
        <Button variant="secondary" className="px-2.5 py-1.5 text-xs" loading={busy}
          onClick={() => run(kind === "tarefas" ? unTask.mutateAsync({ id: r.id, archived: false }) : unLead.mutateAsync({ id: r.id, archived: false }))}>
          <ArchiveRestore className="size-3.5" aria-hidden /> Desarquivar
        </Button>
      )}
      {state === "arquivados" && r.can_delete && (
        <DeleteCardButton what={kind === "tarefas" ? "tarefa" : "lead"} label={title}
          onDelete={() => (kind === "tarefas" ? delTask.mutateAsync(r.id) : delLead.mutateAsync(r.id))} onDone={() => undefined} />
      )}
      {state === "excluidos" && r.can_restore && (
        <Button variant="secondary" className="px-2.5 py-1.5 text-xs" loading={busy}
          onClick={() => run(kind === "tarefas" ? resTask.mutateAsync(r.id) : resLead.mutateAsync(r.id))}>
          <RotateCcw className="size-3.5" aria-hidden /> Restaurar
        </Button>
      )}
    </li>
  );
}

/** Etapa 51.3: aba "Arquivados e excluídos" da Central (tarefas e, para quem tem o Comercial, leads). */
export function ArchivePage() {
  const ctx = useTasksContext();
  const [params, update] = useSearchParamsUpdater();
  const canLeads = ctx.can("ops.commercial");
  const kind: Kind = params.get("tipo") === "leads" && canLeads ? "leads" : "tarefas";
  const state: State = params.get("ver") === "excluidos" ? "excluidos" : "arquivados";
  const set = (k: "tipo" | "ver", v: string) => update((p) => { p.set(k, v); return p; });
  const list = useOpsArchiveList(kind, state, !ctx.loading);
  const [error, setError] = useState<string | null>(null);
  const rows = list.data ?? [];
  return (
    <div className="space-y-4" data-testid="ops-archive">
      <div className="flex flex-wrap items-center gap-3">
        {canLeads && <Toggle label="Tipo de cartão" value={kind} onChange={(v) => set("tipo", v)} options={[["tarefas", "Tarefas"], ["leads", "Leads do Comercial"]]} />}
        <Toggle label="Arquivados ou excluídos" value={state} onChange={(v) => set("ver", v)} options={[["arquivados", "Arquivados"], ["excluidos", "Excluídos"]]} />
      </div>
      <p className="text-sm text-slate-500">
        {state === "arquivados"
          ? "Cartões arquivados: quem criou ou está com o cartão pode desarquivar. Só quem criou pode excluir."
          : "Cartões excluídos não aparecem em nenhuma outra tela. Você vê os que criou ou excluiu; só o administrador restaura (volta como arquivado)."}
      </p>
      {(error || list.error) && <Alert tone="error">{error ?? errorMessage(list.error)}</Alert>}
      {list.isLoading || ctx.loading ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
        : rows.length === 0 ? (
          <Card className="space-y-2 p-8 text-center" data-testid="ops-archive-empty">
            {state === "arquivados" ? <Archive className="mx-auto size-8 text-slate-300" aria-hidden /> : <Trash2 className="mx-auto size-8 text-slate-300" aria-hidden />}
            <p className="font-medium text-slate-900">{state === "arquivados" ? "Nada arquivado." : "Nada excluído."}</p>
          </Card>
        ) : (
          <Card className="px-4">
            <ul className="divide-y divide-slate-100" data-testid="ops-archive-list">
              {rows.map((r) => <Row key={r.id} r={r} kind={kind} state={state} onError={setError} />)}
            </ul>
          </Card>
        )}
      <TaskDetailHost ctx={ctx} />
    </div>
  );
}
