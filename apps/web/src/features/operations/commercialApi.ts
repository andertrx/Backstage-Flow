import type { OpsLeadCategory, OpsLeadKind, OpsPriority } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";

// ---------------------------------------------------------------------------
// Etapa 36.4 — Kanban comercial. Só quem tem "Comercial" (e o admin) usa; o
// banco confere tudo de novo. Dados de contato não vão para o histórico.
// ---------------------------------------------------------------------------

export interface OpsLeadStage {
  id: string;
  name: string;
  color: string;
  category: OpsLeadCategory;
  position: number;
  active: boolean;
  require_previous: boolean;
  require_next_action: boolean;
}

export interface OpsLossReason {
  id: string;
  name: string;
  position: number;
  active: boolean;
}

export interface OpsLeadCard {
  id: string;
  number: number;
  company_name: string;
  contact_name: string | null;
  segment: string | null;
  owner_id: string | null;
  owner_name: string | null;
  entered_at: string;
  last_interaction_at: string | null;
  next_action: string | null;
  next_action_date: string | null;
  priority: OpsPriority;
  potential_value: number | null;
  currency: string;
  origin: string | null;
  stage_id: string;
  version: number;
  client_id: string | null;
  archived_at: string | null;
  loss_reason: string | null;
  overdue: boolean;
}

export interface OpsLeadBoard {
  leads: OpsLeadCard[];
  origins: string[];
  can: { create_client: boolean; onboarding: boolean };
}

export interface OpsLead extends OpsLeadCard {
  phone: string | null;
  email: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  service_interest: string | null;
  notes: string | null;
  stage_since: string;
  loss_reason_id: string | null;
  loss_note: string | null;
  lost_at: string | null;
  converted_at: string | null;
  created_at: string;
  stage_name: string;
  stage_color: string;
  category: OpsLeadCategory;
  client_name: string | null;
  converted_by_name: string | null;
  created_by_name: string | null;
}

export interface OpsLeadEvent {
  id: number;
  action: string;
  kind: OpsLeadKind | null;
  body: string | null;
  happened_at: string | null;
  actor: string | null;
  origin: "manual" | "sistema";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface OpsLeadDetail {
  lead: OpsLead;
  events: OpsLeadEvent[];
  can: { create_client: boolean; onboarding: boolean; client_ops: boolean };
}

export interface OpsDuplicates {
  leads: { id: string; number: number; company_name: string; stage_name: string; archived: boolean; reason: string }[];
  clients: { id: string; name: string; status: string; reason: string }[];
}

export interface OpsLeadInput {
  company_name: string;
  contact_name: string;
  phone: string;
  email: string;
  cnpj: string;
  segment: string;
  city: string;
  state: string;
  origin: string;
  service_interest: string;
  owner_id: string;
  notes: string;
  potential_value: string;
  currency: string;
  priority: OpsPriority;
  entered_at: string;
  next_action: string;
  next_action_date: string;
  stage_id?: string;
}

/** "1.500,50" ou "1500.50" → "1500.50". Vazio fica vazio. */
export function parseMoneyInput(v: string): string {
  const t = v.trim().replace(/[^\d.,]/g, "");
  if (!t) return "";
  return t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
}

const KEY = ["ops"] as const;
const LEADS_KEY = [...KEY, "leads"] as const;

function useOpsMutation<T, R = unknown>(fn: (v: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export function useLeadStages() {
  return useQuery({
    queryKey: [...KEY, "lead-stages"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_lead_stages")
        .select("id,name,color,category,position,active,require_previous,require_next_action").order("position");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as colunas comerciais."));
      return data as OpsLeadStage[];
    },
  });
}

export function useLossReasons() {
  return useQuery({
    queryKey: [...KEY, "loss-reasons"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_loss_reasons").select("id,name,position,active").order("position");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os motivos de perda."));
      return data as OpsLossReason[];
    },
  });
}

export function useLeadBoard(f: { q?: string; owner_id?: string; origin?: string; priority?: string; overdue?: boolean; archived?: boolean }) {
  return useQuery({
    queryKey: [...LEADS_KEY, "board", f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_lead_board", { f });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os leads."));
      return (data as OpsLeadBoard | null) ?? { leads: [], origins: [], can: { create_client: false, onboarding: false } };
    },
  });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: [...LEADS_KEY, "get", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_lead_get", { p_id: id });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos abrir o lead."));
      if (!data) throw new FriendlyError("Lead não encontrado ou você não tem acesso ao Comercial.");
      return data as OpsLeadDetail;
    },
  });
}

