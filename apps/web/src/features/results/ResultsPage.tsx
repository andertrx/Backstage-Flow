import { can, customParams, RI_FIELD_LABELS, RI_FIELDS, type RiRankMetric } from "@backstage/shared";
import { ChartPie, ExternalLink, FileSpreadsheet, Pencil } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type DashboardFilters, FILTER_PARAMS, parseFilters, resolveFilterPeriod, serializeFilters, updateFilters } from "@/features/dashboard/filters.ts";
import { cn } from "@/lib/cn.ts";
import { formatDateTime } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { type RiSource, useRiSources, useSheetsSettings } from "./api.ts";
import { PROFILE_LOOK, RANKED_PROFILES } from "./look.ts";
import { QualityTab } from "./QualityTab.tsx";
import { ReadStatusCard } from "./ReadStatusCard.tsx";
import { ResultsDashboard, type ResultsView } from "./ResultsDashboard.tsx";
import { rulesSummary, SourceSetup } from "./SourceSetup.tsx";

type Tab = ResultsView["tab"] | "qualidade" | "planilha";
const TABS: { id: Tab; label: string }[] = [
  { id: "visao", label: "Visão geral" },
  ...RANKED_PROFILES.map((p) => ({ id: p as Tab, label: PROFILE_LOOK[p].plural })),
  { id: "qualidade", label: "Qualidade dos dados" },
  { id: "planilha", label: "Planilha" },
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidParam = (v: string | null) => (v && UUID_RE.test(v) ? v.toLowerCase() : null);

/**
 * Etapa 39 — Inteligência de Resultados: escolher o cliente, conectar a planilha dele
 * (39.1), ler 3 vezes por dia ou pelo botão (39.2) e ver os números por perfil (39.4).
 * Tudo fica no endereço da página (cliente, aba, período, campanha/conjunto abertos, ordem, busca).
 */
export function ResultsPage() {
  const { profile } = useAuth();
  const canManage = can(profile?.role, "results.manage");
  // "Atualizar agora": admin, gestor e operador (o servidor confere de novo).
  const canRead = ["admin", "gestor", "operador"].includes(profile?.role ?? "");
  const [params, update] = useSearchParamsUpdater();
  const clientId = uuidParam(params.get("cliente"));
  const tab: Tab = (TABS.find((t) => t.id === params.get("aba"))?.id) ?? "visao";
  const filters = parseFilters(params);
  const setParam = (patch: Record<string, string | null>) => update((latest) => {
    for (const [k, v] of Object.entries(patch)) { if (v) latest.set(k, v); else latest.delete(k); }
    return latest;
  });
  const view: ResultsView = {
    filters: { ...filters, clientId },
    period: resolveFilterPeriod(filters),
    onPeriod: (patch: Partial<DashboardFilters>) => update((latest) => {
      const next = serializeFilters(updateFilters(parseFilters(latest), patch));
      for (const key of ["period", "from", "to"] as const) {
        const name = FILTER_PARAMS[key];
        if (next.get(name)) latest.set(name, next.get(name)!); else latest.delete(name);
      }
      return latest;
    }),
    tab: tab === "planilha" || tab === "qualidade" ? "visao" : tab,
    campaignId: uuidParam(params.get("campanha")),
    adGroupId: uuidParam(params.get("conjunto")),
    metric: (["count", "share"] as const).find((m) => m === params.get("ordem")) ?? "count",
    direction: params.get("direcao") === "menor" ? "asc" : "desc",
    search: params.get("busca") ?? "",
    onChange: (patch) => setParam({
      ...("campanha" in patch ? { campanha: patch.campanha ?? null } : {}),
      ...("conjunto" in patch ? { conjunto: patch.conjunto ?? null } : {}),
      ...("ordem" in patch ? { ordem: patch.ordem === "count" ? null : (patch.ordem as RiRankMetric) } : {}),
      ...("busca" in patch ? { busca: patch.busca || null } : {}),
      ...("direcao" in patch ? { direcao: patch.direcao === "asc" ? "menor" : null } : {}),
    }),
  };
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
            <Select id={id} className="sm:w-96" value={clientId ?? ""} onChange={(e) => { setEditing(false); setParam({ cliente: e.target.value || null, campanha: null, conjunto: null, busca: null }); }}>
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
        <SourceSetup key={`${clientId}-${source?.id ?? "nova"}`} clientId={clientId} source={source} onDone={() => { setEditing(false); setParam({ aba: "planilha" }); }} />
      ) : !source ? (
        <Alert tone="info">{client?.name ?? "Este cliente"} ainda não tem planilha conectada. Peça a um administrador ou gestor para conectar.</Alert>
      ) : (
        <div className="space-y-4">
          <ReadStatusCard source={source} canRead={canRead} canManage={canManage} />
          <nav className="flex flex-wrap gap-2" aria-label="Abas da Inteligência de Resultados">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id}
                onClick={() => setParam({ aba: t.id === "visao" ? null : t.id, campanha: null, conjunto: null, busca: null })}
                className={cn("rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  tab === t.id ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]"
                    : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-blue-700 hover:ring-blue-400")}>
                {t.label}
              </button>
            ))}
          </nav>
          {tab === "planilha"
            ? <SourceSummary source={source} canManage={canManage} onEdit={() => setEditing(true)} />
            : tab === "qualidade"
              ? <QualityTab source={source} canManage={canManage} onEditRules={() => setEditing(true)} />
              : <ResultsDashboard source={source} view={view} clientName={client?.name ?? "cliente"} />}
        </div>
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
          {customParams(source.mapping).map((c) => (
            <div key={c.key} className="flex justify-between gap-3 border-b border-slate-100 py-1">
              <dt className="text-slate-500">{c.label} <span className="text-xs">(personalizado)</span></dt>
              <dd className="truncate font-medium text-slate-900">{c.column}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-slate-600" data-testid="ri-rules-summary"><span className="text-slate-500">Perfis:</span> {rulesSummary(source.profile_rules)}</p>
      </Card>
    </div>
  );
}
