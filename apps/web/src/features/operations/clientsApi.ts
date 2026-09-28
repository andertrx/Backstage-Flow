import type { OpsPriority } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";
import { OPS_MAX_FILE_BYTES, type OpsTaskRow, TASKS_KEY } from "./tasksApi.ts";

// ---------------------------------------------------------------------------
// Etapa 36.3 — clientes no fluxo operacional (onboarding e Account Manager),
// filas por setor, demandas para vários setores e registro manual.
// ---------------------------------------------------------------------------

export interface OpsClientStage {
  id: string;
  name: string;
  color: string;
  position: number;
  active: boolean;
  require_mandatory: boolean;
  auto_advance: boolean;
}

export interface OpsQueueColumn {
  id: string;
  sector_id: string;
  name: string;
  color: string;
  status_id: string;
  position: number;
  active: boolean;
}

export interface OpsActivityType {
  id: string;
  name: string;
  position: number;
  active: boolean;
}

export interface OpsClientSummary {
  abertas: number;
  concluidas: number;
  atrasadas: number;
  urgentes: number;
  bloqueadas: number;
  aguardando_cliente: number;
  proxima_entrega: string | null;
  obrigatorias: number;
  obrigatorias_concluidas: number;
  setores: string[];
  ultima_atividade: string | null;
}

export interface OpsBoardClient {
  client_id: string;
  name: string;
  client_status: string;
  stage_id: string;
  stage_since: string;
  version: number;
  am_user_id: string | null;
  am_name: string | null;
  stage_pending: number;
  can_move: boolean;
  summary: OpsClientSummary;
}

export interface OpsClientBoard {
  clients: OpsBoardClient[];
  available: { id: string; name: string }[];
  can: { manage: boolean; release: boolean; note: boolean };
}

export interface OpsClientNote {
  id: string;
  type_id: string;
  type_name: string;
  title: string;
  description: string | null;
  happened_at: string;
  responsible_id: string | null;
  responsible: string | null;
  sector_id: string | null;
  next_step: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  created_by: string | null;
  author: string | null;
  created_at: string;
}

export interface OpsTimelineEvent {
  id: number;
  action: string;
  actor: string | null;
  origin: "manual" | "sistema";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  task_id: string | null;
  task_number: number | null;
  task_visible: boolean;
  task_title: string | null;
  sector_id: string | null;
}

export interface OpsClientDetail {
  client: { id: string; name: string; status: string };
  ops: { stage_id: string; stage_since: string; started_at: string; version: number; am_user_id: string | null; am_name: string | null; stage_pending: number } | null;
  summary: OpsClientSummary;
  demands: { id: string; number: number; title: string; created_at: string; total: number; done: number }[];
  notes: OpsClientNote[];
  timeline: OpsTimelineEvent[];
  can: { move: boolean; manage: boolean; note: boolean; release: boolean; admin: boolean };
}

export interface OpsDemandItem {
  sector_id: string;
  title: string;
  principal: string;
  due_date: string;
  priority: OpsPriority;
  depends_on: number | null;
}

export interface OpsDemandInput {
  client_id: string;
  title: string;
  briefing: string;
  client_stage_id: string;
  mandatory: boolean;
  items: OpsDemandItem[];
  files: File[];
}

export interface OpsNoteInput {
  client_id: string;
  type_id: string;
  title: string;
  description: string;
  happened_at: string;
  responsible_id: string;
  sector_id: string;
  next_step: string;
  file: File | null;
}

const KEY = ["ops"] as const;
const CLIENTS_KEY = [...KEY, "clients"] as const;

