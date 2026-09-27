import { addDays, type BreakdownRow, type ClientReportSettings, PERIOD_LABELS, REPORT_PERIODS, type ReportPeriod } from "@backstage/shared";
import { FileDown } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/field.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { AccountReport } from "./AccountReport.tsx";
import type { BreakdownCoverage, ReportAccount, ReportCampaignRow, ReportDailyRow } from "./api.ts";
import { daysOf, MAX_REPORT_DAYS, pdfTitle, rangeText, type ReportPeriodState } from "./logic.ts";

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

export interface ReportViewProps {
  clientName: string;
  /** "Hoje" no fuso do cliente (as datas livres vão até ontem). */
  today: string;
  settings: ClientReportSettings;
  /** Logo do cliente (Etapa 19.4); null = sem logo. */
  logoUrl?: string | null;
  period: ReportPeriodState;
  onPeriod: (p: ReportPeriod) => void;
  onCustom: (from: string, to: string) => void;
  accounts: ReportAccount[];
  daily: ReportDailyRow[];
  campaigns: ReportCampaignRow[];
  breakdowns: BreakdownRow[];
  coverage: BreakdownCoverage[];
  loading: boolean;
  fetching: boolean;
  error: unknown;
  /** Link de volta (equipe) e botões extras (Personalizar). */
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  noAccountsText: string;
}

/**
 * O dashboard do cliente (Etapa 19): mesmo desenho para a equipe, para o
 * cliente logado e para o link secreto. Uma seção por conta de anúncio
 * (moedas nunca somadas). "Baixar PDF" usa a impressão do navegador (A4).
 */
export function ReportView(p: ReportViewProps) {
  const { settings, period } = p;
  const days = useMemo(() => daysOf(period.range), [period.range]);
  const [customFrom, setCustomFrom] = useState(period.range.from);
  const [customTo, setCustomTo] = useState(period.range.to);
  useEffect(() => { setCustomFrom(period.range.from); setCustomTo(period.range.to); }, [period.range.from, period.range.to]);

  // Nome do arquivo ao "salvar como PDF" = título da página durante a impressão.
  useEffect(() => {
    const original = document.title;
    const title = pdfTitle(p.clientName, period.range);
    const before = () => { document.title = title; };
    const after = () => { document.title = original; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, [p.clientName, period.range]);

  const withData = p.accounts.filter((a) => a.cur);
  const withoutData = p.accounts.filter((a) => !a.cur);
  const lastSync = p.accounts.map((a) => a.last_synced_at).filter(Boolean).sort().at(-1) ?? null;
  const notes = settings.sections.notes && (settings.agency_notes || settings.next_steps);
  const yesterday = addDays(p.today, -1);

  return (
    <div className="pdf-width space-y-6" data-testid="client-report">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>{p.toolbarStart}</div>
        <div className="flex flex-wrap gap-2">
          {p.toolbarEnd}
          <Button onClick={printPdf} disabled={p.loading}>
            <FileDown className="size-4" aria-hidden /> Baixar PDF
          </Button>
        </div>
      </div>

      <header className="space-y-1">
        {p.logoUrl && (
          <img src={p.logoUrl} alt={`Logo ${p.clientName}`} data-testid="report-logo"
            className="mb-3 h-12 w-auto max-w-[220px] object-contain object-left" />
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="report-title">{settings.title}</h1>
        {settings.subtitle && <p className="text-slate-600">{settings.subtitle}</p>}
        <p className="text-sm text-slate-500" data-testid="report-period">
          {period.choice === "custom" ? "Período personalizado" : PERIOD_LABELS[period.choice]}: {rangeText(period.range)}
          {lastSync && <> · dados atualizados em {formatDateTime(lastSync)}</>}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Período">
        {REPORT_PERIODS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={period.choice === r}
            onClick={() => p.onPeriod(r)}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset",
              period.choice === r ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}
          >
            {PERIOD_LABELS[r]}
          </button>
        ))}
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
          <Input type="date" aria-label="De" className="w-auto" value={customFrom} max={yesterday} onChange={(e) => setCustomFrom(e.target.value)} />
          até
          <Input type="date" aria-label="Até" className="w-auto" value={customTo} max={yesterday} onChange={(e) => setCustomTo(e.target.value)} />
          <Button variant={period.choice === "custom" ? "primary" : "secondary"} onClick={() => p.onCustom(customFrom, customTo)} disabled={!customFrom || !customTo}>
            Ver período
          </Button>
        </span>
      </div>
      {period.invalid && <Alert tone="warning">{period.invalid}</Alert>}

      {p.error ? <Alert tone="error">{errorMessage(p.error)}</Alert> : null}
      {p.loading ? (
        <div className="space-y-3" aria-label="Carregando">
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}</div>
        </div>
      ) : p.accounts.length === 0 ? (
        !p.error && <Card className="p-6 text-sm text-slate-600" data-testid="report-no-accounts">{p.noAccountsText}</Card>
      ) : (
        <div className={cn("space-y-10", p.fetching && "opacity-70")}>
          {withData.map((a) => (
            <AccountReport
              key={a.ad_account_id}
              account={a}
              daily={p.daily.filter((r) => r.ad_account_id === a.ad_account_id)}
              campaigns={p.campaigns.filter((r) => r.ad_account_id === a.ad_account_id)}
              settings={settings}
              days={days}
              breakdowns={p.breakdowns.filter((r) => r.ad_account_id === a.ad_account_id)}
              coverage={p.coverage.find((c) => c.ad_account_id === a.ad_account_id) ?? null}
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
        Números informados pelas próprias plataformas de anúncios, no fuso do cliente. Moedas diferentes nunca são somadas.
        Períodos de até {MAX_REPORT_DAYS} dias.
      </p>
    </div>
  );
}

/** Mesma regra de endereço para as três telas: ?periodo=… ou ?periodo=custom&de=&ate=. */
export function periodUpdaters(update: (fn: (latest: URLSearchParams) => URLSearchParams) => void, defaultPeriod: ReportPeriod) {
  return {
    onPeriod: (r: ReportPeriod) => update((latest) => {
      latest.delete("de"); latest.delete("ate");
      if (r === defaultPeriod) latest.delete("periodo"); else latest.set("periodo", r);
      return latest;
    }),
    onCustom: (from: string, to: string) => update((latest) => {
      latest.set("periodo", "custom"); latest.set("de", from); latest.set("ate", to);
      return latest;
    }),
  };
}
