import type { OpsSavedViewPage, OpsSearchKind, OpsViewFilters } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";

// ---------------------------------------------------------------------------
// Etapa 36.7 — painel operacional, visões salvas e busca da Central.
// O banco calcula tudo só sobre o que a pessoa pode ver.
// ---------------------------------------------------------------------------

export interface OpsDashboardFilters {
  sector_id?: string;
  client_id?: string;
  person_id?: string;
  from?: string;
  to?: string;
}

export interface OpsDashboardTaskRef {
  id: string;
  number: number;
  title: string;
  dias?: number;
  dependencias?: number;
}

export interface OpsDashboard {
  today: string;
  from: string;
  to: string;
  cards: {
    abertas: number;
    andamento: number;
    atrasadas: number;
    vencem_hoje: number;
    vencem_7d: number;
    bloqueadas: number;
    aguardando_cliente: number;
    sem_responsavel: number;
    paradas: number;
    concluidas: number;
    media_dias: number | null;
  };
  by_sector: { sector_id: string; name: string; color: string; abertas: number; atrasadas: number; bloqueadas: number; concluidas: number }[];
  by_status: { status_id: string; name: string; color: string; n: number }[];
  by_person: { user_id: string; name: string; abertas: number; atrasadas: number }[];
  stalled: OpsDashboardTaskRef[];
  blocked: OpsDashboardTaskRef[];
  /** null: a pessoa não vê clientes. */
  clients_waiting: { client_id: string; name: string; stage: string; dias: number }[] | null;
  meeting_pending: number;
  meetings_today: number;
  /** null: só quem tem "Comercial". */
  leads_overdue: number | null;
}

export interface OpsSearchResult {
  kind: OpsSearchKind;
  id: string;
  title: string;
  detail: string | null;
  link: string;
}

export interface OpsSavedView {
  id: string;
  page: OpsSavedViewPage;
  name: string;
  filters: OpsViewFilters;
  updated_at: string;
}

const KEY = ["ops"] as const;

export function useOpsDashboard(f: OpsDashboardFilters, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "dashboard", f],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_dashboard", { f });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o painel."));
      return data as OpsDashboard | null;
    },
  });
}

/** Busca da Central (mínimo 2 letras). */
export function useOpsSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: [...KEY, "search", term],
    enabled: term.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_search", { p_q: term });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos buscar agora."));
      return (data as OpsSearchResult[] | null) ?? [];
    },
  });
}

export function useSavedViews(page: OpsSavedViewPage) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: [...KEY, "views", page, profile?.id],
    enabled: Boolean(profile),
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_saved_views").select("id,page,name,filters,updated_at").eq("page", page).order("name");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as visões salvas."));
      return data as OpsSavedView[];
    },
  });
}

export function useSaveView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { page: OpsSavedViewPage; name: string; filters: OpsViewFilters }) => {
      const { data, error } = await supabase.rpc("ops_saved_view_save", { p_page: v.page, p_name: v.name.trim(), p_filters: v.filters });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a visão."));
      return data as string;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...KEY, "views"] }),
  });
}

export function useDeleteView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("ops_saved_view_delete", { p_id: id });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos apagar a visão."));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...KEY, "views"] }),
  });
}
