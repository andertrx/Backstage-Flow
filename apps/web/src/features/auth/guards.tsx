import type { Permission } from "@backstage/shared";
import { can } from "@backstage/shared";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { useAuth } from "./AuthProvider.tsx";
import { PendingAccessPage } from "./PendingAccessPage.tsx";

/** Só deixa passar quem está logado E com perfil ativo. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile || !profile.active) return <PendingAccessPage />;
  return children;
}

/**
 * Esconde páginas de quem não tem permissão. É só conveniência de interface:
 * a proteção real está no banco (RLS) e nas Edge Functions.
 */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { profile } = useAuth();
  if (!can(profile?.role, permission)) return <Navigate to="/" replace />;
  return children;
}

/**
 * Páginas públicas (login etc.): quem já está logado vai direto para o sistema,
 * voltando para a página que tentou abrir antes do login (se houver).
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }
  return children;
}
