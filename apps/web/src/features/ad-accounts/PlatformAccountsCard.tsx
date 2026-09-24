import { BUSINESS_LABELS, can, formatAccountId, PLATFORM_LABELS } from "@backstage/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { AtSign, type LucideIcon, Plus, RefreshCw, Unlink } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { AccountStatusBadge } from "./AccountStatusBadge.tsx";
import { useAccountAction, useClientAdAccounts } from "./api.ts";
import { LinkAccountModal } from "./LinkAccountModal.tsx";
import type { AdAccount } from "./types.ts";

const NOT_AVAILABLE = "Informação não disponível pela API.";

function AccountRow({ account, canManage, clientId }: { account: AdAccount; canManage: boolean; clientId: string }) {
  const action = useAccountAction(clientId);
  const [feedback, setFeedback] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const pages = account.assets.filter((a) => a.asset_type === "page");
  const instagram = account.assets.filter((a) => a.asset_type === "instagram");

  async function run(kind: "refresh" | "unlink") {
    if (kind === "unlink" && !window.confirm(`Desvincular "${account.name}" deste cliente? O histórico já salvo é mantido.`)) return;
    setFeedback(null);
    try {
      const result = await action.mutateAsync({ action: kind, adAccountId: account.id });
      if (result.warning) setFeedback({ tone: "info", text: result.warning });
    } catch (err) {
      setFeedback({ tone: "error", text: (err as Error).message });
    }
  }

  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{account.name}</p>
            <AccountStatusBadge status={account.status} raw={account.raw_status} />
            {account.is_test_account && <Badge tone="warning">Conta de teste</Badge>}
          </div>
          <p className="text-xs text-slate-500">
            ID {formatAccountId(account.platform_id, account.external_id)} · {account.currency ?? NOT_AVAILABLE} ·{" "}
            {account.timezone ?? NOT_AVAILABLE}
          </p>
          <p className="text-xs text-slate-500">
            {BUSINESS_LABELS[account.platform_id] ?? "Agrupador"}:{" "}
            {account.platform_id === "google" && !account.manager_customer_id
              ? "acesso direto (sem MCC)"
              : (account.business_name ?? NOT_AVAILABLE)}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1">
            <Button variant="ghost" className="px-2 py-1 text-xs" loading={action.isPending && action.variables?.action === "refresh"} onClick={() => run("refresh")}>
              <RefreshCw className="size-3.5" aria-hidden /> Atualizar
            </Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => run("unlink")} aria-label={`Desvincular ${account.name}`}>
              <Unlink className="size-3.5" aria-hidden /> Desvincular
            </Button>
          </div>
        )}
      </div>
      {account.platform_id === "meta" && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>
          <strong>Páginas:</strong> {pages.length ? pages.map((p) => p.name ?? p.external_id).join(", ") : "nenhuma encontrada"}
        </span>
        <span className="inline-flex items-center gap-1">
          <AtSign className="size-3.5" aria-hidden />
          <strong>Instagram:</strong> {instagram.length ? instagram.map((i) => i.name ?? i.external_id).join(", ") : "nenhum perfil encontrado"}
        </span>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Dados da conta atualizados em {account.details_updated_at ? new Date(account.details_updated_at).toLocaleString("pt-BR") : "—"}
      </p>
      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}
    </li>
  );
}

interface Props {
  clientId: string;
  platform: string;
  icon: LucideIcon;
}

/** Contas de anúncio de uma plataforma vinculadas ao cliente. */
export function PlatformAccountsCard({ clientId, platform, icon: Icon }: Props) {
  const { profile } = useAuth();
  const canManage = can(profile?.role, "clients.edit");
  const { data: accounts, isLoading, error } = useClientAdAccounts(clientId, platform);
  const [linking, setLinking] = useState(false);
  const title = `Contas ${PLATFORM_LABELS[platform] ?? platform}`;

  return (
    <Card className="p-6" role="region" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-slate-500" aria-hidden />
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {canManage && (
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setLinking(true)}>
            <Plus className="size-3.5" aria-hidden /> Vincular conta
          </Button>
        )}
      </div>
      {error && <Alert tone="error">{error.message}</Alert>}
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : accounts?.length ? (
        <ul className="divide-y divide-slate-100">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} canManage={canManage} clientId={clientId} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma conta vinculada.</p>
      )}
      {linking && <LinkAccountModal clientId={clientId} platform={platform} onClose={() => setLinking(false)} />}
    </Card>
  );
}
