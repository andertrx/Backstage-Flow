import { can, formatCnpj, formatPhone } from "@backstage/shared";
import { ArrowLeft, Megaphone, Pencil, Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useClient } from "./api.ts";
import { PlatformAccountsCard } from "@/features/ad-accounts/PlatformAccountsCard.tsx";
import { ClientAccessCard } from "./ClientAccessCard.tsx";
import { ClientFormModal } from "./ClientFormModal.tsx";
import { ClientStatusBadge } from "./StatusBadge.tsx";
import { timezoneLabel } from "./timezones.ts";

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}

export function ClientDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { data: client, isLoading, error } = useClient(id);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <FullPageSpinner />;
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!client) {
    // O RLS devolve "nada" tanto para cliente inexistente quanto sem permissão.
    return (
      <div className="space-y-4">
        <Alert tone="error">Cliente não encontrado ou você não tem acesso a ele.</Alert>
        <Link to="/clientes" className="text-sm font-medium text-brand-600">
          Voltar para Clientes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/clientes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Clientes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <ClientStatusBadge status={client.status} />
          </div>
          {client.company && <p className="mt-1 text-sm text-slate-500">{client.company}</p>}
        </div>
        {can(profile?.role, "clients.edit") && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden /> Editar
          </Button>
        )}
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold">Dados cadastrais</h2>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="CNPJ">{client.cnpj && formatCnpj(client.cnpj)}</Info>
          <Info label="Responsável">{client.owner_name}</Info>
          <Info label="Telefone">{client.phone && formatPhone(client.phone)}</Info>
          <Info label="E-mail">{client.email}</Info>
          <Info label="Fuso horário">{timezoneLabel(client.timezone)}</Info>
          <Info label="Cadastrado em">{new Date(client.created_at).toLocaleString("pt-BR")}</Info>
        </dl>
        {client.notes && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Observações</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{client.notes}</dd>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <PlatformAccountsCard clientId={client.id} platform="meta" icon={Megaphone} />
        <PlatformAccountsCard clientId={client.id} platform="google" icon={Search} />
      </div>

      {can(profile?.role, "users.manage") && <ClientAccessCard clientId={client.id} />}

      {editing && <ClientFormModal client={client} onClose={() => setEditing(false)} />}
    </div>
  );
}
