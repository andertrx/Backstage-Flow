import { lazy, Suspense } from "react";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout.tsx";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage.tsx";
import { RedirectIfAuthenticated, RequireAuth, RequirePermission } from "@/features/auth/guards.tsx";
import { LoginPage } from "@/features/auth/LoginPage.tsx";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage.tsx";
import { PLATFORM_VIEW_LIST } from "@/features/platforms/logic.ts";
import { SettingsLayout } from "@/features/settings/SettingsLayout.tsx";
import { ClientHomeOr, RequireReportAccess } from "@/features/client-report/ClientHome.tsx";
import { RouteError } from "./RouteError.tsx";

/** Cada página só é baixada quando for aberta (o site abre mais rápido). */
const AccountPage = lazy(() => import("@/features/account/AccountPage.tsx").then((m) => ({ default: m.AccountPage })));
const ClientDetailPage = lazy(() => import("@/features/clients/ClientDetailPage.tsx").then((m) => ({ default: m.ClientDetailPage })));
const ClientReportPage = lazy(() => import("@/features/client-report/ClientReportPage.tsx").then((m) => ({ default: m.ClientReportPage })));
const PublicReportPage = lazy(() => import("@/features/client-report/PublicReportPage.tsx").then((m) => ({ default: m.PublicReportPage })));
const ClientsPage = lazy(() => import("@/features/clients/ClientsPage.tsx").then((m) => ({ default: m.ClientsPage })));
const ExecutivePage = lazy(() => import("@/features/executive/ExecutivePage.tsx").then((m) => ({ default: m.ExecutivePage })));
const ComparisonPage = lazy(() => import("@/features/comparison/ComparisonPage.tsx").then((m) => ({ default: m.ComparisonPage })));
const AlertsPage = lazy(() => import("@/features/alerts/AlertsPage.tsx").then((m) => ({ default: m.AlertsPage })));
const TrackingPage = lazy(() => import("@/features/tracking/TrackingPage.tsx").then((m) => ({ default: m.TrackingPage })));
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
const HistoryPage = lazy(() => import("@/features/history/HistoryPage.tsx").then((m) => ({ default: m.HistoryPage })));
const UsersPage = lazy(() => import("@/features/users/UsersPage.tsx").then((m) => ({ default: m.UsersPage })));

export const router = createBrowserRouter([
  { path: "/login", errorElement: <RouteError />, element: <RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated> },
  { path: "/recuperar-senha", errorElement: <RouteError />, element: <RedirectIfAuthenticated><ForgotPasswordPage /></RedirectIfAuthenticated> },
  { path: "/redefinir-senha", errorElement: <RouteError />, element: <ResetPasswordPage /> },
  // Etapa 19.2: dashboard pelo link secreto (sem login).
  {
    path: "/r/:token",
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<FullPageSpinner label="Abrindo o relatório..." />}>
        <PublicReportPage />
      </Suspense>
    ),
  },
  {
    path: "/",
    errorElement: <RouteError />,
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <ClientHomeOr><DashboardPage /></ClientHomeOr> },
      { path: "comparar", element: <RequirePermission permission="internal.view"><ComparisonPage /></RequirePermission> },
      { path: "executivo", element: <RequirePermission permission="internal.view"><ExecutivePage /></RequirePermission> },
      {
        path: "historico",
        element: (
          <RequirePermission permission="internal.view">
            <HistoryPage />
          </RequirePermission>
        ),
      },
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
        path: "clientes/:id/dashboard",
        element: (
          <RequireReportAccess>
            <ClientReportPage />
          </RequireReportAccess>
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
      // Uma tela por plataforma do catálogo (Meta Ads, Google Ads...).
      ...PLATFORM_VIEW_LIST.map((view) => ({
        path: view.path.slice(1),
        element: (
          <RequirePermission permission="internal.view">
            <PlatformPage key={view.id} view={view} />
          </RequirePermission>
        ),
      })),
      {
        path: "alertas",
        element: (
          <RequirePermission permission="internal.view">
            <AlertsPage />
          </RequirePermission>
        ),
      },
      {
        path: "tracking",
        element: (
          <RequirePermission permission="tracking.view">
            <TrackingPage />
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
