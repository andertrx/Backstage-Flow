import type { Role } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile } from "@/features/auth/types.ts";
import { FriendlyError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

const USERS_KEY = ["users"] as const;

/** Lista de usuários. O RLS só devolve todos para administradores. */
export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
      if (error) {
        console.error("[usuarios]", error);
        throw new FriendlyError("Não conseguimos carregar os usuários.");
      }
      return data as Profile[];
    },
  });
}

export type AdminUsersAction =
  | { action: "create"; email: string; fullName: string; role: Role; password: string }
  | { action: "update"; userId: string; fullName?: string; role?: Role; active?: boolean }
  | { action: "set_password"; userId: string; password: string };

/** Ações de administrador passam SEMPRE pelo servidor (Edge Function admin-users). */
export function useAdminUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AdminUsersAction) => {
      const { data, error } = await supabase.functions.invoke("admin-users", { body });
      if (error) throw new FriendlyError(await friendlyFunctionError(error));
      return data as { data: { id: string } };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
