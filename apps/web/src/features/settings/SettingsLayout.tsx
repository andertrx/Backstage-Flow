import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/cn.ts";

const TABS = [
  { to: "/configuracoes/usuarios", label: "Usuários" },
  { to: "/configuracoes/integracoes", label: "Integrações" },
  { to: "/configuracoes/permissoes", label: "Papéis e permissões" },
];

/** Abas da área de Configurações (somente administradores). */
export function SettingsLayout() {
  return (
    <div className="space-y-6">
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Configurações">
        {TABS.map((tab) => (
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
