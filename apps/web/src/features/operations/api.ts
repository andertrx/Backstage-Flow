import type { OpsSectorStatus, Role } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// ---------------------------------------------------------------------------
// Etapa 36 — Central de Operações. Toda regra de acesso é conferida no banco.
// ---------------------------------------------------------------------------

export interface OpsSector {
  id: string;
  name: string;
  color: string;
  position: number;
  status: OpsSectorStatus;
}

export interface OpsTeamMember {
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
  profile_active: boolean;
  in_ops: boolean;
  job_title: string | null;
  member_active: boolean;
  joins_meetings: boolean;
  primary_sector_id: string | null;
  secondary_sector_ids: string[];
  /** Só o admin recebe (null para os demais). */
  permissions: string[] | null;
}

export interface OpsMemberInput {
  userId: string;
  primarySector: string;
  secondary: string[];
  jobTitle: string;
  active: boolean;
  joinsMeetings: boolean;
  permissions: string[];
}

/** Nossas funções explicam o problema em português (código 22023): mostra a explicação. */
const ownDbError = (error: { code?: string; message?: string }, fallback: string) =>
  error.code === "22023" && error.message ? error.message : friendlyDbError(error, fallback);

const KEY = ["ops"] as const;

/** O que eu posso fazer na Central (o banco confere de novo em cada ação). */
export function useMyOpsPermissions() {
  const { profile } = useAuth();
  const enabled = Boolean(profile) && profile?.role !== "cliente";
  return useQuery({
    queryKey: [...KEY, "me", profile?.id],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_my_permissions");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar suas permissões da Central."));
      return (data as string[] | null) ?? [];
    },
  });
}

export function useOpsSectors() {
  return useQuery({
    queryKey: [...KEY, "sectors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_sectors").select("id,name,color,position,status").order("position").order("name");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os setores."));
      return data as OpsSector[];
    },
  });
}

export function useOpsTeam(enabled = true) {
  return useQuery({
    queryKey: [...KEY, "team"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ops_team");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a equipe."));
      return (data as OpsTeamMember[]).map((m) => ({ ...m, secondary_sector_ids: m.secondary_sector_ids ?? [] }));
    },
  });
}

function useOpsMutation<T>(fn: (v: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export function useSaveSector() {
  return useOpsMutation(async (v: { id: string | null; name: string; color: string }) => {
    const { data, error } = await supabase.rpc("ops_sector_save", { p_id: v.id, p_name: v.name.trim(), p_color: v.color });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar o setor."));
    return data as string;
  });
}

export function useReorderSectors() {
  return useOpsMutation(async (ids: string[]) => {
    const { error } = await supabase.rpc("ops_sector_reorder", { p_ids: ids });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a ordem."));
  });
}

export function useSetSectorStatus() {
  return useOpsMutation(async (v: { id: string; status: OpsSectorStatus; moveTo?: string | null }) => {
    const { error } = await supabase.rpc("ops_sector_set_status", { p_id: v.id, p_status: v.status, p_move_to: v.moveTo ?? null });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a situação do setor."));
  });
}

export function useSaveMember() {
  return useOpsMutation(async (v: OpsMemberInput) => {
    const { error } = await supabase.rpc("ops_member_save", {
      p_user_id: v.userId, p_primary_sector: v.primarySector, p_secondary: v.secondary, p_job_title: v.jobTitle.trim() || null,
      p_active: v.active, p_joins_meetings: v.joinsMeetings, p_permissions: v.permissions,
    });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar os setores da pessoa."));
  });
}