/** Possíveis duplicados (só avisa). Pergunta ao banco com os dados digitados. */
export function useLeadDuplicates(p: { id?: string; company_name: string; email: string; phone: string; cnpj: string }, enabled: boolean) {
  return useQuery({
    queryKey: [...LEADS_KEY, "duplicates", p],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_lead_duplicates", { p });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos procurar duplicados."));
      return (data as OpsDuplicates | null) ?? { leads: [], clients: [] };
    },
  });
}

export function useSaveLead() {
  return useOpsMutation(async (v: { id: string | null; version: number | null; input: OpsLeadInput }) => {
    const p = { ...v.input, potential_value: parseMoneyInput(v.input.potential_value) };
    const { data, error } = await supabase.rpc("ops_lead_save", { p_id: v.id, p_version: v.version, p });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar o lead."));
    return data as string;
  });
}

/** Mudar de coluna: o cartão muda na hora e volta se o banco recusar. */
export function useMoveLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; version: number; stageId: string; lossReason?: string | null; lossNote?: string | null }) => {
      const { error } = await supabase.rpc("ops_lead_move", {
        p_id: v.id, p_version: v.version, p_stage: v.stageId, p_loss_reason: v.lossReason ?? null, p_loss_note: v.lossNote ?? null,
      });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mover o lead."));
    },
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: [...LEADS_KEY, "board"] });
      const snapshot = queryClient.getQueriesData<OpsLeadBoard>({ queryKey: [...LEADS_KEY, "board"] });
      queryClient.setQueriesData<OpsLeadBoard>({ queryKey: [...LEADS_KEY, "board"] }, (b) =>
        b && { ...b, leads: b.leads.map((l) => (l.id === v.id ? { ...l, stage_id: v.stageId } : l)) });
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAddLeadNote() {
  return useOpsMutation(async (v: { leadId: string; kind: OpsLeadKind; body: string; happenedAt: string }) => {
    const { error } = await supabase.rpc("ops_lead_note_add", {
      p_lead: v.leadId, p_kind: v.kind, p_body: v.body.trim(), p_happened_at: v.happenedAt ? new Date(v.happenedAt).toISOString() : null,
    });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos registrar."));
  });
}

export function useArchiveLead() {
  return useOpsMutation(async (v: { id: string; archived: boolean }) => {
    const { error } = await supabase.rpc("ops_lead_archive", { p_id: v.id, p_archived: v.archived });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos arquivar o lead."));
  });
}

export function useConvertLead() {
  return useOpsMutation(async (v: { id: string; version: number; clientId: string | null; start: boolean; amId: string }) => {
    const { data, error } = await supabase.rpc("ops_lead_convert", {
      p_lead: v.id, p_version: v.version, p_client: v.clientId, p_start: v.start, p_am: v.amId || null,
    });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos converter o lead."));
    return data as { client_id: string; created: boolean; onboarding: "nao" | "iniciado" | "ja_estava" };
  });
}

// ------------------------------------------------------------ configurações (admin)
export function useSaveLeadStage() {
  return useOpsMutation(async (v: { id: string | null; name: string; color: string; category: OpsLeadCategory; requirePrevious: boolean; requireNextAction: boolean }) => {
    const { error } = await supabase.rpc("ops_lead_stage_save", {
      p_id: v.id, p_name: v.name.trim(), p_color: v.color, p_category: v.category, p_require_previous: v.requirePrevious,
      p_require_next_action: v.requireNextAction,
    });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a coluna."));
  });
}
export function useReorderLeadStages() {
  return useOpsMutation(async (ids: string[]) => {
    const { error } = await supabase.rpc("ops_lead_stage_reorder", { p_ids: ids });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a ordem."));
  });
}
export function useSetLeadStageActive() {
  return useOpsMutation(async (v: { id: string; active: boolean; moveTo: string | null }) => {
    const { error } = await supabase.rpc("ops_lead_stage_set_active", { p_id: v.id, p_active: v.active, p_move_to: v.moveTo });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a coluna."));
  });
}
export function useSaveLossReason() {
  return useOpsMutation(async (v: { id: string | null; name: string; active: boolean }) => {
    const { error } = await supabase.rpc("ops_loss_reason_save", { p_id: v.id, p_name: v.name.trim(), p_active: v.active });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar o motivo."));
  });
}
