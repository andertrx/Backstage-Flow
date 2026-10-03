import { can, formatCnpj, formatPhone, opsCan, PLATFORMS } from "@backstage/shared";
import { ArrowLeft, CalendarDays, ClipboardList, History, Info as InfoIcon, LayoutDashboard, Pencil } from "lucide-react";
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
import { platformLook } from "@/features/platforms/look.ts";
import { ClientEmailCard } from "@/features/client-report/ClientEmailCard.tsx";
import { ClientPortalCard } from "@/features/client-report/ClientPortalCard.tsx";
import { ClientAccessCard } from "./ClientAccessCard.tsx";
import { ClientFormModal } from "./ClientFormModal.tsx";
import { ClientStatusBadge } from "./StatusBadge.tsx";
import { timezoneLabel } from "./timezones.ts";
import { useMyOpsPermissions } from "@/features/operations/api.ts";
import { ClientOpsTab } from "@/features/operations/ClientOps.tsx";
import { ClientMeetingsList } from "@/features/operations/MeetingsPage.tsx";
import { ClientMonitorCard } from "@/features/monitoring/overview.tsx";
import { cn } from "@/lib/cn.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";

type ClientTab = "dados" | "tarefas" | "historico" | "reunioes";

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
  // Etapa 36.3: abas da Central de Operações (só para quem acompanha o cliente lá).
  const opsPerms = useMyOpsPermissions();
  const showOps = opsCan(opsPerms.data, "ops.clients.view") || opsCan(opsPerms.data, "ops.am");
  const [params, update] = useSearchParamsUpdater();
  const asked = params.get("aba") as ClientTab | null;
  const tab: ClientTab = showOps && (asked === "tarefas" || asked === "historico" || asked === "reunioes") ? asked : "dados";
  const setTab = (t: ClientTab) => update((p) => { if (t === "dados") p.delete("aba"); else p.set("aba", t); return p; });

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
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/clientes/${client.id}/dashboard`}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <LayoutDashboard className="size-4" aria-hidden /> Dashboard do cliente
          </Link>
          {can(profile?.role, "clients.edit") && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Editar
            </Button>
          )}
        </div>
      </div>

      {showOps && (
        <nav className="flex flex-wrap gap-2" aria-label="Abas do cliente">
          {([["dados", "Dados gerais", InfoIcon], ["tarefas", "Tarefas", ClipboardList], ["historico", "Histórico Operacional", History], ["reunioes", "Reuniões", CalendarDays]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
              className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                tab === id ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-blue-700 hover:ring-blue-400")}>
              <Icon className="size-4" aria-hidden />{label}
            </button>
          ))}
        </nav>
      )}

      {(tab === "tarefas" || tab === "historico") && <ClientOpsTab clientId={client.id} tab={tab} />}
      {tab === "reunioes" && <ClientMeetingsList clientId={client.id} />}

      {tab === "dados" && (<>
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

      <ClientMonitorCard clientId={client.id} />

      <div className="grid gap-6 lg:grid-cols-2">
        {PLATFORMS.map((p) => (
          <PlatformAccountsCard key={p.id} clientId={client.id} platform={p.id} icon={platformLook(p.id).icon} />
        ))}
      </div>

      {can(profile?.role, "clients.edit") && <ClientPortalCard clientId={client.id} />}

      {can(profile?.role, "clients.edit") && <ClientEmailCard clientId={client.id} timezone={client.timezone} />}

      {can(profile?.role, "users.manage") && <ClientAccessCard clientId={client.id} />}
      </>)}

      {editing && <ClientFormModal client={client} onClose={() => setEditing(false)} />}
    </div>
  );
}
