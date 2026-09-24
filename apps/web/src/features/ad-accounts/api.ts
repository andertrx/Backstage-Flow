import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyDbError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { AdAccount, AvailableAccount, PlatformConnection } from "./types.ts";

const CONNECTIONS_KEY = ["platform-connections"] as const;
const accountsKey = (clientId: string) => ["ad-accounts", clientId] as const;

/** Conexões (sem o token — ele nunca sai do servidor). Visível para admin e gestor. */
export function useConnections(platform: string) {
  return useQuery({
    queryKey: [...CONNECTIONS_KEY, platform],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_connections")
        .select("id, platform_id, label, status, external_user_id, external_user_name, last_checked_at, last_error, created_at")
        .eq("platform_id", platform)
        .order("created_at");
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar as conexões."));
      return data as PlatformConnection[];
    },
  });
}

/** Contas vinculadas (ativas) de um cliente, com páginas e Instagram. */
export function useClientAdAccounts(clientId: string, platform: string) {
  return useQuery({
    queryKey: [...accountsKey(clientId), platform],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select(
          "id, platform_id, external_id, client_id, connection_id, name, currency, timezone, status, raw_status, status_reason, business_name, is_prepay, manager_customer_id, is_test_account, linked_at, details_updated_at, assets:ad_account_assets(asset_type, external_id, name)",
        )
        .eq("client_id", clientId)
        .eq("platform_id", platform)
        .is("unlinked_at", null)
        .order("name");
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar as contas de anúncio."));
      return data as unknown as AdAccount[];
    },
  });
}

type Action =
  | { action: "connect"; platform: "meta"; label: string; accessToken: string }
  | { action: "google_status" }
  | { action: "google_start"; redirectUri: string }
  | { action: "google_complete"; code: string; state: string; redirectUri: string; label: string }
  | { action: "disconnect"; connectionId: string }
  | { action: "list_available"; connectionId: string }
  | { action: "link"; connectionId: string; externalId: string; clientId: string; managerCustomerId?: string | null }
  | { action: "refresh"; adAccountId: string }
  | { action: "unlink"; adAccountId: string }
  | { action: "refresh_balance"; adAccountIds: string[] }
  | { action: "balance_settings"; adAccountId: string; lowBalanceDays: number; lowBalanceAmount: number | null };

/** Toda escrita passa pela Edge Function ad-accounts (o site só lê). */
export async function callAdAccounts<T>(body: Action): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ad-accounts", { body });
  if (error) throw new Error(await friendlyFunctionError(error));
  return (data as { data: T }).data;
}

export function useConnectionAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Extract<Action, { action: "connect" | "disconnect" | "google_complete" }>) =>
      callAdAccounts<{ connectionId: string; ownerName?: string | null; renewed?: boolean }>(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
  });
}

export function useAvailableAccounts(connectionId: string | null) {
  return useQuery({
    queryKey: ["available-accounts", connectionId],
    enabled: Boolean(connectionId),
    staleTime: 0,
    retry: false,
    queryFn: () => callAdAccounts<{ accounts: AvailableAccount[] }>({ action: "list_available", connectionId: connectionId! }),
  });
}

export function useAccountAction(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Extract<Action, { action: "link" | "refresh" | "unlink" }>) =>
      callAdAccounts<{ adAccountId: string; warning?: string | null }>(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountsKey(clientId) });
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ["available-accounts"] });
    },
  });
}

/** Endereço para onde o Google devolve o usuário depois da autorização. */
export const googleRedirectUri = () => `${window.location.origin}/configuracoes/integracoes/google/callback`;

/** Quais segredos do Google ainda faltam no servidor (só nomes, nunca valores). */
export function useGoogleStatus() {
  return useQuery({
    queryKey: ["google-status"],
    queryFn: () => callAdAccounts<{ missing: string[]; callbackPath: string }>({ action: "google_status" }),
  });
}

/** Inicia o login com o Google: o servidor devolve o link oficial de autorização. */
export async function startGoogleConnection(): Promise<void> {
  const { url } = await callAdAccounts<{ url: string }>({ action: "google_start", redirectUri: googleRedirectUri() });
  window.location.assign(url);
}
