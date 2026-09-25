import { formatAccountId, PLATFORM_LABELS } from "@backstage/shared";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { AccountStatusBadge } from "@/features/ad-accounts/AccountStatusBadge.tsx";
import { useAvailableAccounts } from "@/features/ad-accounts/api.ts";
import type { PlatformConnection } from "@/features/ad-accounts/types.ts";
import { useClients } from "@/features/clients/api.ts";
import { groupByOwner } from "./groupAccounts.ts";
import { ListFreshness } from "@/features/ad-accounts/ListFreshness.tsx";

/** "Ver contas desta conexão": o que a plataforma deixa o sistema enxergar (só leitura). */
export function ConnectionAccountsModal({ connection, onClose }: { connection: PlatformConnection; onClose: () => void }) {
  const platform = connection.platform_id;
  const available = useAvailableAccounts(connection.id);
  const { data: clients = [] } = useClients();
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "outro cliente";
  const accounts = available.data?.accounts ?? [];
  const groups = groupByOwner(accounts, platform);
  const linked = accounts.filter((a) => a.linkedClientId).length;

  return (
    <Modal title={`Contas desta conexão — ${connection.label}`} open onClose={onClose} size="lg">
      <div className="space-y-4">
        {available.isLoading && <p className="text-sm text-slate-500">Buscando contas no {PLATFORM_LABELS[platform] ?? platform}...</p>}
        {available.error && <Alert tone="error">{(available.error as Error).message}</Alert>}
        {available.data && <ListFreshness updatedAt={available.dataUpdatedAt} fetching={available.isFetching} onRefresh={() => available.refetch()} />}

        {available.data && accounts.length === 0 && (
          <Alert tone="warning">
            <p className="font-medium">Esta conexão ainda não enxerga nenhuma conta de anúncio.</p>
            {platform === "meta" ? (
              <p className="mt-1">
                No Meta Business Suite, abra <em>Configurações do negócio → Usuários → Usuários do sistema</em>, escolha o usuário{" "}
                <strong>{connection.external_user_name ?? "desta conexão"}</strong>, clique em <em>Atribuir ativos → Contas de anúncios</em> e marque as
                contas. Depois, abra esta lista de novo — não precisa conectar outra vez.
              </p>
            ) : (
              <p className="mt-1">Confira se o e-mail usado na conexão tem acesso às contas no Google Ads (direto ou por uma MCC).</p>
            )}
          </Alert>
        )}

        {accounts.length > 0 && (
          <>
            <p className="text-sm text-slate-600" data-testid="connection-accounts-summary">
              {accounts.length} {accounts.length === 1 ? "conta encontrada" : "contas encontradas"} em {groups.length}{" "}
              {platform === "google" ? (groups.length === 1 ? "grupo" : "grupos") : groups.length === 1 ? "BM" : "BMs"} · {linked}{" "}
              {linked === 1 ? "já vinculada" : "já vinculadas"} a clientes.
            </p>
            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.owner} aria-label={g.owner} data-testid="connection-accounts-group">
                  <h3 className="mb-1.5 text-sm font-semibold text-slate-900">
                    {g.owner} <span className="font-normal text-slate-500">({g.accounts.length})</span>
                  </h3>
                  <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                    {g.accounts.map((a) => (
                      <li key={a.externalId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-slate-500">
                            ID {formatAccountId(platform, a.externalId)}
                            {a.currency && ` · ${a.currency}`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {a.isTestAccount && <Badge tone="warning">Conta de teste</Badge>}
                          <AccountStatusBadge status={a.status} />
                          <span className="text-xs text-slate-500" data-testid="connection-account-link">
                            {a.linkedClientId ? `Vinculada a ${clientName(a.linkedClientId)}` : "Não vinculada"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Para vincular uma conta: abra o cliente em <Link to="/clientes" className="font-medium text-brand-700 hover:underline">Clientes</Link> e clique em{" "}
              <strong>Vincular conta</strong>. Ainda não tem clientes? Cadastre primeiro em Clientes → Novo cliente.
            </p>
          </>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}
