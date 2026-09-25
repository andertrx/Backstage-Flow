import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout.tsx";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage.tsx";
import { RedirectIfAuthenticated, RequireAuth, RequirePermission } from "@/features/auth/guards.tsx";
import { LoginPage } from "@/features/auth/LoginPage.tsx";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage.tsx";
import { PLATFORM_VIEWS } from "@/features/platforms/logic.ts";
import { SettingsLayout } from "@/features/settings/SettingsLayout.tsx";

/** Cada página só é baixada quando for aberta (o site abre mais rápido). */
const AccountPage = lazy(() => import("@/features/account/AccountPage.tsx").then((m) => ({ default: m.AccountPage })));
const ClientDetailPage = lazy(() => import("@/features/clients/ClientDetailPage.tsx").then((m) => ({ default: m.ClientDetailPage })));
const ClientsPage = lazy(() => import("@/features/clients/ClientsPage.tsx").then((m) => ({ default: m.ClientsPage })));
const ComparisonPage = lazy(() => import("@/features/comparison/ComparisonPage.tsx").then((m) => ({ default: m.ComparisonPage })));
const AlertsPage = lazy(() => import("@/features/alerts/AlertsPage.tsx").then((m) => ({ default: m.AlertsPage })));
const SyncPage = lazy(() => import("@/features/sync/SyncPage.tsx").then((m) => ({ default: m.SyncPage })));
const LogsPage = lazy(() => import("@/features/logs/LogsPage.tsx").then((m) => ({ default: m.LogsPage })));
const ReportsPage = lazy(() => import("@/features/reports/ReportsPage.tsx").then((m) => ({ default: m.ReportsPage })));
const CampaignsPage = lazy(() => import("@/features/campaigns/CampaignsPage.tsx").then((m) => ({ default: m.CampaignsPage })));
const PlatformPage = lazy(() => import("@/features/platforms/PlatformPage.tsx").then((m) => ({ default: m.PlatformPage })));
const EntityDetailPage = lazy(() => import("@/features/structure/EntityDetailPage.tsx").then((m) => ({ default: m.EntityDetailPage })));
const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage.tsx").then((m) => ({ default: m.DashboardPage })));
const AccountsHealthPage = lazy(() => import("@/features/health/AccountsHealthPage.tsx").then((m) => ({ default: m.AccountsHealthPage })));
const GoogleCallbackPage = lazy(() => import("@/features/integrations/GoogleCallbackPage.tsx").then((m) => ({ default: m.GoogleCallbackPage })));
const IntegrationsPage = lazy(() => import("@/features/integrations/IntegrationsPage.tsx").then((m) => ({ default: m.IntegrationsPage })));
const PermissionsPage = lazy(() => import("@/features/settings/PermissionsPage.tsx").then((m) => ({ default: m.PermissionsPage })));
const UsersPage = lazy(() => import("@/features/users/UsersPage.tsx").then((m) => ({ default: m.UsersPage })));

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
            <PlatformPage key="meta" view={PLATFORM_VIEWS.meta} />
          </RequirePermission>
        ),
      },
      {
        path: "google-ads",
        element: (
          <RequirePermission permission="internal.view">
            <PlatformPage key="google" view={PLATFORM_VIEWS.google} />
          </RequirePermission>
        ),
      },
      {
        path: "alertas",
        element: (
          <RequirePermission permission="internal.view">
            <AlertsPage />
          </RequirePermission>
        ),
      },
      {
        path: "sincronizacao",
        element: (
          <RequirePermission permission="internal.view">
            <SyncPage />
          </RequirePermission>
        ),
      },
      {
        path: "relatorios",
        element: (
          <RequirePermission permission="reports.generate">
            <ReportsPage />
          </RequirePermission>
        ),
      },
      {
        path: "logs",
        element: (
          <RequirePermission permission="logs.view">
            <LogsPage />
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
          { path: "permissoes", element: <PermissionsPage /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
