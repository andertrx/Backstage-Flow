import type { OpsMeetingItemKind, OpsMeetingStatus } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";

// ---------------------------------------------------------------------------
// Etapa 36.5 — Dailies e reuniões. Quem vê e quem mexe é decidido no banco.
// ---------------------------------------------------------------------------

export interface OpsMeetingCategory {
  id: string;
  name: string;
  color: string;
  position: number;
  active: boolean;
}

export interface OpsMeetingRow {
  id: string;
  number: number;
  title: string;
  category_id: string;
  category_name: string;
  color: string;
  status: OpsMeetingStatus;
  starts_at: string;
  duration_min: number;
  sector_id: string | null;
  sector_name: string | null;
  client_id: string | null;
  client_name: string | null;
  location: string | null;
  organizer_id: string | null;
  organizer_name: string | null;
  people_count: number;
  attended_count: number;
  open_items: number;
  tasks_count: number;
  i_participate: boolean;
}

export interface OpsMeetingList {
  meetings: OpsMeetingRow[];
  can: { create: boolean };
}

export interface OpsMeetingItem {
  id: string;
  kind: OpsMeetingItemKind;
  body: string;
  owner_id: string | null;
  owner_name: string | null;
  sector_id: string | null;
  sector_name: string | null;
  due_date: string | null;
  task_id: string | null;
  task_number: number | null;
  task_visible: boolean;
  task_title: string | null;
  task_status: string | null;
  task_done: boolean | null;
  created_by: string | null;
  author: string | null;
  created_at: string;
}

export interface OpsMeetingEvent {
  id: number;
  action: string;
  actor: string | null;
  origin: "manual" | "sistema";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface OpsMeetingDetail {
  meeting: Omit<OpsMeetingRow, "people_count" | "attended_count" | "open_items" | "tasks_count" | "i_participate"> & {
    agenda: string | null;
    notes: string | null;
    cancel_reason: string | null;
    held_at: string | null;
    created_at: string;
    version: number;
  };
  people: { user_id: string; name: string; attended: boolean | null }[];
  items: OpsMeetingItem[];
  events: OpsMeetingEvent[];
  can: { edit: boolean; add: boolean; task: boolean; assign: boolean };
}

export interface OpsMeetingFilters {
  from?: string;
  to?: string;
  category_id?: string;
  sector_id?: string;
  client_id?: string;
  person_id?: string;
  status?: string;
  q?: string;
  mine?: boolean;
  order?: "asc" | "desc";
}

export interface OpsMeetingInput {
  title: string;
  category_id: string;
  starts_at: string; // ISO
  duration_min: number;
  sector_id: string;
  client_id: string;
  location: string;
  agenda: string;
  people: string[];
}

const KEY = ["ops"] as const;
const MEETINGS_KEY = [...KEY, "meetings"] as const;

function useOpsMutation<T, R = unknown>(fn: (v: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export function useMeetingCategories() {
  return useQuery({
    queryKey: [...KEY, "meeting-categories"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_meeting_categories").select("id,name,color,position,active").order("position");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os tipos de reunião."));
      return data as OpsMeetingCategory[];
    },
  });
}

export function useMeetingList(f: OpsMeetingFilters, enabled = true) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, "list", f],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_meeting_list", { f });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as reuniões."));
      return (data as OpsMeetingList | null) ?? { meetings: [], can: { create: false } };
    },
  });
}

export function useMeeting(id: string | null) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, "get", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_meeting_get", { p_id: id });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos abrir a reunião."));
      if (!data) throw new FriendlyError("Reunião não encontrada ou você não participa dela.");
      return data as OpsMeetingDetail;
    },
  });
}

export function useSaveMeeting() {
  return useOpsMutation(async (v: { id: string | null; version: number | null; input: OpsMeetingInput }) => {
    const { data, error } = await supabase.rpc("ops_meeting_save", { p_id: v.id, p_version: v.version, p: v.input });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a reunião."));
    return data as string;
  });
}

export function useRecordMeeting() {
  return useOpsMutation(async (v: { id: string; version: number; notes: string; attended: string[] }) => {
    const { error } = await supabase.rpc("ops_meeting_record", { p_id: v.id, p_version: v.version, p_notes: v.notes, p_attended: v.attended });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos registrar a reunião."));
  });
}

export function useCancelMeeting() {
  return useOpsMutation(async (v: { id: string; version: number; reason: string }) => {
    const { error } = await supabase.rpc("ops_meeting_cancel", { p_id: v.id, p_version: v.version, p_reason: v.reason.trim() });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos cancelar a reunião."));
  });
}

export function useAddMeetingItem() {
  return useOpsMutation(async (v: { meetingId: string; kind: OpsMeetingItemKind; body: string; ownerId: string; sectorId: string; dueDate: string }) => {
    const { error } = await supabase.rpc("ops_meeting_item_add", {
      p_meeting: v.meetingId, p: { kind: v.kind, body: v.body.trim(), owner_id: v.ownerId, sector_id: v.sectorId, due_date: v.dueDate },
    });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos registrar o item."));
  });
}

export function useRemoveMeetingItem() {
  return useOpsMutation(async (id: string) => {
    const { error } = await supabase.rpc("ops_meeting_item_remove", { p_id: id });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos retirar o item."));
  });
}

/** Pendência/bloqueio → tarefa. Clique duplo devolve a mesma tarefa (o banco garante). */
export function useItemToTask() {
  return useOpsMutation(async (id: string) => {
    const { data, error } = await supabase.rpc("ops_meeting_item_to_task", { p_item: id });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos criar a tarefa."));
    return data as string;
  });
}

export function useSaveMeetingCategory() {
  return useOpsMutation(async (v: { id: string | null; name: string; color: string; active: boolean }) => {
    const { error } = await supabase.rpc("ops_meeting_category_save", { p_id: v.id, p_name: v.name.trim(), p_color: v.color, p_active: v.active });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar o tipo de reunião."));
  });
}
