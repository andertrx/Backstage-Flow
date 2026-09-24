import { createBrowserRouter, Navigate } from "react-router";
import { ComingSoon } from "@/components/feedback/ComingSoon.tsx";
import { AppLayout } from "@/components/layout/AppLayout.tsx";
import { NAV_ITEMS } from "@/components/layout/navigation.ts";
import { AccountPage } from "@/features/account/AccountPage.tsx";
import { ClientDetailPage } from "@/features/clients/ClientDetailPage.tsx";
import { ClientsPage } from "@/features/clients/ClientsPage.tsx";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage.tsx";
import { RedirectIfAuthenticated, RequireAuth, RequirePermission } from "@/features/auth/guards.tsx";
import { LoginPage } from "@/features/auth/LoginPage.tsx";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage.tsx";
import { ComparisonPage } from "@/features/comparison/ComparisonPage.tsx";
import { CampaignsPage } from "@/features/campaigns/CampaignsPage.tsx";
import { PlatformPage } from "@/features/platforms/PlatformPage.tsx";
import { PLATFORM_VIEWS } from "@/features/platforms/logic.ts";
import { EntityDetailPage } from "@/features/structure/EntityDetailPage.tsx";
import { DashboardPage } from "@/features/dashboard/DashboardPage.tsx";
import { AccountsHealthPage } from "@/features/health/AccountsHealthPage.tsx";
import { GoogleCallbackPage } from "@/features/integrations/GoogleCallbackPage.tsx";
import { IntegrationsPage } from "@/features/integrations/IntegrationsPage.tsx";
import { SettingsLayout } from "@/features/settings/SettingsLayout.tsx";
import { UsersPage } from "@/features/users/UsersPage.tsx";

/** Páginas das próximas etapas, geradas a partir do menu. */
const upcomingRoutes = NAV_ITEMS.filter((item) => item.step > 0).map((item) => ({
  path: item.path.slice(1),
  element: item.permission ? (
    <RequirePermission permission={item.permission}>
      <ComingSoon title={item.label} step={item.step} />
    </RequirePermission>
  ) : (
    <ComingSoon title={item.label} step={item.step} />
  ),
}));

export const router = createBrowserRouter([
  { path: "/login", element: <RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated> },
  { path: "/recuperar-senha", element: <RedirectIfAuthenticated><ForgotPasswordPage /></RedirectIfAuthenticated> },
  { path: "/redefinir-senha", element: <ResetPasswordPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "comparar", element: <ComparisonPage /> },
      { path: "minha-conta", element: <AccountPage /> },
      {
        path: "clientes",
        element: (
          <RequirePermission permission="clients.view">
            <ClientsPage />
          </RequirePermission>
        ),
      },
      {
        path: "clientes/:id",
        element: (
          <RequirePermission permission="clients.view">
            <ClientDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: "campanhas",
        element: (
          <RequirePermission permission="internal.view">
            <CampaignsPage />
          </RequirePermission>
        ),
      },
      ...(["campaign", "ad_group", "ad"] as const).map((level) => ({
        path: `${{ campaign: "campanhas", ad_group: "conjuntos", ad: "anuncios" }[level]}/:id`,
        element: (
          <RequirePermission permission="internal.view">
            <EntityDetailPage key={level} level={level} />
          </RequirePermission>
        ),
      })),
      {
        path: "meta-ads",
        element: (
          <RequirePermission permission="internal.view">
            <PlatformPage view={PLATFORM_VIEWS.meta} />
          </RequirePermission>
        ),
      },
      {
        path: "contas",
        element: (
          <RequirePermission permission="internal.view">
            <AccountsHealthPage />
          </RequirePermission>
        ),
      },
      {
        path: "configuracoes",
        element: (
          <RequirePermission permission="settings.manage">
            <SettingsLayout />
          </RequirePermission>
        ),
        children: [
          { index: true, element: <Navigate to="/configuracoes/usuarios" replace /> },
          { path: "usuarios", element: <UsersPage /> },
          { path: "integracoes", element: <IntegrationsPage /> },
          { path: "integracoes/google/callback", element: <GoogleCallbackPage /> },
        ],
      },
      ...upcomingRoutes,
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
