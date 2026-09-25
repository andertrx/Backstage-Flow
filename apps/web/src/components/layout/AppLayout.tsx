import { can, ROLE_LABELS } from "@backstage/shared";
import { ChevronsLeft, ChevronsRight, LogOut, Menu, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { useUnseenAlertsCount } from "@/features/alerts/api.ts";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { GlobalSearch } from "@/features/search/GlobalSearch.tsx";
import { cn } from "@/lib/cn.ts";
import { usePersistentState } from "@/lib/usePersistentState.ts";
import { Logo } from "./Logo.tsx";
import { navGroupsFor, navItemForPath } from "./navigation.ts";

const APP_NAME = "Backstage Flow";
const EXTRA_TITLES: Record<string, string> = { "/minha-conta": "Minha conta", "/comparar": "Comparar períodos" };

function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { profile } = useAuth();
  const { data: unseen = 0 } = useUnseenAlertsCount(can(profile?.role, "internal.view"));
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu principal">
      {navGroupsFor(profile?.role).map(({ group, items }, gi) => (
        <div key={group} className={cn(gi > 0 && "mt-5")}>
          {collapsed ? (
            gi > 0 && <div className="mx-2 mb-3 border-t border-white/10" aria-hidden />
          ) : (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group}</p>
          )}
          <ul className="space-y-0.5">
            {items.map(({ label, path, icon: Icon }) => {
              const badge = path === "/alertas" && unseen > 0;
              return (
                <li key={path}>
                  <NavLink
                    to={path}
                    end={path === "/"}
                    onClick={onNavigate}
                    title={collapsed ? label : undefined}
                    aria-label={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500",
                        collapsed && "justify-center px-0",
                        isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-brand-500" aria-hidden />}
                        <Icon className={cn("size-4 shrink-0", isActive ? "text-brand-300" : "text-slate-500 group-hover:text-slate-300")} aria-hidden />
                        {!collapsed && label}
                        {badge && (
                          <span
                            className={cn(
                              "rounded-full bg-red-500 text-xs font-semibold text-white",
                              collapsed ? "absolute right-1 top-1 size-2" : "ml-auto px-2 py-0.5",
                            )}
                            data-testid="nav-alerts-count"
                          >
                            {!collapsed && (unseen > 99 ? "99+" : unseen)}
                            <span className="sr-only"> {unseen} {unseen === 1 ? "alerta não visto" : "alertas não vistos"}</span>
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Nome da aba do navegador conforme a página ("Clientes · Backstage Flow"). */
function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = EXTRA_TITLES[pathname] ?? navItemForPath(pathname)?.label;
    document.title = page ? `${page} · ${APP_NAME}` : APP_NAME;
  }, [pathname]);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = usePersistentState("menu-recolhido", false);
  const displayName = profile?.full_name || profile?.email || "";
  const section = EXTRA_TITLES[pathname] ?? navItemForPath(pathname)?.label;
  useDocumentTitle();

  // Esc fecha o menu do celular.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-full">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg">
        Pular para o conteúdo
      </a>

      {/* Sidebar fixa no desktop (pode ser recolhida) */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-slate-900 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
        data-testid="sidebar"
        data-collapsed={collapsed}
      >
        <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-6")}>
          <Logo inverted compact={collapsed} />
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white",
              "focus-visible:outline-2 focus-visible:outline-brand-500",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : undefined}
          >
            {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <><ChevronsLeft className="size-4" aria-hidden /> Recolher menu</>}
          </button>
        </div>
      </aside>

      {/* Sidebar em gaveta no celular/tablet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-slate-900 shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between px-6">
              <Logo inverted />
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1 text-slate-300 hover:bg-white/10" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button className="-ml-1 rounded-lg p-1 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu className="size-6" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-500" data-testid="header-section">{section}</p>
          {can(profile?.role, "internal.view") && <GlobalSearch />}
          <Link to="/minha-conta" className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-slate-100" title="Minha conta">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700" aria-hidden>
              {initials(displayName)}
            </span>
            <span className="hidden text-right sm:block">
              <span className="block max-w-48 truncate text-sm font-medium leading-tight text-slate-900">{displayName}</span>
              <span className="block text-xs text-slate-500">{profile && ROLE_LABELS[profile.role]}</span>
            </span>
            <span className="sr-only sm:hidden">Minha conta</span>
          </Link>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sair</span>
            <span className="sr-only sm:hidden">Sair</span>
          </button>
        </header>

        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<FullPageSpinner label="Abrindo a página..." />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
}
