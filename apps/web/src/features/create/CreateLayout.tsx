import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/cn.ts";

const TABS = [
  { to: "/criar/campanhas", label: "Criar campanhas" },
  { to: "/criar/anuncios", label: "Criador de Anúncios" },
];

/** Área "Criar" (21/11/2026): junta os rascunhos de campanha e o Criador de Anúncios, que eram dois itens do menu. As duas telas continuam como eram. */
export function CreateLayout() {
  return (
    <div className="space-y-6">
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Criar">
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
