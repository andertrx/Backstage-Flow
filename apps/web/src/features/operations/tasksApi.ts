import type { OpsPriority, OpsStatusCategory, OpsVisibility } from "@backstage/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";

// ---------------------------------------------------------------------------
// Etapa 36.2 — tarefas da Central. Quem vê e quem mexe é conferido no banco.
// ---------------------------------------------------------------------------

export interface OpsStatus {
  id: string;
  name: string;
  color: string;
  category: OpsStatusCategory;
  position: number;
  active: boolean;
}

export interface OpsTaskPerson {
  user_id: string;
  role: "principal" | "adicional" | "aprovador" | "observador";
  name: string;
}

export interface OpsTaskRow {
  id: string;
  number: number;
  title: string;
  client_id: string | null;
  client_name: string | null;
  sector_id: string;
  status_id: string;
  status_name: string;
  status_color: string;
  category: OpsStatusCategory;
  priority: OpsPriority;
  start_date: string | null;
  due_date: string | null;
  visibility: OpsVisibility;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
  people: OpsTaskPerson[];
  tags: string[];
  blockers: number;
  comments: number;
  attachments: number;
  overdue: boolean;
  /** 36.3: demanda de origem, etapa do onboarding, obrigatória para avançar e coluna da fila. */
  demand_id: string | null;
  client_stage_id: string | null;
  mandatory: boolean;
  queue_column_id: string | null;
}

export interface OpsTaskFilters {
  q?: string;
  client_id?: string;
  sector_id?: string;
  demand_id?: string;
  status_ids?: string[];
  priorities?: string[];
  person_id?: string;
  mine?: boolean;
  due?: "" | "atrasadas" | "hoje" | "semana" | "sem_prazo";
  archived?: boolean;
}

export interface OpsTaskDetail {
  task: OpsTaskRow & { description: string | null; effort_hours: number | null; created_by: string | null; created_by_name: string | null };
  people: OpsTaskPerson[];
  demand: { id: string; number: number; title: string;
    tasks: { id: string; number: number; sector_id: string; title: string | null; status_name: string; status_color: string; done: boolean; visible: boolean }[] } | null;
  stage_name: string | null;
  tags: string[];
  depends_on: { id: string; number: number; title: string; status_name: string; status_color: string; done: boolean; visible: boolean }[];
  dependents: { id: string; number: number; title: string }[];
  comments: { id: number; author_id: string | null; author: string | null; body: string; created_at: string; mentions: string[] }[];
  attachments: { id: string; name: string; mime: string; size_bytes: number; path: string; uploaded_by: string | null; uploader: string | null; created_at: string }[];
  activity: { id: number; action: string; actor: string | null; origin: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; created_at: string }[];
  can: { edit: boolean; move: boolean; assign: boolean; archive: boolean; sector: boolean; admin: boolean };
}

export interface OpsDirectory {
  people: { user_id: string; name: string; sector_id: string | null; sectors: string[] }[];
  clients: { id: string; name: string; status: string }[];
}

export interface OpsTeamCount {
  user_id: string;
  abertas: number;
  em_andamento: number;
  atrasadas: number;
  concluidas_30d: number;
  proxima_entrega: string | null;
}

/** Pessoas na tarefa, no formato que o banco espera. */
export interface OpsPeopleInput {
  principal: string | null;
  adicionais: string[];
  aprovadores: string[];
  observadores: string[];
}

export interface OpsTaskInput {
  title: string;
  description: string;
  client_id: string;
  sector_id: string;
  priority: OpsPriority;
  start_date: string;
  due_date: string;
  effort_hours: string;
  visibility: OpsVisibility;
  tags: string[];
  /** 36.3: etapa do onboarding do cliente e se é obrigatória para avançar. */
  client_stage_id: string;
  mandatory: boolean;
  /** Só ao criar. */
  status_id?: string;
  people?: OpsPeopleInput;
}

/** Tamanho máximo do anexo (igual ao limite do armazenamento). */
export const OPS_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const OPS_FILE_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.mp4,.mov,.mp3";

const KEY = ["ops"] as const;
export const TASKS_KEY = [...KEY, "tasks"] as const;

export function useOpsStatuses() {
  return useQuery({
    queryKey: [...KEY, "statuses"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_statuses").select("id,name,color,category,position,active").order("position").order("name");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os status."));
      return data as OpsStatus[];
    },
  });
}

export function useOpsTasks(filters: OpsTaskFilters, enabled = true) {
  return useQuery({
    queryKey: [...TASKS_KEY, "list", filters],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_task_list", { f: filters, p_limit: 500, p_offset: 0 });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as tarefas."));
      return (data as OpsTaskRow[]) ?? [];
    },
  });
}

export function useOpsTask(id: string | null) {
  return useQuery({
    queryKey: [...TASKS_KEY, "get", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_task_get", { p_id: id });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos abrir a tarefa."));
      if (!data) throw new FriendlyError("Tarefa não encontrada ou você não tem acesso a ela.");
      return data as OpsTaskDetail;
    },
  });
}

export function useOpsDirectory() {
  return useQuery({
    queryKey: [...KEY, "directory"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_directory");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar pessoas e clientes."));
      return (data as OpsDirectory | null) ?? { people: [], clients: [] };
    },
  });
}

export function useOpsTeamCounts() {
  return useQuery({
    queryKey: [...TASKS_KEY, "team-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_team_counts");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos contar as tarefas da equipe."));
      return new Map(((data as OpsTeamCount[]) ?? []).map((c) => [c.user_id, c]));
    },
  });
}

