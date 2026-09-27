import { daysInRange, isValidRange, normalizeReportSettings, REPORT_PERIODS, type ReportPeriod } from "@backstage/shared";
import { Link2Off } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Logo } from "@/components/layout/Logo.tsx";
import { Card } from "@/components/ui/card.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { logoPublicUrl, type PublicQuery, usePublicReport } from "./api.ts";
import { MAX_REPORT_DAYS, type PeriodChoice } from "./logic.ts";
import { periodUpdaters, ReportView } from "./ReportView.tsx";

/** Lê o período do endereço; o banco resolve as datas no fuso do cliente. */
function queryFromParams(params: URLSearchParams): { q: PublicQuery; invalid: string | null } {
  const p = params.get("periodo");
  if (p === "custom") {
    const range = { from: params.get("de") ?? "", to: params.get("ate") ?? "" };
    if (!isValidRange(range)) return { q: {}, invalid: "Datas inválidas: mostrando o período padrão." };
    if (daysInRange(range) > MAX_REPORT_DAYS) return { q: {}, invalid: `Escolha no máximo ${MAX_REPORT_DAYS} dias.` };
    return { q: range, invalid: null };
  }
  return { q: (REPORT_PERIODS as readonly string[]).includes(p ?? "") ? { period: p! } : {}, invalid: null };
}

/**
 * Dashboard pelo link secreto (Etapa 19.2): abre sem login, só com o código
 * do endereço. Funciona enquanto o link estiver ligado e dentro da validade.
 */
export function PublicReportPage() {
  const { token } = useParams();
  const [params, update] = useSearchParamsUpdater();
  const { q, invalid } = useMemo(() => queryFromParams(params), [params]);
  const report = usePublicReport(token, q);

  // Não aparecer em buscadores.
  useEffect(() => {
    document.head.insertAdjacentHTML("beforeend", '<meta name="robots" content="noindex, nofollow" id="robots-noindex">');
    return () => document.getElementById("robots-noindex")?.remove();
  }, []);

  const data = report.data;
  const settings = useMemo(() => normalizeReportSettings(data?.settings ?? null, data?.client.name ?? ""), [data]);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <span className="text-xs text-slate-500">Relatório online · sempre atualizado</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8 print:max-w-none print:p-0">
        {!data && report.isLoading ? (
          <FullPageSpinner label="Abrindo o relatório..." />
        ) : !data ? (
          <Card className="mx-auto max-w-md space-y-3 p-6 text-center" data-testid="public-report-error">
            <Link2Off className="mx-auto size-8 text-slate-400" aria-hidden />
            <p className="font-medium text-slate-900">Não foi possível abrir este relatório</p>
            <p className="text-sm text-slate-600">{errorMessage(report.error)}</p>
          </Card>
        ) : (
          <ReportView
            clientName={data.client.name}
            today={data.today}
            settings={settings}
            logoUrl={logoPublicUrl(data.settings?.logo_path)}
            period={{ choice: data.period as PeriodChoice, range: { from: data.from, to: data.to }, invalid }}
            {...periodUpdaters(update, settings.default_period as ReportPeriod)}
            accounts={data.accounts}
            daily={data.daily}
            campaigns={data.campaigns}
            breakdowns={data.breakdowns}
            coverage={data.breakdown_coverage}
            loading={false}
            fetching={report.isFetching}
            error={report.error}
            noAccountsText="Ainda não há contas de anúncio neste relatório."
          />
        )}
      </main>
    </div>
  );
}
