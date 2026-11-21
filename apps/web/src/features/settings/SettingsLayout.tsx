import { NavLink, Navigate, Outlet } from "react-router";
import { settingsTabsFor } from "@/components/layout/navigation.ts";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useMyOpsPermissions } from "@/features/operations/api.ts";
import { cn } from "@/lib/cn.ts";

/** Entrada de /configuracoes: abre a primeira aba que a pessoa pode ver. */
export function SettingsIndex() {
  const { profile } = useAuth();
  const { data: ops, isLoading } = useMyOpsPermissions();
  const first = settingsTabsFor(profile?.role, ops)[0];
  if (isLoading && !first) return null;
  return <Navigate to={first?.to ?? "/"} replace />;
}

/** Abas de Configurações (21/11/2026: Usuários, Integrações, Papéis, Central, Sincronização e Logs; cada pessoa vê só as abas que pode abrir). */
export function SettingsLayout() {
  const { profile } = useAuth();
  const { data: ops, isLoading } = useMyOpsPermissions();
  const tabs = settingsTabsFor(profile?.role, ops);
  if (tabs.length === 0) return isLoading ? null : <Navigate to="/" replace />;
  return (
    <div className="space-y-6">
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Configurações">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium",
                isActive ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