function useOpsMutation<T, R = unknown>(fn: (v: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

function listQuery<T>(key: string, table: string, columns: string, fallback: string) {
  return {
    queryKey: [...KEY, key],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select(columns).order("position").order("name");
      if (error) throw new FriendlyError(friendlyDbError(error, fallback));
      return data as T[];
    },
  };
}

export const useOpsClientStages = () =>
  useQuery(listQuery<OpsClientStage>("client-stages", "ops_client_stages", "id,name,color,position,active,require_mandatory,auto_advance", "Não conseguimos carregar as etapas."));
export const useOpsQueueColumns = () =>
  useQuery(listQuery<OpsQueueColumn>("queue-columns", "ops_queue_columns", "id,sector_id,name,color,status_id,position,active", "Não conseguimos carregar as filas."));
export const useOpsActivityTypes = () =>
  useQuery(listQuery<OpsActivityType>("activity-types", "ops_activity_types", "id,name,position,active", "Não conseguimos carregar os tipos de atividade."));

export function useOpsClientBoard(f: { q?: string; mine?: boolean; am_user_id?: string }, enabled = true) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, "board", f],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_client_board", { f });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os clientes."));
      return (data as OpsClientBoard | null) ?? { clients: [], available: [], can: { manage: false, release: false, note: false } };
    },
  });
}

export function useOpsClient(id: string | null | undefined) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, "get", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_client_get", { p_client: id });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos abrir a ficha operacional."));
      return data as OpsClientDetail | null;
    },
  });
}

export function useStartClient() {
  return useOpsMutation(async (v: { clientId: string; stageId: string; amId: string }) => {
    const { error } = await supabase.rpc("ops_client_start", { p_client: v.clientId, p_stage: v.stageId || null, p_am: v.amId || null });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos colocar o cliente no fluxo."));
  });
}

export function useSetClientAm() {
  return useOpsMutation(async (v: { clientId: string; version: number; amId: string }) => {
    const { error } = await supabase.rpc("ops_client_set_am", { p_client: v.clientId, p_version: v.version, p_am: v.amId || null });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos trocar o Account Manager."));
  });
}

/** Mudar a etapa do cliente: o cartão muda na hora e volta se o banco recusar. */
export function useMoveClientStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { clientId: string; version: number; stageId: string }) => {
      const { error } = await supabase.rpc("ops_client_stage_move", { p_client: v.clientId, p_version: v.version, p_stage: v.stageId });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a etapa."));
    },
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: [...CLIENTS_KEY, "board"] });
      const snapshot = queryClient.getQueriesData<OpsClientBoard>({ queryKey: [...CLIENTS_KEY, "board"] });
      queryClient.setQueriesData<OpsClientBoard>({ queryKey: [...CLIENTS_KEY, "board"] }, (b) =>
        b && { ...b, clients: b.clients.map((c) => (c.client_id === v.clientId ? { ...c, stage_id: v.stageId } : c)) });
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** Mover na fila do setor: muda o status ligado à coluna (e volta se o banco recusar). */
export function useMoveQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; version: number; column: OpsQueueColumn }) => {
      const { error } = await supabase.rpc("ops_task_move_queue", { p_id: v.id, p_version: v.version, p_column: v.column.id });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mover a tarefa."));
    },
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: [...TASKS_KEY, "list"] });
      const snapshot = queryClient.getQueriesData<OpsTaskRow[]>({ queryKey: [...TASKS_KEY, "list"] });
      queryClient.setQueriesData<OpsTaskRow[]>({ queryKey: [...TASKS_KEY, "list"] }, (rows) =>
        rows?.map((r) => (r.id === v.id ? { ...r, queue_column_id: v.column.id, status_id: v.column.status_id } : r)));
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, rows] of ctx?.snapshot ?? []) queryClient.setQueryData(key, rows);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

