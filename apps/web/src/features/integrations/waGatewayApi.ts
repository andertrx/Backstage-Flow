import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// ---------------------------------------------------------------------------
// Etapa 44.1 — conexão do WhatsApp por API NÃO OFICIAL (só administrador).
// A chave é colada na tela, vai direto para o cofre e nunca volta; aqui só se sabe se ela existe.
// ---------------------------------------------------------------------------

export type WaState = "desconhecido" | "conectado" | "desconectado" | "aguardando_leitura" | "erro";

export interface WaGatewaySettings {
  enabled: boolean;
  base_url: string | null;
  instance_name: string;
  has_key: boolean;
  key_updated_at: string | null;
  risk_accepted_at: string | null;
  connection_state: WaState;
  connected_at: string | null;
  last_check_at: string | null;
  last_error: string | null;
}

export interface WaConnectResult {
  state: WaState;
  qr?: string | null;
  pairingCode?: string | null;
  message: string | null;
}

const KEY = ["wa-gateway"] as const;

/** Mensagem do banco quando a regra é nossa (22023/42501); senão, a mensagem amigável. */
function dbError(error: { code?: string; message: string }, fallback: string) {
  return error.code === "22023" || error.code === "42501" ? error.message : friendlyDbError(error, fallback);
}

export function useWaGateway(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_gateway_settings")
        .select("enabled,base_url,instance_name,has_key,key_updated_at,risk_accepted_at,connection_state,connected_at,last_check_at,last_error").eq("id", true).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a conexão do WhatsApp."));
      return data as WaGatewaySettings | null;
    },
  });
}

export function useSaveWaGateway() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { baseUrl: string; instance: string; apiKey: string; acceptRisk: boolean }) => {
      const { error } = await supabase.rpc("wa_gateway_save", {
        p_base_url: v.baseUrl.trim(), p_instance: v.instance.trim(), p_api_key: v.apiKey.trim() || null, p_accept_risk: v.acceptRisk,
      });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos salvar a conexão do WhatsApp."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetWaEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc("wa_gateway_set_enabled", { p_enabled: enabled });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos mudar os envios automáticos."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

async function callWaGateway<T>(body: { action: "status" } | { action: "connect"; number?: string } | { action: "logout" }): Promise<T> {
  const { data, error } = await supabase.functions.invoke("wa-gateway", { body });
  if (error) throw new FriendlyError(await friendlyFunctionError(error));
  return (data as { data: T }).data;
}

/** "Verificar agora" e a conferência automática enquanto se espera a leitura do QR Code. */
export function useWaStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => callWaGateway<{ state: WaState; message: string | null }>({ action: "status" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useWaConnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (number?: string) => callWaGateway<WaConnectResult>(number?.trim() ? { action: "connect", number: number.trim() } : { action: "connect" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useWaLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => callWaGateway<{ state: WaState }>({ action: "logout" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