function useOpsMutation<T, R = unknown>(fn: (v: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

function taskPayload(v: OpsTaskInput) {
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    client_id: v.client_id,
    sector_id: v.sector_id,
    priority: v.priority,
    start_date: v.start_date,
    due_date: v.due_date,
    effort_hours: v.effort_hours.trim().replace(",", "."),
    visibility: v.visibility,
    tags: v.tags,
    client_stage_id: v.client_id ? v.client_stage_id : "",
    mandatory: Boolean(v.client_id && v.client_stage_id && v.mandatory),
    ...(v.status_id ? { status_id: v.status_id } : {}),
    ...(v.people ? { people: v.people } : {}),
  };
}

export function useSaveTask() {
  return useOpsMutation(async (v: { id: string | null; version: number | null; input: OpsTaskInput }) => {
    const { data, error } = await supabase.rpc("ops_task_save", { p_id: v.id, p_version: v.version, p: taskPayload(v.input) });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a tarefa."));
    return data as string;
  });
}

/**
 * Mudar status. No Kanban o cartão já muda na tela antes da resposta e volta
 * sozinho se o banco recusar (a lista é recarregada no fim, dando certo ou não).
 */
export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; version: number; statusId: string }) => {
      const { error } = await supabase.rpc("ops_task_set_status", { p_id: v.id, p_version: v.version, p_status: v.statusId });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar o status."));
    },
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: [...TASKS_KEY, "list"] });
      const snapshot = queryClient.getQueriesData<OpsTaskRow[]>({ queryKey: [...TASKS_KEY, "list"] });
      const status = queryClient.getQueryData<OpsStatus[]>([...KEY, "statuses"])?.find((s) => s.id === v.statusId);
      queryClient.setQueriesData<OpsTaskRow[]>({ queryKey: [...TASKS_KEY, "list"] }, (rows) =>
        rows?.map((r) => (r.id === v.id && status
          ? { ...r, status_id: status.id, status_name: status.name, status_color: status.color, category: status.category }
          : r)));
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, rows] of ctx?.snapshot ?? []) queryClient.setQueryData(key, rows);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetTaskPeople() {
  return useOpsMutation(async (v: { id: string; version: number; people: OpsPeopleInput }) => {
    const { error } = await supabase.rpc("ops_task_set_people", { p_id: v.id, p_version: v.version, p_people: v.people });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar as pessoas da tarefa."));
  });
}

export function useArchiveTask() {
  return useOpsMutation(async (v: { id: string; archived: boolean }) => {
    const { error } = await supabase.rpc("ops_task_archive", { p_id: v.id, p_archived: v.archived });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos arquivar a tarefa."));
  });
}

export function useTaskDependency() {
  return useOpsMutation(async (v: { id: string; dependsOn: string; add: boolean }) => {
    const { error } = await supabase.rpc("ops_task_dependency", { p_id: v.id, p_depends_on: v.dependsOn, p_add: v.add });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a dependência."));
  });
}

export function useAddComment() {
  return useOpsMutation(async (v: { taskId: string; body: string; mentions: string[] }) => {
    const { error } = await supabase.rpc("ops_comment_add", { p_task: v.taskId, p_body: v.body.trim(), p_mentions: v.mentions });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos enviar o comentário."));
  });
}

export function useRemoveComment() {
  return useOpsMutation(async (id: number) => {
    const { error } = await supabase.rpc("ops_comment_remove", { p_id: id });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos retirar o comentário."));
  });
}

/**
 * Anexo: o arquivo vai para o armazenamento PRIVADO (pasta = id da tarefa) e
 * depois o banco confere que ele chegou e registra. Abre só por link temporário.
 */
export function useAddAttachment() {
  return useOpsMutation(async (v: { taskId: string; file: File }) => {
    if (v.file.size > OPS_MAX_FILE_BYTES) throw new FriendlyError("Arquivo maior que 25 MB.");
    const ext = (v.file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const path = `${v.taskId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
    const up = await supabase.storage.from("ops-files").upload(path, v.file, { contentType: v.file.type || undefined, upsert: false });
    if (up.error) {
      const msg = up.error.message.toLowerCase();
      throw new FriendlyError(msg.includes("mime") || msg.includes("type")
        ? "Tipo de arquivo não aceito. Envie imagem, PDF, planilha, documento, apresentação, ZIP, vídeo ou áudio."
        : msg.includes("size") ? "Arquivo maior que 25 MB." : "Não conseguimos enviar o arquivo. Tente de novo.");
    }
    const { error } = await supabase.rpc("ops_attachment_add", { p_task: v.taskId, p_path: path, p_name: v.file.name });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos registrar o anexo."));
  });
}

export function useRemoveAttachment() {
  return useOpsMutation(async (id: string) => {
    const { error } = await supabase.rpc("ops_attachment_remove", { p_id: id });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos retirar o anexo."));
  });
}

/** Link temporário (5 minutos) para abrir um anexo. */
export async function openAttachment(path: string) {
  const { data, error } = await supabase.storage.from("ops-files").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new FriendlyError("Não conseguimos abrir o anexo.");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

// ------------------------------------------------------------ status (admin)
export function useSaveStatus() {
  return useOpsMutation(async (v: { id: string | null; name: string; color: string; category: OpsStatusCategory }) => {
    const { error } = await supabase.rpc("ops_status_save", { p_id: v.id, p_name: v.name.trim(), p_color: v.color, p_category: v.category });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar o status."));
  });
}

export function useReorderStatuses() {
  return useOpsMutation(async (ids: string[]) => {
    const { error } = await supabase.rpc("ops_status_reorder", { p_ids: ids });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a ordem."));
  });
}

export function useSetStatusActive() {
  return useOpsMutation(async (v: { id: string; active: boolean; moveTo: string | null }) => {
    const { error } = await supabase.rpc("ops_status_set_active", { p_id: v.id, p_active: v.active, p_move_to: v.moveTo });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar o status."));
  });
}
