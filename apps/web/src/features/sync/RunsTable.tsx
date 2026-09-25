import { PLATFORM_LABELS } from "@backstage/shared";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { formatDateTime } from "@/lib/format.ts";
import type { SyncRunRow } from "./api.ts";
import { formatDuration } from "./logic.ts";

export const RUN_TONE = { sucesso: "success", erro: "danger", executando: "brand" } as const;
export const RUN_LABEL = { sucesso: "Sucesso", erro: "Erro", executando: "Sincronizando…" } as const;
export const TRIGGER_LABEL = { agendada: "Automática", manual: "Manual", historico: "Importação do histórico" } as const;

/** Histórico de sincronizações (tela Sincronização e tela Logs). */
export function RunsTable({ runs, loading, emptyText = "Nenhuma sincronização registrada ainda." }: { runs: SyncRunRow[]; loading: boolean; emptyText?: string }) {
  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  if (!runs.length) {
    return (
      <Card className="p-6 text-center text-sm text-slate-500" data-testid="sync-log-empty">
        {emptyText}
      </Card>
    );
  }
  return (
    <Card className="relative overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm" data-testid="sync-log">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Início</th>
            <th scope="col" className="px-3 py-2 font-medium">Conta</th>
            <th scope="col" className="px-3 py-2 font-medium">Origem</th>
            <th scope="col" className="px-3 py-2 font-medium">Resultado</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Registros</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Duração</th>
            <th scope="col" className="px-3 py-2 font-medium">Erro</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((x) => (
            <tr key={x.id} data-testid="sync-log-row">
              <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatDateTime(x.started_at)}</td>
              <td className="px-3 py-2">
                <span className="block text-slate-900">{x.ad_accounts?.name ?? "—"}</span>
                <span className="text-xs text-slate-500">{x.clients?.name ?? "—"} · {PLATFORM_LABELS[x.platform_id] ?? x.platform_id}</span>
              </td>
              <td className="px-3 py-2 text-slate-700">{TRIGGER_LABEL[x.trigger]}</td>
              <td className="px-3 py-2"><Badge tone={RUN_TONE[x.status]}>{RUN_LABEL[x.status]}</Badge></td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{x.records_updated.toLocaleString("pt-BR")}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{formatDuration(x.duration_ms)}</td>
              <td className="max-w-64 px-3 py-2 text-xs text-red-700">{x.error_message ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
