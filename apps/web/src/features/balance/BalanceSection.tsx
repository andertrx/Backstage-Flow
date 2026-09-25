import { can } from "@backstage/shared";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { type BalanceFilters, type RefreshResult, useAccountBalances, useRefreshBalances } from "./api.ts";
import { BalanceAccountCard } from "./BalanceAccountCard.tsx";
import { BalanceSettingsModal } from "./BalanceSettingsModal.tsx";
import type { AccountBalance } from "./types.ts";

/** Área SALDO: uma ficha por conta do filtro, com alertas e atualização pela API oficial. */
export function BalanceSection({ filters }: { filters: BalanceFilters }) {
  const { profile } = useAuth();
  const canManage = can(profile?.role, "clients.edit");
  const { data: balances = [], isLoading, error } = useAccountBalances(filters);
  const refresh = useRefreshBalances();
  const [refreshingIds, setRefreshingIds] = useState<string[]>([]);
  const [results, setResults] = useState<RefreshResult[] | null>(null);
  const [editing, setEditing] = useState<AccountBalance | null>(null);

  const run = async (ids: string[]) => {
    setRefreshingIds(ids);
    setResults(null);
    try {
      const all: RefreshResult[] = [];
      for (let i = 0; i < ids.length; i += 50) all.push(...(await refresh.mutateAsync(ids.slice(i, i + 50))).results);
      setResults(all);
    } catch (err) {
      setResults(ids.map((adAccountId) => ({ adAccountId, ok: false, error: errorMessage(err, "Falha ao atualizar.") })));
    } finally {
      setRefreshingIds([]);
    }
  };

  const failed = results?.filter((r) => !r.ok) ?? [];
  const nameOf = (id: string) => balances.find((b) => b.ad_account_id === id)?.name ?? "Conta";

  return (
    <section aria-labelledby="saldo" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="saldo" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Saldo por conta</h2>
          <p className="text-xs text-slate-500">
            Contas do cliente, plataforma e conta filtrados. Os filtros de campanha e status não se aplicam ao saldo.
          </p>
        </div>
        {canManage && balances.length > 0 && (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={refreshingIds.length > 1}
            disabled={refreshingIds.length > 0} onClick={() => run(balances.map((b) => b.ad_account_id))}>
            {refreshingIds.length <= 1 && <RefreshCw className="size-3.5" aria-hidden />} Atualizar todos os saldos
          </Button>
        )}
      </div>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {results && failed.length === 0 && (
        <Alert tone="success">{results.length === 1 ? "Saldo atualizado." : `${results.length} saldos atualizados.`}</Alert>
      )}
      {failed.length > 0 && (
        <Alert tone="error">
          <ul className="space-y-0.5">
            {failed.map((f) => (
              <li key={f.adAccountId}><strong>{nameOf(f.adAccountId)}:</strong> {f.error}</li>
            ))}
          </ul>
        </Alert>
      )}

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando saldos" />
      ) : balances.length === 0 ? (
        <Alert tone="info">Nenhuma conta de anúncio vinculada neste filtro.</Alert>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {balances.map((b) => (
            <BalanceAccountCard
              key={b.ad_account_id}
              balance={b}
              canManage={canManage}
              refreshing={refreshingIds.includes(b.ad_account_id)}
              onRefresh={() => run([b.ad_account_id])}
              onSettings={() => setEditing(b)}
            />
          ))}
        </div>
      )}

      {editing && <BalanceSettingsModal balance={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
