import type { DateRange } from "@backstage/shared";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { reportCsvRows, reportXlsx } from "@/features/reports/export.ts";
import { downloadBlob, downloadCsv } from "@/lib/download.ts";
import { useRiResults } from "./api.ts";
import { type ExportProfile, RESULTS_SHEETS, resultsFileName, resultsReport } from "./export.ts";

/**
 * Etapa 39.5 — baixar os números da aba em CSV ou Excel (Resumo, Campanhas, Conjuntos, Anúncios).
 * Gerado no navegador com os mesmos números da tela; sem telefone, e-mail ou nome.
 */
export function ExportBar({ clientId, clientName, range, profile, label }: {
  clientId: string; clientName: string; range: DateRange; profile: ExportProfile; label: string;
}) {
  const camps = useRiResults(clientId, range, "campaign");
  const sets = useRiResults(clientId, range, "ad_group");
  const ads = useRiResults(clientId, range, "ad");
  const ready = camps.data && sets.data && ads.data;
  const build = () => resultsReport({ clientName, range, profile, campaigns: camps.data!, adGroups: sets.data!, ads: ads.data!, generatedAt: new Date() });

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="ri-export">
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">Exportar {label}</span> — campanhas, conjuntos e anúncios do período, sem dados pessoais.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={!ready} onClick={() => downloadCsv(resultsFileName(clientName, profile, range, "csv"), reportCsvRows(build()))}>
          <Download className="size-4" aria-hidden /> CSV
        </Button>
        <Button type="button" variant="secondary" disabled={!ready} onClick={() => downloadBlob(resultsFileName(clientName, profile, range, "xlsx"),
          new Blob([reportXlsx(build(), RESULTS_SHEETS) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))}>
          <Download className="size-4" aria-hidden /> Excel
        </Button>
      </div>
    </Card>
  );
}
