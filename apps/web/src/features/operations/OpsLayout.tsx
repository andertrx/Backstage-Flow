import { opsCan, type OpsPermission } from "@backstage/shared";
import { Building2, CalendarDays, ClipboardList, Gauge, Handshake, ListChecks, Lock, type LucideIcon, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, NavLink, Outlet } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { useMyOpsPermissions } from "./api.ts";
import { OpsSearch } from "./OpsSearch.tsx";

/**
 * Abas da Central. Cada aba entrou quando a sua fase ficou pronta (nada de
 * botão que não funciona). O Painel (36.7) vem primeiro: é onde a Central abre
 * para quem tem "Ver o painel"; os demais abrem em Minhas tarefas.
 * "anyOf": basta uma das permissões.
 * Etapa 38.1: Comercial (vendas) e Operação (clientes liberados) separados; Equipe e Configurações
 * ficam à parte, como administração.
 */
export const OPS_TABS: { to: string; label: string; icon: LucideIcon; permission: OpsPermission; anyOf?: OpsPermission[]; admin?: boolean }[] = [
  { to: "/operacoes/painel", label: "Painel", icon: Gauge, permission: "ops.dashboard.view" },
  { to: "/operacoes/minhas-tarefas", label: "Minhas tarefas", icon: ListChecks, permission: "ops.access" },
  { to: "/operacoes/tarefas", label: "Tarefas", icon: ClipboardList, permission: "ops.access" },
  { to: "/operacoes/comercial", label: "Comercial", icon: Handshake, permission: "ops.commercial" },
  // 38.2: Operação = clientes (quem pode ver) + Filas dos setores (todos da Central).
  { to: "/operacoes/clientes", label: "Operação", icon: Building2, permission: "ops.access" },
  { to: "/operacoes/reunioes", label: "Reuniões", icon: CalendarDays, permission: "ops.access" },
  { to: "/operacoes/equipe", label: "Equipe", icon: Users, permission: "ops.access", admin: true },
  { to: "/operacoes/configuracoes", label: "Configurações", icon: Settings, permission: "ops.admin", admin: true },
];

export const tabAllowed = (granted: readonly string[] | undefined, t: { permission: OpsPermission; anyOf?: OpsPermission[] }) =>
  (t.anyOf ?? [t.permission]).some((p) => opsCan(granted, p));

/** Só quem tem a permissão da Central (conferida no banco) entra. */
export function RequireOps({ permission, anyOf, children }: { permission: OpsPermission; anyOf?: OpsPermission[]; children: ReactNode }) {
  const perms = useMyOpsPermissions();
  if (perms.isLoading) return <FullPageSpinner />;
  if (perms.error) return <Alert tone="error">{errorMessage(perms.error)}</Alert>;
  if (!opsCan(perms.data, "ops.access")) {
    return (
      <Card className="mx-auto max-w-md space-y-3 p-6 text-center" data-testid="ops-no-access">
        <Lock className="mx-auto size-8 text-slate-400" aria-hidden />
        <h1 className="text-lg font-semibold text-slate-900">Você ainda não está na Central de Operações</h1>
        <p className="text-sm text-slate-600">Peça ao administrador para colocar você num setor em Configurações → Usuários.</p>
      </Card>
    );
  }
  if (!tabAllowed(perms.data, { permission, anyOf })) return <Navigate to="/operacoes" replace />;
  return children;
}

export function OpsIndexRedirect() {
  const perms = useMyOpsPermissions();
  const first = OPS_TABS.find((t) => tabAllowed(perms.data, t));
  return <Navigate to={first?.to ?? "/operacoes/minhas-tarefas"} replace />;
}

export function OpsLayout() {
  const perms = useMyOpsPermissions();
  const tabs = OPS_TABS.filter((t) => tabAllowed(perms.data, t));
  return (
    <RequireOps permission="ops.access">
      <div className="space-y-6" data-testid="ops-layout">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Central de Operações</h1>
            <p className="mt-1 text-sm text-slate-500">Setores, equipe, tarefas e reuniões do dia a dia. Separada da gestão de anúncios.</p>
          </div>
          <OpsSearch />
        </div>
        {/* Abas em "pílula", no padrão da referência visual (tema claro). */}
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Central de Operações">
          {[tabs.filter((t) => !t.admin), tabs.filter((t) => t.admin)].map((group, gi) => group.length > 0 && (
            <div key={gi} className={cn("flex flex-wrap gap-2", gi === 1 && "sm:ml-auto")} data-testid={gi === 1 ? "ops-tabs-admin" : "ops-tabs-main"}>
              {group.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                      isActive
                        ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]"
                        : gi === 1
                          ? "bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200 hover:text-blue-700 hover:ring-blue-400"
                          : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-blue-700 hover:ring-blue-400",
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <Outlet />
      </div>
    </RequireOps>
  );
}
