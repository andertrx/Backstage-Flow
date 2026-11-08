import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { Client, ClientAccess, ClientInput } from "./types.ts";
import { toast } from "@/lib/toastStore.ts";

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

/**
 * Clientes para escolher nas telas do dia a dia: sem os desativados (23/10/2026).
 * A lista de Clientes e a ficha continuam usando useClients/useClient.
 */
export function useActiveClients() {
  return useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os clientes."));
      return data as Client[];
    },
    select: (list: Client[]) => list.filter((c) => c.status !== "encerrado"),
  });
}

/** A pessoa pode desativar, reativar ou excluir este cliente? (administrador, gestor ou Account Manager do cliente; o banco decide) */
export function useCanManageClient(id: string | undefined) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, id, "pode-gerenciar"],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_can_manage", { p_client_id: id! });
      if (error) return false;
      return data === true;
    },
  });
}

/** Desativar ("encerrado") ou reativar ("ativo"). Administrador, gestor ou Account Manager do cliente; o banco confere e faz o resto. */
export function useSetClientActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("client_set_active", { p_client_id: id, p_active: active });
      if (error) throw new FriendlyError(friendlyDbError(error, active ? "Não conseguimos reativar o cliente." : "Não conseguimos desativar o cliente."));
    },
    // Muitas telas mudam (listas, alertas, planilha...): recarrega tudo.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/**
 * Excluir cliente (23/10/2026; 08/11/2026: também gestor e Account Manager do cliente): só cliente já desativado, digitando o nome para confirmar.
 * Some de todas as telas; os dados ficam guardados no banco (dá para recuperar por lá).
 */
export function useExcludeClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.rpc("client_exclude", { p_client_id: id, p_name: name });
      if (error) {
        // As mensagens de regra (nome não confere, desative antes) já vêm prontas do banco.
        throw new FriendlyError(error.code === "22023" ? error.message : friendlyDbError(error, "Não conseguimos excluir o cliente."));
      }
    },
    // Recarrega as telas sem esperar: quem chamou já pode sair da ficha do cliente excluído.
    onSuccess: () => { void queryClient.invalidateQueries(); },
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
        toast.success("Cliente salvo");
        return id;
      }
      // O id é gerado aqui para não depender de "retornar a linha" logo após o
      // cadastro (o acesso do gestor é liberado por um gatilho logo em seguida).
      const newId = crypto.randomUUID();
      const { error } = await supabase.from("clients").insert({ id: newId, ...input });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos cadastrar o cliente."));
      toast.success("Cliente cadastrado");
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
