import { formatAccountId, PLATFORM_LABELS } from "@backstage/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { AccountStatusBadge } from "./AccountStatusBadge.tsx";
import { useAccountAction, useAvailableAccounts, useConnections } from "./api.ts";
import { ListFreshness } from "./ListFreshness.tsx";

interface Props {
  clientId: string;
  platform: string;
  onClose: () => void;
}

export function LinkAccountModal({ clientId, platform, onClose }: Props) {
  const { profile } = useAuth();
  const { data: connections, isLoading: loadingConnections } = useConnections(platform);
  const usable = connections?.filter((c) => c.status !== "revogada") ?? [];
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const selectedConnection = connectionId ?? (usable.length === 1 ? usable[0].id : null);
  const available = useAvailableAccounts(selectedConnection);
  const action = useAccountAction(clientId);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  async function link(externalId: string, managerCustomerId: string | null) {
    if (!selectedConnection) return;
    setError(null);
    setLinking(externalId);
    try {
      const result = await action.mutateAsync({ action: "link", connectionId: selectedConnection, externalId, clientId, managerCustomerId });
      if (result.warning) window.alert(result.warning);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLinking(null);
    }
  }

  return (
    <Modal title={`Vincular conta ${PLATFORM_LABELS[platform] ?? platform}`} open onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        {loadingConnections ? (
          <p className="text-sm text-slate-500">Carregando conexões...</p>
        ) : usable.length === 0 ? (
          <Alert tone="info">
            Ainda não há conexão com o {PLATFORM_LABELS[platform]}.{" "}
            {profile?.role === "admin" ? (
              <Link to="/configuracoes/integracoes" className="font-medium underline">
                Conectar agora
              </Link>
            ) : (
              "Peça a um administrador para conectar."
            )}
          </Alert>
        ) : (
          <>
            {usable.length > 1 && (
              <Field label="Conexão">
                {(id) => (
                  <Select id={id} value={selectedConnection ?? ""} onChange={(e) => setConnectionId(e.target.value || null)}>
                    <option value="">Selecione...</option>
                    {usable.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            {available.isLoading && <p className="text-sm text-slate-500">Buscando contas no {PLATFORM_LABELS[platform]}...</p>}
            {available.error && <Alert tone="error">{errorMessage(available.error)}</Alert>}
            {available.data && <ListFreshness updatedAt={available.dataUpdatedAt} fetching={available.isFetching} onRefresh={() => available.refetch()} />}
            {available.data &&
              (available.data.accounts.length === 0 ? (
                <p className="text-sm text-slate-500">Esta conexão não tem acesso a nenhuma conta de anúncio.</p>
              ) : (
                <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
                  {available.data.accounts.map((a) => (
                    <li key={a.externalId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-slate-500">
                          ID {formatAccountId(platform, a.externalId)}
                          {a.currency && ` · ${a.currency}`}
                          {a.businessName && ` · ${platform === "google" ? "via " : ""}${a.businessName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.isTestAccount && <Badge tone="warning">Conta de teste</Badge>}
                        <AccountStatusBadge status={a.status} />
                        {a.linkedClientId ? (
                          <span className="text-xs text-slate-500">
                            {a.linkedClientId === clientId ? "Já vinculada aqui" : "Vinculada a outro cliente"}
                          </span>
                        ) : (
                          <Button className="px-3 py-1 text-xs" loading={linking === a.externalId} disabled={linking !== null} onClick={() => link(a.externalId, a.managerId)}>
                            Vincular
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ))}
          </>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
