import { opsCan } from "@backstage/shared";
import { useCallback } from "react";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { useMyOpsPermissions, useOpsSectors } from "./api.ts";
import { TaskDetail } from "./TaskDetail.tsx";
import { useOpsDirectory, useOpsStatuses } from "./tasksApi.ts";

/** Tudo que as telas de tarefas usam juntas: quem sou, permissões, setores, status e pessoas. */
export function useTasksContext() {
  const { profile } = useAuth();
  const perms = useMyOpsPermissions();
  const sectors = useOpsSectors();
  const statuses = useOpsStatuses();
  const directory = useOpsDirectory();
  const me = profile?.id ?? "";
  const can = (p: Parameters<typeof opsCan>[1]) => opsCan(perms.data, p);
  return {
    me,
    can,
    sectors: sectors.data ?? [],
    statuses: statuses.data ?? [],
    directory: directory.data ?? { people: [], clients: [] },
    mySector: directory.data?.people.find((p) => p.user_id === me)?.sector_id ?? null,
    loading: perms.isLoading || sectors.isLoading || statuses.isLoading || directory.isLoading,
    error: perms.error ?? sectors.error ?? statuses.error ?? directory.error,
  };
}

export type TasksContext = ReturnType<typeof useTasksContext>;

/** A tarefa aberta fica no endereço (?tarefa=…): dá para mandar o link para alguém. */
export function useOpenTask() {
  const [params, update] = useSearchParamsUpdater();
  const openId = params.get("tarefa");
  const open = useCallback((id: string) => update((p) => { p.set("tarefa", id); return p; }), [update]);
  const close = useCallback(() => update((p) => { p.delete("tarefa"); return p; }), [update]);
  return { openId, open, close };
}

export function TaskDetailHost({ ctx }: { ctx: TasksContext }) {
  const { openId, close } = useOpenTask();
  if (!openId) return null;
  return <TaskDetail key={openId} id={openId} sectors={ctx.sectors} statuses={ctx.statuses} directory={ctx.directory} me={ctx.me} onClose={close} />;
}
