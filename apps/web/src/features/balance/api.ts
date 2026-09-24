import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callAdAccounts } from "@/features/ad-accounts/api.ts";
import { friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { AccountBalance } from "./types.ts";

const BALANCES_KEY = ["balances"] as const;

const MONEY = [
  "low_balance_amount_micros", "available_micros", "amount_spent_micros", "amount_due_micros",
  "spend_cap_micros", "budget_micros", "spend_last_7_days_micros",
] as const;

export interface BalanceFilters {
  clientId: string | null;
  platform: string | null;
  accountId: string | null;
}

/** Saldo de cada conta (última verificação). O RLS decide quais contas aparecem. */
export function useAccountBalances(f: BalanceFilters) {
  return useQuery({
    queryKey: [...BALANCES_KEY, f.clientId, f.platform, f.accountId],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("account_balances", {
        p_client_ids: f.clientId ? [f.clientId] : null,
        p_platforms: f.platform ? [f.platform] : null,
        p_ad_account_ids: f.accountId ? [f.accountId] : null,
      });
      if (error) throw new Error(friendlyDbError(error, "Não conseguimos carregar os saldos."));
      // bigint pode chegar como texto: normaliza para número.
      return (data as Record<string, unknown>[]).map((row) => {
        const out = { ...row, issues: (row.issues as string[] | null) ?? [], spend_days: Number(row.spend_days ?? 0) } as Record<string, unknown>;
        for (const k of MONEY) out[k] = row[k] == null ? null : Number(row[k]);
        return out as unknown as AccountBalance;
      });
    },
  });
}

export interface RefreshResult {
  adAccountId: string;
  ok: boolean;
  error?: string;
}

/** Consulta o saldo nas APIs oficiais (pelo servidor) e guarda uma fotografia. */
export function useRefreshBalances() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adAccountIds: string[]) => callAdAccounts<{ results: RefreshResult[] }>({ action: "refresh_balance", adAccountIds }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: BALANCES_KEY }),
  });
}

export function useBalanceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { adAccountId: string; lowBalanceDays: number; lowBalanceAmount: number | null }) =>
      callAdAccounts<{ adAccountId: string }>({ action: "balance_settings", ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BALANCES_KEY }),
  });
}
