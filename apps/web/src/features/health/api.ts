import { useQuery } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import type { AccountHealthRow } from "./types.ts";

const MONEY = ["low_balance_amount_micros", "available_micros", "spend_last_7_days_micros"] as const;

/** Saúde de todas as contas que o usuário enxerga (o RLS decide quais). */
export function useAccountHealth() {
  return useQuery({
    queryKey: ["balances", "health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("account_health", {});
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar a saúde das contas."));
      return (data as Record<string, unknown>[]).map((row) => {
        const out = { ...row, issues: (row.issues as string[] | null) ?? [], spend_days: Number(row.spend_days ?? 0) } as Record<string, unknown>;
        for (const k of MONEY) out[k] = row[k] == null ? null : Number(row[k]);
        return out as unknown as AccountHealthRow;
      });
    },
  });
}
