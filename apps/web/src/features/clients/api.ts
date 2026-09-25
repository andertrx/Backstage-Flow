import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { Client, ClientAccess, ClientInput } from "./types.ts";

const CLIENTS_KEY = ["clients"] as const;

/** Clientes que o usuário pode ver (o RLS filtra no banco). */
export function useClients() {
  return useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os clientes."));
      return data as Client[];
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id!).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o cliente."));
      return data as Client | null;
    },
  });
}

/** Cria (sem id) ou atualiza (com id) um cliente. */
export function useSaveClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ClientInput }) => {
      if (id) {
        const { error } = await supabase.from("clients").update(input).eq("id", id);
        if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos salvar o cliente."));
        return id;
      }
      // O id é gerado aqui para não depender de "retornar a linha" logo após o
      // cadastro (o acesso do gestor é liberado por um gatilho logo em seguida).
      const newId = crypto.randomUUID();
      const { error } = await supabase.from("clients").insert({ id: newId, ...input });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos cadastrar o cliente."));
      return newId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

const accessKey = (clientId: string) => ["client-access", clientId] as const;

/** Quem tem acesso ao cliente (somente admin consegue ler todos). */
export function useClientAccess(clientId: string, enabled: boolean) {
  return useQuery({
    queryKey: accessKey(clientId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_client_access")
        .select("user_id, created_at, profile:profiles(full_name, email, role, active)")
        .eq("client_id", clientId)
        .order("created_at");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a equipe."));
      return data as unknown as ClientAccess[];
    },
  });
}

export function useChangeClientAccess(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, grant }: { userId: string; grant: boolean }) => {
      const { error } = grant
        ? await supabase.from("user_client_access").insert({ user_id: userId, client_id: clientId })
        : await supabase.from("user_client_access").delete().eq("user_id", userId).eq("client_id", clientId);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos alterar o acesso."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessKey(clientId) }),
  });
}
