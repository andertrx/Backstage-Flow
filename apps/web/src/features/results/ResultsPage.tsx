import { can, RI_FIELD_LABELS, RI_FIELDS } from "@backstage/shared";
import { ChartPie, ExternalLink, FileSpreadsheet, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { type RiSource, useRiSources, useSheetsSettings } from "./api.ts";
import { rulesSummary, SourceSetup } from "./SourceSetup.tsx";

/**
 * Etapa 39 — Inteligência de Resultados. Nesta fase (39.1): escolher o cliente e
 * conectar a planilha do Google Sheets dele (aba, colunas e regras dos perfis).
 * A leitura automática (8h, 12h e 16h) e os rankings chegam nas próximas fases.
 */
export function ResultsPage() {
  const { profile } = useAuth();
  const canManage = can(profile?.role, "results.manage");
  const [params, setParams] = useSearchParams();
  const clientId = params.get("cliente");
  const clients = useClients();
  const settings = useSheetsSettings();
  const sources = useRiSources(clientId);
  const [editing, setEditing] = useState(false);
  const source = sources.data?.[0] ?? null;
  const client = clients.data?.find((c) => c.id === clientId);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ChartPie className="size-6 text-blue-600" aria-hidden /> Inteligência de Resultados
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Quais campanhas, conjuntos e anúncios trazem lojistas, sacoleiros e consumidores finais — pelos dados da planilha de cada cliente.
        </p>
      </div>

      <Card className="p-4">
        <Field label="Cliente">
          {(id) => (
            <Select id={id} className="sm:w-96" value={clientId ?? ""} onChange={(e) => { setEditing(false); setParams(e.target.value ? { cliente: e.target.value } : {}); }}>
              <option value="">Escolha um cliente</option>
              {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
        </Field>
      </Card>

      {settings.data && !settings.data.has_key && (
        <Alert tone="warning">
          A conta do Google que lê as planilhas ainda não foi configurada.{" "}
          {profile?.role === "admin"
            ? <Link to="/configuracoes/integracoes" className="font-medium underline">Configurar em Integrações</Link>
            : "Peça ao administrador para configurar em Configurações → Integrações."}
        </Alert>
      )}
      {sources.error && <Alert tone="error">{errorMessage(sources.error)}</Alert>}

      {!clientId ? (
        <p className="text-sm text-slate-500">Escolha um cliente para ver ou conectar a planilha dele.</p>
      ) : sources.isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : editing || (!source && canManage) ? (
        <SourceSetup key={`${clientId}-${source?.id ?? "nova"}`} clientId={clientId} source={source} onDone={() => setEditing(false)} />
      ) : !source ? (
        <Alert tone="info">{client?.name ?? "Este cliente"} ainda não tem planilha conectada. Peça a um administrador ou gestor para conectar.</Alert>
      ) : (
        <SourceSummary source={source} canManage={canManage} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
}

function SourceSummary({ source, canManage, onEdit }: { source: RiSource; canManage: boolean; onEdit: () => void }) {
  const mapped = RI_FIELDS.filter((f) => source.mapping[f]);
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5" data-testid="ri-source-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <FileSpreadsheet className="mt-0.5 size-5 text-emerald-600" aria-hidden />
            <div>
              <h2 className="text-base font-semibold text-slate-900">{source.spreadsheet_title || "Planilha conectada"}</h2>
              <p className="text-sm text-slate-500">Aba <strong>{source.sheet_name}</strong> · cabeçalho na linha {source.header_row} · configurada em {formatDateTime(source.updated_at)}</p>
              <a className="mt-1 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline" target="_blank" rel="noreferrer"
                href={`https://docs.google.com/spreadsheets/d/${source.spreadsheet_id}`}>
                Abrir no Google Sheets <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          </div>
          {canManage && (
            <Button type="button" variant="secondary" onClick={onEdit}><Pencil className="size-4" aria-hidden /> Editar configuração</Button>
          )}
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="ri-mapped">
          {mapped.map((f) => (
            <div key={f} className="flex justify-between gap-3 border-b border-slate-100 py-1">
              <dt className="text-slate-500">{RI_FIELD_LABELS[f].label}</dt>
              <dd className="truncate font-medium text-slate-900">{source.mapping[f]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-slate-600" data-testid="ri-rules-summary"><span className="text-slate-500">Perfis:</span> {rulesSummary(source.profile_rules)}</p>
      </Card>
      <Alert tone="info">
        Planilha configurada. A leitura automática (8h, 12h e 16h, horário de Brasília), o botão "Atualizar agora" e os rankings por perfil chegam nas próximas fases desta etapa.
      </Alert>
    </div>
  );
}
