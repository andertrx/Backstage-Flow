import { DEFAULT_TIMEZONE, ENTITY_STATUS_LABELS, type EntityStatus, PLATFORM_LABELS } from "@backstage/shared";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useClients } from "@/features/clients/api.ts";
import { useDashboardSummary, useDashboardTimeseries, useFilterAccounts, useFilterCampaigns } from "@/features/dashboard/api.ts";
import { FiltersBar } from "@/features/dashboard/FiltersBar.tsx";
import { PERIOD_OPTIONS, resolveFilterPeriod } from "@/features/dashboard/filters.ts";
import { useDashboardFilters } from "@/features/dashboard/useDashboardFilters.ts";
import { downloadBlob, downloadCsv } from "@/lib/download.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate } from "@/lib/format.ts";
import { MAX_CAMPAIGNS, useReportCampaigns } from "./api.ts";
import { reportCsvRows, reportPdf, reportXlsx } from "./export.ts";
import { buildReport, EMPTY_NOTE, formatCell, reportFileName, type ReportTable } from "./model.ts";
import { DataFreshness } from "@/features/sync/DataFreshness.tsx";

/** Linhas mostradas na tela por tabela (o arquivo baixado tem todas). */
const PREVIEW_ROWS = 15;
const dates = (r: { from: string; to: string }) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} a ${formatDate(r.to)}`);

export function ReportsPage() {
  const { filters, setFilters, clear } = useDashboardFilters();
  const { data: clients = [] } = useClients();
  const { data: accounts = [] } = useFilterAccounts();
  const { data: campaignOptions = [] } = useFilterCampaigns(filters.clientId, filters.accountId, filters.platform);
  const timezone = clients.find((c) => c.id === filters.clientId)?.timezone ?? DEFAULT_TIMEZONE;
  const period = useMemo(() => resolveFilterPeriod(filters, timezone), [filters, timezone]);

  const summary = useDashboardSummary(period.current, period.previous, filters);
  const daily = useDashboardTimeseries(period.current, filters, "day", false);
  const campaigns = useReportCampaigns(period.current, filters);
  const loading = summary.isLoading || daily.isLoading || campaigns.isLoading;
  const error = summary.error ?? daily.error ?? campaigns.error;
  const [exporting, setExporting] = useState<"pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const clientName = clients.find((c) => c.id === filters.clientId)?.name ?? null;
  const accountName = accounts.find((a) => a.id === filters.accountId)?.name ?? null;
  const campaignName = campaignOptions.find((c) => c.id === filters.campaignId)?.name ?? null;
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === filters.period)?.label ?? "";

  const report = useMemo(() => {
    if (!summary.data || !daily.data || !campaigns.data) return null;
    return buildReport({
      filters: [
        `Cliente: ${clientName ?? "Todos os clientes"}`,
        `Plataforma: ${filters.platform ? PLATFORM_LABELS[filters.platform] ?? filters.platform : "Todas"}`,
        ...(accountName ? [`Conta: ${accountName}`] : []),
        `Campanha: ${campaignName ?? "Todas"}${filters.status ? ` (status: ${ENTITY_STATUS_LABELS[filters.status as EntityStatus] ?? filters.status})` : ""}`,
        `Período: ${dates(period.current)} (${periodLabel}) · comparado com ${dates(period.previous)}`,
      ],
      summary: summary.data,
      campaigns: campaigns.data,
      daily: daily.data,
    });
  }, [summary.data, daily.data, campaigns.data, clientName, accountName, campaignName, filters.platform, filters.status, period, periodLabel]);

  const baseName = [clientName ?? "todos-os-clientes", filters.platform, campaignName, period.current.from, "a", period.current.to];
  const empty = report !== null && report.tables.length === 0;
  const disabled = !report || empty || loading;

  async function exportPdf() {
    if (!report) return;
    setExportError(null);
    setExporting("pdf");
    try {
      downloadBlob(reportFileName(baseName, "pdf"), await reportPdf(report));
    } catch (err) {
      console.error("[relatorio] pdf", err);
      setExportError("Não conseguimos gerar o PDF. Tente de novo ou use o Excel.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="mt-1 text-sm text-slate-500">
          Escolha cliente, plataforma, período e campanha. Confira a prévia e baixe em CSV, Excel ou PDF.
        </p>
      </div>

      <FiltersBar filters={filters} period={period} clients={clients} onChange={setFilters} onClear={clear} />
      <DataFreshness clientId={filters.clientId} platform={filters.platform} accountId={filters.accountId} />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="report-actions">
        <div className="text-sm text-slate-600">
          <p className="font-medium text-slate-900">Baixar relatório</p>
          <p>Resumo com comparação, campanhas e dia a dia. {report && !empty ? "Tudo em um arquivo." : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={disabled} onClick={() => report && downloadCsv(reportFileName(baseName, "csv"), reportCsvRows(report))}>
            <FileText className="size-4" aria-hidden /> CSV
          </Button>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() =>
              report &&
              downloadBlob(reportFileName(baseName, "xlsx"), new Blob([reportXlsx(report) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
            }
          >
            <FileSpreadsheet className="size-4" aria-hidden /> Excel
          </Button>
          <Button disabled={disabled} loading={exporting === "pdf"} onClick={exportPdf}>
            {exporting !== "pdf" && <FileDown className="size-4" aria-hidden />} PDF
          </Button>
        </div>
      </Card>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {exportError && <Alert tone="error">{exportError}</Alert>}
      {campaigns.data && campaigns.data.length >= MAX_CAMPAIGNS && (
        <Alert tone="warning">O relatório mostra as {MAX_CAMPAIGNS.toLocaleString("pt-BR")} campanhas que mais investiram. Use os filtros para ver as demais.</Alert>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : empty ? (
        <Card className="p-10 text-center" data-testid="report-empty">
          <p className="font-medium text-slate-900">Sem dados para estes filtros no período.</p>
          <p className="mt-1 text-sm text-slate-500">Mude o período ou os filtros. Nada é inventado: sem dados, não há relatório.</p>
        </Card>
      ) : report ? (
        <section className="space-y-5" aria-label="Prévia do relatório" data-testid="report-preview">
          <div className="text-xs text-slate-500">
            {report.filters.map((f) => <p key={f}>{f}</p>)}
          </div>
          {report.tables.map((t) => <PreviewTable key={t.title} table={t} />)}
          <p className="text-xs text-slate-500">{EMPTY_NOTE}</p>
        </section>
      ) : null}
    </div>
  );
}

function PreviewTable({ table: t }: { table: ReportTable }) {
  const rows = t.rows.slice(0, PREVIEW_ROWS);
  return (
    <div className="space-y-2" data-testid="report-table" data-title={t.title}>
      <h2 className="text-base font-semibold">{t.title}</h2>
      <Card className="relative overflow-x-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              {t.columns.map((c, i) => (
                <th key={c} scope="col" className={i === 0 || t.rows[0]?.[i]?.format === "text" ? "px-3 py-2 font-medium" : "px-3 py-2 text-right font-medium"}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, i) => (
                  <td key={i} className={t.rows[0]?.[i]?.format === "text" ? "max-w-72 truncate px-3 py-1.5 text-slate-800" : "whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-700"}>
                    {formatCell(c, t.currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {t.rows.length > PREVIEW_ROWS && (
        <p className="text-xs text-slate-500">Mostrando {PREVIEW_ROWS} de {t.rows.length} linhas. O arquivo baixado tem todas.</p>
      )}
    </div>
  );
}
