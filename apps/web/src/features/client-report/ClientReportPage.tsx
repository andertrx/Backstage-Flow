import { can, normalizeReportSettings, PERIOD_LABELS, REPORT_PERIODS, todayIn, addDays } from "@backstage/shared";
import { ArrowLeft, FileDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClient } from "@/features/clients/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { AccountReport } from "./AccountReport.tsx";
import { useReportAccounts, useReportCampaigns, useReportDaily, useReportSettings } from "./api.ts";
import { daysOf, MAX_REPORT_DAYS, pdfTitle, rangeText, reportPeriodFromParams } from "./logic.ts";
import { ReportSettingsModal } from "./ReportSettingsModal.tsx";

/**
 * Dashboard do cliente (Etapa 19): abre sempre nos últimos 7 dias (ou no
 * período padrão do modelo), uma seção por conta de anúncio (moedas nunca
 * somadas), com as métricas escolhidas para o cliente. "Baixar PDF" usa a
 * impressão do navegador (A4), sem o menu.
 */
/**
 * Antes de imprimir, redesenha a página na largura da folha A4 (os gráficos
 * medem a largura na tela; sem isso sairiam encolhidos, com letras miúdas).
 */
async function printPdf() {
  document.documentElement.classList.add("pdf-mode");
  await new Promise((r) => setTimeout(r, 350));
  try {
    window.print();
  } finally {
    document.documentElement.classList.remove("pdf-mode");
  }
}

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
  const days = useMemo(() => daysOf(period.range), [period.range]);
  const ready = Boolean(client.data) && !settingsRow.isLoading;

  const accounts = useReportAccounts(ready ? id : undefined, period.range);
  const daily = useReportDaily(ready ? id : undefined, period.range);
  const campaigns = useReportCampaigns(ready ? id : undefined, period.range);

  const [customFrom, setCustomFrom] = useState(period.range.from);
  const [customTo, setCustomTo] = useState(period.range.to);
  useEffect(() => { setCustomFrom(period.range.from); setCustomTo(period.range.to); }, [period.range.from, period.range.to]);

  // Nome do arquivo ao "salvar como PDF" = título da página durante a impressão.
  useEffect(() => {
    if (!client.data) return;
    const original = document.title;
    const title = pdfTitle(client.data.name, period.range);
    const before = () => { document.title = title; };
    const after = () => { document.title = original; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, [client.data, period.range]);

  if (client.isLoading || settingsRow.isLoading) return <FullPageSpinner />;
  if (client.error) return <Alert tone="error">{errorMessage(client.error)}</Alert>;
  if (!client.data) return <Alert tone="error">Cliente não encontrado ou você não tem acesso a ele.</Alert>;

  const setPeriod = (p: string) => update((latest) => {
    latest.delete("de"); latest.delete("ate");
    if (p === settings.default_period) latest.delete("periodo"); else latest.set("periodo", p);
    return latest;
  });
  const applyCustom = () => update((latest) => {
    latest.set("periodo", "custom"); latest.set("de", customFrom); latest.set("ate", customTo);
    return latest;
  });

  const list = accounts.data ?? [];
  const withData = list.filter((a) => a.cur);
  const withoutData = list.filter((a) => !a.cur);
  const lastSync = list.map((a) => a.last_synced_at).filter(Boolean).sort().at(-1) ?? null;
  const loading = accounts.isLoading || daily.isLoading || campaigns.isLoading;
  const error = accounts.error ?? daily.error ?? campaigns.error;
  const notes = settings.sections.notes && (settings.agency_notes || settings.next_steps);
  const canEdit = can(profile?.role, "clients.edit");
  const yesterday = addDays(todayIn(timezone), -1);

  return (
    <div className="pdf-width space-y-6" data-testid="client-report">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/clientes/${client.data.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" aria-hidden /> {client.data.name}
        </Link>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <SlidersHorizontal className="size-4" aria-hidden /> Personalizar
            </Button>
          )}
          <Button onClick={printPdf} disabled={loading}>
            <FileDown className="size-4" aria-hidden /> Baixar PDF
          </Button>
        </div>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="report-title">{settings.title}</h1>
        {settings.subtitle && <p className="text-slate-600">{settings.subtitle}</p>}
        <p className="text-sm text-slate-500" data-testid="report-period">
          {period.choice === "custom" ? "Período personalizado" : PERIOD_LABELS[period.choice]}: {rangeText(period.range)}
          {lastSync && <> · dados atualizados em {formatDateTime(lastSync)}</>}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Período">
        {REPORT_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period.choice === p}
            onClick={() => setPeriod(p)}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset",
              period.choice === p ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
          <Input type="date" aria-label="De" className="w-auto" value={customFrom} max={yesterday} onChange={(e) => setCustomFrom(e.target.value)} />
          até
          <Input type="date" aria-label="Até" className="w-auto" value={customTo} max={yesterday} onChange={(e) => setCustomTo(e.target.value)} />
          <Button variant={period.choice === "custom" ? "primary" : "secondary"} onClick={applyCustom} disabled={!customFrom || !customTo}>
            Ver período
          </Button>
        </span>
      </div>
      {period.invalid && <Alert tone="warning">{period.invalid}</Alert>}

      {error ? <Alert tone="error">{errorMessage(error)}</Alert> : null}
      {loading ? (
        <div className="space-y-3" aria-label="Carregando">
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}</div>
        </div>
      ) : list.length === 0 ? (
        <Card className="p-6 text-sm text-slate-600" data-testid="report-no-accounts">
          Nenhuma conta de anúncio vinculada a este cliente. Vincule as contas na página do cliente.
        </Card>
      ) : (
        <div className={cn("space-y-10", accounts.isFetching && "opacity-70")}>
          {withData.map((a) => (
            <AccountReport
              key={a.ad_account_id}
              account={a}
              daily={(daily.data ?? []).filter((r) => r.ad_account_id === a.ad_account_id)}
              campaigns={(campaigns.data ?? []).filter((r) => r.ad_account_id === a.ad_account_id)}
              settings={settings}
              days={days}
            />
          ))}
          {withData.length === 0 && (
            <Card className="p-6 text-sm text-slate-600" data-testid="report-empty">Nenhuma conta teve dados neste período.</Card>
          )}
          {withoutData.length > 0 && withData.length > 0 && (
            <p className="text-sm text-slate-500" data-testid="report-accounts-without-data">
              Sem dados no período: {withoutData.map((a) => a.name).join(", ")}.
            </p>
          )}
        </div>
      )}

      {notes && (
        <section className="grid gap-4 md:grid-cols-2 print:grid-cols-2" aria-label="Análise da agência" data-testid="report-notes">
          {settings.agency_notes && (
            <Card className="print-avoid-break space-y-2 p-5">
              <h2 className="text-base font-semibold text-slate-900">Análise da agência</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{settings.agency_notes}</p>
            </Card>
          )}
          {settings.next_steps && (
            <Card className="print-avoid-break space-y-2 p-5">
              <h2 className="text-base font-semibold text-slate-900">Próximos passos</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{settings.next_steps}</p>
            </Card>
          )}
        </section>
      )}

      <p className="text-xs text-slate-400">
        Números informados pelas próprias plataformas (Meta Ads e Google Ads), no fuso do cliente. Moedas diferentes nunca são somadas.
        Períodos de até {MAX_REPORT_DAYS} dias.
      </p>

      {editing && (
        <ReportSettingsModal clientId={client.data.id} timezone={timezone} initial={settings} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
