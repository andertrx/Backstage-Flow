import { Navigate, Outlet } from "react-router";
import { ScrollTabs } from "@/components/ui/scroll-tabs.tsx";
import { settingsTabsFor } from "@/components/layout/navigation.ts";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useMyOpsPermissions } from "@/features/operations/api.ts";

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
      <ScrollTabs label="Configurações" tabs={tabs} />
      <Outlet />
    </div>
  );
}