async function uploadTo(folder: string, file: File): Promise<string> {
  if (file.size > OPS_MAX_FILE_BYTES) throw new FriendlyError(`${file.name}: arquivo maior que 25 MB.`);
  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const path = `${folder}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const up = await supabase.storage.from("ops-files").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) {
    const msg = up.error.message.toLowerCase();
    throw new FriendlyError(`${file.name}: ${msg.includes("mime") || msg.includes("type") ? "tipo de arquivo não aceito." : "não conseguimos enviar o arquivo."}`);
  }
  return path;
}

/**
 * Liberar demanda: o banco cria a demanda e uma tarefa por setor (tudo ou
 * nada). Os anexos vão depois para cada tarefa criada.
 */
export function useReleaseDemand() {
  return useOpsMutation(async (v: OpsDemandInput) => {
    const { data, error } = await supabase.rpc("ops_demand_release", {
      p: {
        client_id: v.client_id, title: v.title.trim(), briefing: v.briefing.trim(), client_stage_id: v.client_stage_id || null,
        mandatory: v.mandatory && Boolean(v.client_stage_id),
        items: v.items.map((i) => ({ sector_id: i.sector_id, title: i.title.trim(), principal: i.principal || null, due_date: i.due_date || null,
          priority: i.priority, depends_on: i.depends_on })),
      },
    });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos liberar a demanda."));
    const result = data as { id: string; number: number; task_ids: string[] };
    const failed: string[] = [];
    for (const taskId of result.task_ids) {
      for (const file of v.files) {
        try {
          const path = await uploadTo(taskId, file);
          const add = await supabase.rpc("ops_attachment_add", { p_task: taskId, p_path: path, p_name: file.name });
          if (add.error) throw add.error;
        } catch {
          failed.push(file.name);
        }
      }
    }
    return { ...result, failedFiles: [...new Set(failed)] };
  });
}

export function useAddClientNote() {
  return useOpsMutation(async (v: OpsNoteInput) => {
    const path = v.file ? await uploadTo(`cliente-${v.client_id}`, v.file) : null;
    const { error } = await supabase.rpc("ops_client_note_add", {
      p: {
        client_id: v.client_id, type_id: v.type_id, title: v.title.trim(), description: v.description.trim(),
        happened_at: new Date(v.happened_at).toISOString(), responsible_id: v.responsible_id || null, sector_id: v.sector_id || null,
        next_step: v.next_step.trim(), attachment_path: path, attachment_name: v.file?.name ?? null,
      },
    });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos registrar a atividade."));
  });
}

export function useRemoveClientNote() {
  return useOpsMutation(async (id: string) => {
    const { error } = await supabase.rpc("ops_client_note_remove", { p_id: id });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos retirar a atividade."));
  });
}

// ------------------------------------------------------------ configurações (admin)
export function useSaveClientStage() {
  return useOpsMutation(async (v: { id: string | null; name: string; color: string; require: boolean; auto: boolean }) => {
    const { error } = await supabase.rpc("ops_client_stage_save", { p_id: v.id, p_name: v.name.trim(), p_color: v.color, p_require: v.require, p_auto: v.auto });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a etapa."));
  });
}
export function useReorderClientStages() {
  return useOpsMutation(async (ids: string[]) => {
    const { error } = await supabase.rpc("ops_client_stage_reorder", { p_ids: ids });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a ordem."));
  });
}
export function useSetClientStageActive() {
  return useOpsMutation(async (v: { id: string; active: boolean; moveTo: string | null }) => {
    const { error } = await supabase.rpc("ops_client_stage_set_active", { p_id: v.id, p_active: v.active, p_move_to: v.moveTo });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a etapa."));
  });
}
export function useSaveQueueColumn() {
  return useOpsMutation(async (v: { id: string | null; sectorId: string; name: string; color: string; statusId: string }) => {
    const { error } = await supabase.rpc("ops_queue_column_save", { p_id: v.id, p_sector: v.sectorId, p_name: v.name.trim(), p_color: v.color, p_status: v.statusId });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a coluna."));
  });
}
export function useReorderQueueColumns() {
  return useOpsMutation(async (v: { sectorId: string; ids: string[] }) => {
    const { error } = await supabase.rpc("ops_queue_column_reorder", { p_sector: v.sectorId, p_ids: v.ids });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a ordem."));
  });
}
export function useSetQueueColumnActive() {
  return useOpsMutation(async (v: { id: string; active: boolean }) => {
    const { error } = await supabase.rpc("ops_queue_column_set_active", { p_id: v.id, p_active: v.active });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a coluna."));
  });
}
export function useSaveActivityType() {
  return useOpsMutation(async (v: { id: string | null; name: string; active: boolean }) => {
    const { error } = await supabase.rpc("ops_activity_type_save", { p_id: v.id, p_name: v.name.trim(), p_active: v.active });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar o tipo."));
  });
}
