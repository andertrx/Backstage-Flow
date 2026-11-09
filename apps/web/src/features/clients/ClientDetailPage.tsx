import { can, formatCnpj, formatPhone, opsCan, PLATFORMS } from "@backstage/shared";
import { ArrowLeft, CalendarDays, ClipboardList, History, Info as InfoIcon, LayoutDashboard, Pencil, Power, PowerOff, Radar, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useCanManageClient, useClient, useExcludeClient, useSetClientActive } from "./api.ts";
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

/** Abas que passaram para o Tracking (endereços antigos de quem salvou o link). */
const MOVED_TO_TRACKING: Record<string, string> = { conversas: "conversas", contatos: "contatos", site: "site", whatsapp: "whatsapp", sugestoes: "sugestoes" };

/** Guia curto: onde fica cada coisa dentro da ficha do cliente. */
function ClientGuideCard() {
  const rows: [string, string][] = [
    ["Resumo", "dados do cliente, contas de anúncio, portal e e-mail semanal."],
    ["Tarefas, Histórico, Reuniões", "o trabalho da agência com este cliente."],
    ["Conversas, contatos e vendas, site e origem, WhatsApp, vendas sugeridas", "ficam no menu Tracking → Painel (botão “Abrir no Tracking” aqui em cima, já com este cliente escolhido)."],
  ];
  return (
    <Card className="p-6" data-testid="client-guide">
      <h2 className="mb-3 text-base font-semibold">Onde fica cada coisa deste cliente</h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (<div key={k}><dt className="font-medium text-slate-900">{k}</dt><dd className="text-slate-600">{v}</dd></div>))}
      </dl>
      <p className="mt-3 text-xs text-slate-500">Código de instalação do site, Meta (API de Conversões), regras e a conexão do WhatsApp ficam em Tracking → Configurações.</p>
    </Card>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}

/** Confirmação de "Excluir cliente": digitar o nome do cliente (administrador, gestor ou Account Manager do cliente; só cliente desativado). */
function ExcludeClientModal({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const exclude = useExcludeClient();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <Modal title="Excluir cliente" open onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (matches) exclude.mutate({ id, name: typed }, { onSuccess: () => navigate("/clientes") });
      }}>
        <p className="text-sm text-slate-600">
          <strong>{name}</strong> some de todas as telas do CRM (Clientes, Contas, relatórios, escolhas de cliente).
          Os dados antigos continuam guardados no banco e o administrador consegue recuperar por lá, se precisar.
        </p>
        <Field label={`Para confirmar, digite o nome do cliente: ${name}`}>
          {(fid) => <Input id={fid} autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="client-exclude-name" />}
        </Field>
        {exclude.error && <Alert tone="error">{errorMessage(exclude.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={!matches} loading={exclude.isPending} data-testid="client-exclude-confirm">
            <Trash2 className="size-4" aria-hidden /> Excluir cliente
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ClientDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { data: client, isLoading, error } = useClient(id);
  const [editing, setEditing] = useState(false);
  const setActive = useSetClientActive();
  const canManage = useCanManageClient(id).data === true;
  const [excluding, setExcluding] = useState(false);
  // Etapa 36.3: abas da Central de Operações (só para quem acompanha o cliente lá).
  const opsPerms = useMyOpsPermissions();
  const showOps = opsCan(opsPerms.data, "ops.clients.view") || opsCan(opsPerms.data, "ops.am");
  const [params, update] = useSearchParamsUpdater();
  const asked = params.get("aba") as ClientTab | null;
  const movedTab = MOVED_TO_TRACKING[params.get("aba") ?? ""];
  const allTabs: { id: ClientTab; label: string; icon: typeof InfoIcon; show: boolean }[] = [
    { id: "dados", label: "Resumo", icon: InfoIcon, show: true },
    { id: "tarefas", label: "Tarefas", icon: ClipboardList, show: showOps },
    { id: "historico", label: "Histórico Operacional", icon: History, show: showOps },
    { id: "reunioes", label: "Reuniões", icon: CalendarDays, show: showOps },
  ];
  const tabs = allTabs.filter((t) => t.show);
  const tab: ClientTab = tabs.find((t) => t.id === asked)?.id ?? "dados";
  const setTab = (t: ClientTab) => update((p) => { if (t === "dados") p.delete("aba"); else p.set("aba", t); return p; });

  if (movedTab && can(profile?.role, "tracking.view")) return <Navigate to={`/tracking?cliente=${id}&aba=${movedTab}`} replace />;
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
          {can(profile?.role, "tracking.view") && (
            <Link
              to={`/tracking?cliente=${client.id}`}
              data-testid="client-open-tracking"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:text-blue-700 hover:ring-blue-400"
            >
              <Radar className="size-4" aria-hidden /> Abrir no Tracking
            </Link>
          )}
          {can(profile?.role, "clients.edit") && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Editar
            </Button>
          )}
          {canManage && (client.status === "encerrado" ? (
            <>
              <Button variant="secondary" loading={setActive.isPending} data-testid="client-reactivate"
                onClick={() => setActive.mutate({ id: client.id, active: true })}>
                <Power className="size-4" aria-hidden /> Reativar cliente
              </Button>
              <Button variant="danger" data-testid="client-exclude" onClick={() => setExcluding(true)}>
                <Trash2 className="size-4" aria-hidden /> Excluir cliente
              </Button>
            </>
          ) : (
            <Button variant="danger" loading={setActive.isPending} data-testid="client-deactivate"
              onClick={() => {
                if (window.confirm(`Desativar ${client.name}?\n\nO CRM para de sincronizar as contas, monitorar, ler a planilha, mandar o e-mail semanal, receber o tracking do site e enviar eventos ao Meta. O cliente SOME da Central (cartão, tarefas, reuniões), dos envios e do Tracking, e o acesso dele (login e link) fica bloqueado.\n\nNada é apagado e dá para reativar depois.`)) {
                  setActive.mutate({ id: client.id, active: false });
                }
              }}>
              <PowerOff className="size-4" aria-hidden /> Desativar cliente
            </Button>
          ))}
        </div>
      </div>
      {setActive.error && <Alert tone="error">{errorMessage(setActive.error)}</Alert>}
      {excluding && <ExcludeClientModal id={client.id} name={client.name} onClose={() => setExcluding(false)} />}
      {client.status === "encerrado" && (
        <div data-testid="client-deactivated">
          <Alert tone="warning">
            <strong>Cliente desativado.</strong> O CRM não sincroniza as contas, não monitora, não lê a planilha, não manda o e-mail semanal
            e não recebe o tracking dele; o acesso do cliente está bloqueado. Os dados antigos continuam guardados.
            {canManage ? " Use \"Reativar cliente\" para voltar ou \"Excluir cliente\" para abandonar tudo dele (contas, tarefas, site e integrações)." : " Só o administrador, o gestor ou o Account Manager do cliente pode reativar."}
          </Alert>
        </div>
      )}

      {tabs.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Abas do cliente" data-testid="client-tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} data-testid={`client-tab-${id}`}
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

      <ClientGuideCard />

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
