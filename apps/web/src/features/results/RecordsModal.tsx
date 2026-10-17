import type { DateRange, RiProfile } from "@backstage/shared";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate } from "@/lib/format.ts";
import { RECORDS_PAGE, type RiIssue, type RiRecord, useRiRecords } from "./api.ts";
import { PROFILE_LOOK } from "./look.ts";

export interface RecordsTarget {
  title: string;
  profile?: RiProfile | null;
  campaignId?: string | null;
  adGroupId?: string | null;
  adId?: string | null;
  issue?: RiIssue | null;
}

const ISSUE_TEXT: Record<NonNullable<RiRecord["match_issue"]>, string> = {
  sem_origem: "Sem origem na planilha",
  nao_encontrada: "Origem não encontrada no CRM",
  nome_ambiguo: "Nome ambíguo (mais de um item)",
};

function how(r: RiRecord): string {
  if (r.match_issue && !r.match_level) return ISSUE_TEXT[r.match_issue];
  const level = r.match_level === "anuncio" ? "anúncio" : r.match_level === "conjunto" ? "conjunto" : "campanha";
  return `${level}, pelo ${r.match_method === "id" ? "ID" : "nome"}${r.match_issue ? ` · ${ISSUE_TEXT[r.match_issue]}` : ""}`;
}

/**
 * Etapa 39.4 — as linhas da planilha que formam um número (sem telefone, e-mail ou nome).
 * A "linha" é o número da linha na planilha, para achar o contato lá.
 */
export function RecordsModal({ clientId, range, target, onClose }: { clientId: string; range: DateRange; target: RecordsTarget; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const q = useRiRecords({ clientId, range, ...target }, page);
  const rows = q.data ?? [];
  const total = rows[0]?.total_count ?? 0;

  return (
    <Modal title={target.title} open onClose={onClose} size="lg">
      <div className="space-y-3 p-5" data-testid="ri-records">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{target.title}</h2>
          <p className="text-xs text-slate-500">
            {target.issue === "sem_data" ? "Todas as leituras" : `${formatDate(range.from)} a ${formatDate(range.to)}`} · sem dados pessoais (veja o contato na planilha pela linha).
          </p>
        </div>
        {q.error && <Alert tone="error">{errorMessage(q.error)}</Alert>}
        {q.isLoading ? <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-label="Carregando" />
          : rows.length === 0 ? <p className="text-sm text-slate-500">Nenhuma linha.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Linha</th>
                    <th className="px-2 py-1.5 font-medium">Data</th>
                    <th className="px-2 py-1.5 font-medium">Perfil</th>
                    <th className="px-2 py-1.5 font-medium">Origem no CRM</th>
                    <th className="py-1.5 pl-2 font-medium">Como foi ligada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" data-testid="ri-records-rows">
                  {rows.map((r) => (
                    <tr key={`${r.record_key}-${r.row_number}`}>
                      <td className="py-1.5 pr-2 tabular-nums text-slate-500">{r.row_number}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.contact_date ? formatDate(r.contact_date) : "—"}</td>
                      <td className="px-2 py-1.5">
                        <span className="block">{PROFILE_LOOK[r.profile].label}</span>
                        {r.profile_value && <span className="block text-xs text-slate-500">na planilha: “{r.profile_value}”</span>}
                      </td>
                      <td className="max-w-56 px-2 py-1.5">
                        <span className="block truncate" title={r.ad_name ?? r.ad_group_name ?? r.campaign_name ?? undefined}>
                          {r.ad_name ?? r.ad_group_name ?? r.campaign_name ?? "—"}
                        </span>
                        {(r.ad_name || r.ad_group_name) && r.campaign_name && <span className="block truncate text-xs text-slate-500">{r.campaign_name}</span>}
                        {!r.match_level && (r.sheet_ad || r.sheet_adset || r.sheet_campaign) && (
                          <span className="block truncate text-xs text-slate-500">na planilha: “{r.sheet_ad ?? r.sheet_adset ?? r.sheet_campaign}”</span>
                        )}
                      </td>
                      <td className="py-1.5 pl-2 text-xs text-slate-600">{how(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span data-testid="ri-records-count">{page * RECORDS_PAGE + 1}–{page * RECORDS_PAGE + rows.length} de {total.toLocaleString("pt-BR")} linha(s)</span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anteriores</Button>
              <Button type="button" variant="secondary" disabled={(page + 1) * RECORDS_PAGE >= total} onClick={() => setPage((p) => p + 1)}>Próximas</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
