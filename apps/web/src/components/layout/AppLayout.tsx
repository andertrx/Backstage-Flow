import { ROLE_LABELS } from "@backstage/shared";
import { LogOut, Menu, UserCircle, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { cn } from "@/lib/cn.ts";
import { Logo } from "./Logo.tsx";
import { navItemsFor } from "./navigation.ts";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth();
  return (
    <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Menu principal">
      {navItemsFor(profile?.role).map(({ label, path, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
            )
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-full">
      {/* Sidebar fixa no desktop */}
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 lg:flex">
        <div className="flex h-16 items-center px-6">
          <Logo inverted />
        </div>
        <SidebarNav />
      </aside>

      {/* Sidebar em gaveta no celular/tablet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-slate-900">
            <div className="flex h-16 items-center justify-between px-6">
              <Logo inverted />
              <button onClick={() => setMobileOpen(false)} className="text-slate-300" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button className="text-slate-600 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu className="size-6" />
          </button>
          <div className="flex-1" />
          <Link to="/minha-conta" className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100">
            <UserCircle className="size-6 text-slate-400" aria-hidden />
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-medium leading-tight">{profile?.full_name || profile?.email}</span>
              <span className="block text-xs text-slate-500">{profile && ROLE_LABELS[profile.role]}</span>
            </span>
          </Link>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
