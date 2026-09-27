import { can, normalizeReportSettings, todayIn } from "@backstage/shared";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClient } from "@/features/clients/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { logoPublicUrl, useReportAccounts, useReportBreakdowns, useReportCampaigns, useReportDaily, useReportSettings } from "./api.ts";
import { reportPeriodFromParams } from "./logic.ts";
import { ReportSettingsModal } from "./ReportSettingsModal.tsx";
import { periodUpdaters, ReportView } from "./ReportView.tsx";

/**
 * Dashboard do cliente para quem está logado: a equipe (com "Personalizar"
 * para admin e gestor) e o próprio cliente (papel "cliente", Etapa 19.2).
 * O banco só devolve dados de clientes liberados (e, para o papel cliente,
 * só com o login ligado).
 */
export function ClientReportPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const client = useClient(id);
  const settingsRow = useReportSettings(id);
  const [params, update] = useSearchParamsUpdater();
  const [editing, setEditing] = useState(false);

  const timezone = client.data?.timezone ?? "America/Sao_Paulo";
  const settings = useMemo(() => normalizeReportSettings(settingsRow.data, client.data?.name ?? ""), [settingsRow.data, client.data?.name]);
  const period = useMemo(() => reportPeriodFromParams(params, settings.default_period, timezone), [params, settings.default_period, timezone]);
  const ready = Boolean(client.data) && !settingsRow.isLoading;

  const accounts = useReportAccounts(ready ? id : undefined, period.range);
  const daily = useReportDaily(ready ? id : undefined, period.range);
  const campaigns = useReportCampaigns(ready ? id : undefined, period.range);
  const breakdowns = useReportBreakdowns(ready && settings.sections.breakdowns ? id : undefined, period.range);

  if (client.isLoading || settingsRow.isLoading) return <FullPageSpinner />;
  if (client.error) return <Alert tone="error">{errorMessage(client.error)}</Alert>;
  if (!client.data) return <Alert tone="error">Cliente não encontrado ou você não tem acesso a ele.</Alert>;

  const staff = can(profile?.role, "clients.view");
  const canEdit = can(profile?.role, "clients.edit");

  return (
    <>
      <ReportView
        clientName={client.data.name}
        today={todayIn(timezone)}
        settings={settings}
        logoUrl={logoPublicUrl(settingsRow.data?.logo_path)}
        period={period}
        {...periodUpdaters(update, settings.default_period)}
        accounts={accounts.data ?? []}
        daily={daily.data ?? []}
        campaigns={campaigns.data ?? []}
        breakdowns={breakdowns.data?.rows ?? []}
        coverage={breakdowns.data?.coverage ?? []}
        loading={accounts.isLoading || daily.isLoading || campaigns.isLoading || breakdowns.isLoading}
        fetching={accounts.isFetching}
        error={accounts.error ?? daily.error ?? campaigns.error ?? breakdowns.error}
        noAccountsText={staff ? "Nenhuma conta de anúncio vinculada a este cliente. Vincule as contas na página do cliente." : "Ainda não há contas de anúncio neste painel."}
        toolbarStart={staff && (
          <Link to={`/clientes/${client.data.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" aria-hidden /> {client.data.name}
          </Link>
        )}
        toolbarEnd={canEdit && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <SlidersHorizontal className="size-4" aria-hidden /> Personalizar
          </Button>
        )}
      />
      {editing && (
        <ReportSettingsModal clientId={client.data.id} clientName={client.data.name} timezone={timezone} initial={settings}
          logoPath={settingsRow.data?.logo_path ?? null} hasRow={Boolean(settingsRow.data)} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
