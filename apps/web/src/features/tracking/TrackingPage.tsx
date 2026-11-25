import {
  can,
  captureParams,
  CHANNEL_LABELS,
  classifyTouch,
  type Evidence,
  EVIDENCE_LABELS,
  eventLabel,
} from "@backstage/shared";
import { Code2, ListChecks, MousePointerClick, Pencil, Radar, Trash2, Undo2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useActiveClients } from "@/features/clients/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDataCurta, formatDateTime, formatMoney, formatRelative } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import {
  type OverviewRow,
  type CapiOverview,
  type Destination,
  type TrackingContainer,
  type AdLinkEntity,
  type AdLinkLookup,
  useAdLinkLookup,
  useCapiOverview,
  useConversionsSummary,
  useDestinations,
  useWaSuggestions,
  useWhatsAppContactClicks,
  useWhatsAppClicks,
  useWhatsAppConnections,
  useWhatsAppConversations,
  useWaConversationSales,
  useAttribution,
  useTrackingQuality,
  useRecentEvents,
  useRecentLeads,
  useRecentTouchpoints,
  useTrackingContainers,
  useTrackingOverview,
  useExcludeContainer,
  useRestoreContainer,
} from "./api.ts";
import { AttributionSection } from "./AttributionSection.tsx";
import { ConfigSection } from "@/components/ui/section.tsx";
import { ContainerFormModal, InstallModal } from "./ContainerModals.tsx";
import { LeadsSection } from "./LeadsSection.tsx";
import { ReadinessSection, type SiteReadiness } from "./ReadinessSection.tsx";
import { capiStatus, PERIOD_LABELS, siteReadiness, type PeriodPreset, periodRange, siteRecemCriado, summarizeConversions, usoRecente } from "./logic.ts";
import { MetaCapiModal } from "./MetaCapiModal.tsx";
import { SuggestionsSection } from "./SuggestionsSection.tsx";
import { RulesModal } from "./RulesModal.tsx";
import { WhatsAppApiModal } from "./WhatsAppApiModal.tsx";
import { ClienteSiteWhatsApp } from "./ClientesSiteWhatsApp.tsx";
import { WhatsAppServerModal } from "./WhatsAppServerModal.tsx";
import { WhatsAppSection } from "./WhatsAppSection.tsx";

const EVIDENCE_TONE: Record<Evidence, "success" | "warning" | "neutral"> = {
  confirmada: "success",
  provavel: "warning",
  desconhecida: "neutral",
};

/** "sites" é a parte de Configurações (código de instalação, Meta, regras); as demais são do Painel. */
export type TrackingTab = "resumo" | "sites" | "origens" | "whatsapp" | "sugestoes" | "leads" | "saude";
const TABS: { id: TrackingTab; label: string }[] = [
  { id: "resumo", label: "Resumo" },
  { id: "origens", label: "Origem e jornada" },
  { id: "leads", label: "Leads recebidos" },
  { id: "saude", label: "Saúde" },
  { id: "sites", label: "Sites" },
  { id: "whatsapp", label: "Cliques no WhatsApp" },
  { id: "sugestoes", label: "Vendas sugeridas" },
];

const paidLabel = (paid: boolean | null) => (paid === true ? "Pago" : paid === false ? "Orgânico" : "Não dá para saber");

/**
 * Partes do Tracking (a tela em si é o `TrackingHub`: Painel e Configurações). `clientId` vazio = todos os clientes;
 * `tabs` diz quais partes aparecem; a parte escolhida fica no endereço como `sub`.
 */
export function TrackingPage({ clientId, tabs }: { clientId: string | null; tabs: TrackingTab[] }) {
  const { profile } = useAuth();
  const canManage = can(profile?.role, "tracking.manage");
  const [params, updateParams] = useSearchParamsUpdater();
  const period = (["hoje", "7d", "30d"] as const).find((p) => p === params.get("periodo")) ?? "hoje";
  const tabParam = "sub";
  const shownTabs = TABS.filter((t) => tabs.includes(t.id));
  const tab = shownTabs.find((t) => t.id === params.get(tabParam))?.id ?? shownTabs[0]?.id ?? "sites";
  const set = (key: string, value: string | null) =>
    updateParams((latest) => {
      if (value) latest.set(key, value);
      else latest.delete(key);
      return latest;
    });

  const { data: clients = [] } = useActiveClients();
  const { data: containers = [], isLoading, error } = useTrackingContainers();
  const hasContainers = containers.length > 0;
  const range = useMemo(() => periodRange(period), [period]);
  const overview = useTrackingOverview(range.from, range.to, hasContainers);
  const touchpoints = useRecentTouchpoints(hasContainers);
  const events = useRecentEvents(hasContainers);
  const leads = useRecentLeads(hasContainers);
  const conversions = useConversionsSummary(range.from, range.to, hasContainers);
  const destinations = useDestinations(hasContainers);
  const capiOverview = useCapiOverview(hasContainers);
  const destOf = (containerId: string) => (destinations.data ?? []).find((d) => d.container_id === containerId);
  const capiOf = (dest: Destination | undefined) => (dest ? (capiOverview.data ?? []).find((o) => o.destination_id === dest.id) : undefined);
  const [metaFor, setMetaFor] = useState<TrackingContainer | null>(null);
  const waClicks = useWhatsAppClicks(hasContainers);
  const waConnections = useWhatsAppConnections(hasContainers);
  const waConversations = useWhatsAppConversations(hasContainers);
  const contactClicks = useWhatsAppContactClicks(hasContainers);
  const waConvSales = useWaConversationSales(hasContainers);
  const suggestions = useWaSuggestions(hasContainers);
  const waConnOf = (containerId: string) => (waConnections.data ?? []).find((w) => w.container_id === containerId);
  const [waApiFor, setWaApiFor] = useState<TrackingContainer | null>(null);
  const [waServerFor, setWaServerFor] = useState<TrackingContainer | null>(null);
  const model = params.get("atribuicao") === "primeiro" ? "first" : "last";
  const attribution = useAttribution(range.from, range.to, model, hasContainers);
  const quality = useTrackingQuality(range.from, range.to, hasContainers);

  const [editing, setEditing] = useState<TrackingContainer | "new" | null>(null);
  const [excluding, setExcluding] = useState<TrackingContainer | null>(null);
  const [newSiteClient, setNewSiteClient] = useState<string | null>(null);
  const [installing, setInstalling] = useState<TrackingContainer | null>(null);
  const [rulesFor, setRulesFor] = useState<TrackingContainer | null>(null);

  const visible = containers.filter((c) => !clientId || c.client_id === clientId);
  /** T5.35: site excluído sai das listas e dos totais (o histórico fica guardado). O WhatsApp do cliente continua valendo. */
  const ativos = visible.filter((c) => !c.excluded_at);
  const excluidos = visible.filter((c) => c.excluded_at);
  /** Só os sites de verdade: o container técnico do WhatsApp sem site não aparece como site. */
  const visibleSites = ativos.filter((c) => c.kind !== "whatsapp");
  const visibleIds = new Set(ativos.map((c) => c.id));
  /** O WhatsApp é do cliente, não do site: o site excluído não esconde a conversa. */
  const waIds = new Set(visible.map((c) => c.id));
  const byId = new Map(containers.map((c) => [c.id, c]));
  const stats = new Map((overview.data ?? []).map((r) => [r.container_id, r]));
  const total = sumOverview(visibleSites.map((c) => stats.get(c.id)).filter((r): r is OverviewRow => !!r));
  const conv = summarizeConversions(conversions.data ?? [], visibleIds);
  const readiness: SiteReadiness[] = visibleSites.map((c) => {
    const dest = destOf(c.id);
    const r = siteReadiness({
      container: c,
      nowMs: Date.now(),
      lastEventAt: stats.get(c.id)?.last_event_at ?? null,
      quality: (quality.data ?? []).find((q) => q.container_id === c.id),
      leads: (leads.data ?? []).filter((l) => l.container_id === c.id).length,
      destination: dest,
      capi: capiOf(dest),
      whatsapp: waConnOf(c.id),
    });
    return { id: c.id, name: c.name, client: c.clients?.name ?? "—", summary: r.summary, items: r.items };
  });

  /**
   * 25/11/2026: o pixel do Meta é um por cliente (pode estar no site ou no WhatsApp). O cartão do site mostra o pixel do cliente,
   * para não dizer "desligado" no site quando o pixel está ligado no WhatsApp do mesmo cliente.
   */
  const pixelDoCliente = (c: TrackingContainer) => {
    const proprio = destOf(c.id);
    if (proprio) return { container: c, destination: proprio };
    const outro = containers.find((x) => x.client_id === c.client_id && destOf(x.id));
    return outro ? { container: outro, destination: destOf(outro.id) } : { container: c, destination: undefined };
  };
  /** Os cartões dos sites de um cliente (abrem na linha do cliente em Configurações). */
  const sitesDoCliente = (cid: string) => {
    const mineSites = visible.filter((c) => c.client_id === cid && c.kind !== "whatsapp" && !c.excluded_at);
    if (mineSites.length === 0) return null;
    return (
      <ul className="grid gap-3 lg:grid-cols-2">
        {mineSites.map((c) => {
          const px = pixelDoCliente(c);
          return (
            <ContainerCard key={c.id} container={c} stats={stats.get(c.id)} canManage={canManage}
              onEdit={() => setEditing(c)} onInstall={() => setInstalling(c)}
              destination={px.destination} capi={capiOf(px.destination)} onMeta={() => setMetaFor(px.container)}
              onRules={() => setRulesFor(c)} onExclude={() => setExcluding(c)} />
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : !hasContainers ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center" data-testid="tracking-empty">
          <Radar className="size-8 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-900">{clientId ? "Este cliente ainda não tem site configurado." : "Nenhum site configurado ainda."}</p>
          <p className="max-w-md text-sm text-slate-500">
            {canManage
              ? "Em Configurações, crie o site do cliente, informe o domínio e cole o código de instalação no site."
              : "Peça a um administrador ou gestor para configurar o site do cliente."}
          </p>
          {canManage && <p className="max-w-md text-sm text-slate-500">Cliente que só usa WhatsApp, sem site? Ligue direto, sem cadastrar site:</p>}
          {canManage && (
            <div className="w-full max-w-3xl text-left">
              <ClienteSiteWhatsApp clients={clients.filter((cl) => !clientId || cl.id === clientId)} containers={containers} connectionOf={waConnOf} destinationOf={destOf}
                onAddSite={(id) => { setNewSiteClient(id); setEditing("new"); }} onWhatsApp={setWaServerFor} onWhatsAppApi={setWaApiFor} onPixel={setMetaFor} />
            </div>
          )}
        </Card>
      ) : (
        <>
          {(tab === "resumo" || tab === "origens") && (<Card className="grid gap-3 p-4" role="search" aria-label="Filtros do tracking">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Período</span>
              <Select value={period} onChange={(e) => set("periodo", e.target.value === "hoje" ? null : e.target.value)}>
                {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
              </Select>
            </label>
          </Card>)}

          {shownTabs.length > 1 && (<div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist" aria-label="Partes do tracking">
            {shownTabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-testid={`tracking-tab-${t.id}`}
                onClick={() => set(tabParam, t.id === shownTabs[0].id ? null : t.id)}
                className={tab === t.id
                  ? "rounded-full bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-brand"
                  : "rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:text-slate-900"}>
                {t.label}
              </button>
            ))}
          </div>)}

          {tab === "resumo" && (
            <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" role="list" aria-label="Resumo do período">
            <Stat label="Sessões" value={total.sessions} />
            <Stat label="Visitantes" value={total.visitors} />
            <Stat label="Páginas vistas" value={total.pageviews} />
            <Stat label="Sessões de anúncio" value={total.paid_sessions} hint="Origem paga (confirmada ou provável)." />
            <Stat label="Origem desconhecida" value={total.unknown_origin_sessions} hint="Sessões sem parâmetros nem site de origem." />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="list" aria-label="Conversões do período">
            <Stat label="Leads" value={conv.leads} hint="Eventos Lead no período." />
            <Stat label="Conversões" value={conv.conversions} hint="Lead, cadastro, inscrição, agendamento e compra." />
            <Stat label="Compras" value={conv.purchases} hint="Sem repetir o mesmo nº de pedido." />
            <div role="listitem" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-testid="tracking-revenue">
              <span className="block text-sm font-medium text-slate-500">Receita do site</span>
              {conv.revenue.length === 0 ? (
                <span className="mt-1 block text-2xl font-semibold text-slate-900">—</span>
              ) : (
                conv.revenue.map((r) => (
                  <span key={r.currency} className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{formatMoney(r.micros / 1_000_000, r.currency)}</span>
                ))
              )}
            </div>
          </div>
            </>
          )}

          {tab === "sites" && (
            <div className="space-y-8">
              {canManage && (
                <ConfigSection id="cfg-clientes" title="Clientes: site e/ou WhatsApp" description="Escolha, cliente por cliente, se ele tem site, WhatsApp ou os dois. Um não depende do outro.">
                  <ClienteSiteWhatsApp clients={clients.filter((c) => !clientId || c.id === clientId)} containers={containers} connectionOf={waConnOf} destinationOf={destOf}
                    onAddSite={(id) => { setNewSiteClient(id); setEditing("new"); }} onWhatsApp={setWaServerFor} onWhatsAppApi={setWaApiFor} onPixel={setMetaFor}
                    renderDetail={sitesDoCliente} />
                  <span id="cfg-detalhes" /><span id="cfg-sites" /><span id="cfg-whatsapp" />
                </ConfigSection>
              )}
              {!canManage && (
                <ConfigSection id="cfg-detalhes" title="Sites de cada cliente" description="Código de instalação, pixel do Meta e regras de eventos de cada site.">
                  <span id="cfg-sites" /><span id="cfg-whatsapp" />
                  <div className="space-y-5">
                    {!visible.some((c) => c.kind !== "whatsapp" && !c.excluded_at) && <p className="text-sm text-slate-500">Nenhum site cadastrado ainda.</p>}
                    {[...new Set(visible.filter((c) => c.kind !== "whatsapp" && !c.excluded_at).map((c) => c.client_id))].map((cid) => (
                      <div key={cid} className="space-y-2 rounded-xl p-3 ring-1 ring-slate-200" data-testid="cliente-detalhe">
                        <p className="text-sm font-semibold text-slate-900">{visible.find((c) => c.client_id === cid)?.clients?.name ?? "Cliente"}</p>
                        {sitesDoCliente(cid)}
                      </div>
                    ))}
                  </div>
                </ConfigSection>
              )}
              <ConfigSection id="cfg-link" title="Ferramentas" description="Conferir como um link de anúncio seria entendido pelo tracking. Nada é gravado.">
                <LinkTester />
              </ConfigSection>
              {canManage && (
                <ExcludedSitesCard
                  sites={excluidos.filter((c) => c.kind !== "whatsapp")}
                  clientName={(id) => clients.find((c) => c.id === id)?.name ?? "—"}
                />
              )}
            </div>
          )}

          {tab === "origens" && (
            <>
          <AttributionSection
            rows={(attribution.data ?? []).filter((r) => !clientId || r.client_id === clientId)}
            quality={(quality.data ?? []).filter((q) => visibleIds.has(q.container_id))}
            model={model}
            onModel={(m) => set("atribuicao", m === "first" ? "primeiro" : null)}
            isLoading={attribution.isLoading}
            error={attribution.error ?? quality.error}
            siteName={(id) => byId.get(id)?.name ?? "—"}
          />

          <section aria-label="Últimas origens" className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Últimas chegadas e origem</h2>
            <Card className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Quando</th>
                    <th className="px-3 py-2 font-medium">Site</th>
                    <th className="px-3 py-2 font-medium">Origem</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Evidência</th>
                    <th className="px-3 py-2 font-medium">Campanha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" data-testid="touchpoints">
                  {(touchpoints.data ?? []).filter((t) => visibleIds.has(t.container_id)).map((t) => (
                    <tr key={t.id} data-testid="touchpoint-row">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(t.occurred_at)}</td>
                      <td className="px-3 py-2 text-slate-600">{byId.get(t.container_id)?.name ?? "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{CHANNEL_LABELS[t.channel]}</td>
                      <td className="px-3 py-2 text-slate-600">{paidLabel(t.paid)}</td>
                      <td className="px-3 py-2" title={t.reason}>
                        <Badge tone={EVIDENCE_TONE[t.evidence]}>{EVIDENCE_LABELS[t.evidence]}</Badge>
                        <span className="sr-only"> — {t.reason}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {t.utm_campaign ?? (t.ad_campaign_id ? `ID ${t.ad_campaign_id}` : "—")}
                      </td>
                    </tr>
                  ))}
                  {(touchpoints.data ?? []).filter((t) => visibleIds.has(t.container_id)).length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nenhuma chegada registrada ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          </section>

          <section aria-label="Últimos eventos" className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Últimos eventos (3 dias)</h2>
            <Card>
              <ul className="divide-y divide-slate-100 text-sm" data-testid="events">
                {(events.data ?? []).filter((e) => visibleIds.has(e.container_id)).map((e) => (
                  <li key={`${e.container_id}-${e.event_id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="event-row">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-medium text-slate-900">{eventLabel(e.event_name)}</span>
                      <span className="truncate text-slate-500">{e.page_path ?? ""}</span>
                      {e.test && <Badge tone="warning">Teste</Badge>}
                    </span>
                    <span className="text-xs text-slate-500">{byId.get(e.container_id)?.name} · {formatDateTime(e.occurred_at)}</span>
                  </li>
                ))}
                {(events.data ?? []).filter((e) => visibleIds.has(e.container_id)).length === 0 && (
                  <li className="px-3 py-6 text-center text-slate-500">Nenhum evento recebido nos últimos 3 dias.</li>
                )}
              </ul>
            </Card>
          </section>
            </>
          )}

          {tab === "whatsapp" && (
          <>
          <Card className="space-y-2 p-4" data-testid="wa-click-channels">
            <p className="text-sm font-semibold text-slate-900">Cliques no WhatsApp <span className="font-normal text-slate-500">(últimos 30 dias)</span></p>
            {(() => {
              const mine = (contactClicks.data ?? []).filter((c) => waIds.has(c.container_id));
              const numero = mine.filter((c) => c.canal === "whatsapp").length;
              const grupo = mine.filter((c) => c.canal === "whatsapp_grupo").length;
              return (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3" data-testid="wa-clicks-numero">
                    <p className="text-xs text-slate-500">Botão que abre conversa com o número</p>
                    <p className="text-2xl font-semibold tabular-nums text-slate-900">{numero}</p>
                    <p className="text-xs text-slate-500">A conversa fica ligada ao clique (código "ref."), e dá para marcar lead e venda com a origem.</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3" data-testid="wa-clicks-grupo">
                    <p className="text-xs text-slate-500">Botão que leva ao grupo do WhatsApp</p>
                    <p className="text-2xl font-semibold tabular-nums text-slate-900">{grupo}</p>
                    <p className="text-xs text-slate-500">Só o clique e a origem do anúncio. Quem entra no grupo não é identificado e as mensagens do grupo não são guardadas.</p>
                  </div>
                </div>
              );
            })()}
          </Card>
          <WhatsAppSection
            clicks={(waClicks.data ?? []).filter((c) => waIds.has(c.container_id))}
            conversations={(waConversations.data ?? []).filter((c) => waIds.has(c.container_id))}
            hasApi={(waConnections.data ?? []).some((w) => waIds.has(w.container_id)) || (waConversations.data ?? []).length > 0}
            siteName={(id) => byId.get(id)?.name ?? "—"}
            sales={waConvSales.data ?? []}
          />
          </>
          )}

          {tab === "sugestoes" && (
            <SuggestionsSection
              suggestions={(suggestions.data ?? []).filter((x) => !clientId || x.client_id === clientId)}
              clientName={(id) => clients.find((c) => c.id === id)?.name ?? "Cliente"}
            />
          )}

          {tab === "saude" && <ReadinessSection sites={readiness} />}

          {tab === "leads" && (
            <>
          <LeadsSection
            leads={(leads.data ?? []).filter((l) => visibleIds.has(l.container_id))}
            siteName={(id) => byId.get(id)?.name ?? "—"}
          />
          <p className="text-sm text-slate-500">
            Para marcar perfil, etapa ou venda de cada contato, use a aba <strong>Contatos e vendas</strong> deste painel.
          </p>
            </>
          )}
        </>
      )}


      {editing && (
        <ContainerFormModal
          container={editing === "new" ? null : editing}
          clients={clients.filter((c) => (newSiteClient ? c.id === newSiteClient : !clientId || c.id === clientId)).map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => { setEditing(null); setNewSiteClient(null); }}
          onSaved={(id) => {
            if (editing === "new") {
              const created = { id } as TrackingContainer;
              setInstalling((prev) => prev ?? created);
            }
          }}
        />
      )}
      {excluding && <ExcludeSiteModal container={excluding} onClose={() => setExcluding(null)} />}
      {installing && (
        <InstallModalLoader id={installing.id} containers={containers} destinations={destinations.data ?? []} onClose={() => setInstalling(null)} />
      )}
      {metaFor && (
        <MetaCapiModal
          container={metaFor}
          destination={destOf(metaFor.id)}
          overview={capiOf(destOf(metaFor.id))}
          canManage={canManage}
          onClose={() => setMetaFor(null)}
        />
      )}
      {waServerFor && (
        <WhatsAppServerModal container={waServerFor} connection={waConnOf(waServerFor.id)} canManage={canManage} onClose={() => setWaServerFor(null)} />
      )}
      {waApiFor && (
        <WhatsAppApiModal container={waApiFor} connection={waConnOf(waApiFor.id)} canManage={canManage} onClose={() => setWaApiFor(null)} />
      )}
      {rulesFor && <RulesModal container={rulesFor} canManage={canManage} onClose={() => setRulesFor(null)} />}
    </div>
  );
}

/** Abre as instruções assim que o container recém-criado aparece na lista. */
function InstallModalLoader({ id, containers, destinations, onClose }: { id: string; containers: TrackingContainer[]; destinations: Destination[]; onClose: () => void }) {
  const container = containers.find((c) => c.id === id);
  return container ? <InstallModal container={container} pixelId={destinations.find((d) => d.container_id === id)?.pixel_id ?? null} onClose={onClose} /> : null;
}

function sumOverview(rows: OverviewRow[]) {
  const keys = ["sessions", "visitors", "pageviews", "events", "paid_sessions", "unknown_origin_sessions"] as const;
  return Object.fromEntries(keys.map((k) => [k, rows.reduce((t, r) => t + Number(r[k] ?? 0), 0)])) as Record<(typeof keys)[number], number>;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div role="listitem" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200" title={hint} data-testid="tracking-stat">
      <span className="block text-sm font-medium text-slate-500">{label}</span>
      <span className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value.toLocaleString("pt-BR")}</span>
    </div>
  );
}

function ContainerCard({ container: c, stats, canManage, onEdit, onInstall, destination, capi, onMeta, onRules, onExclude }: {
  container: TrackingContainer;
  stats?: OverviewRow;
  canManage: boolean;
  onEdit: () => void;
  onInstall: () => void;
  destination: Destination | undefined;
  capi: CapiOverview | undefined;
  onMeta: () => void;
  onRules: () => void;
  onExclude: () => void;
}) {
  const meta = capiStatus(destination, capi);
  /** T5.35 (etapa 5): site sem uso — o aviso diz desde quando (não só "muito tempo"). */
  const uso = usoRecente(stats?.last_event_at ?? null, Date.now());
  /** Site recém-criado ainda não é "sem uso": o código pode ter acabado de ser colado. */
  const recemCriado = siteRecemCriado(c.created_at, Date.now());
  return (
    <li>
      <Card className="space-y-3 p-4" data-testid="container-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{c.name}</p>
            <p className="text-xs text-slate-500">{c.clients?.name ?? "—"} · {c.allowed_domains.join(", ")}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge tone={c.status === "ativo" ? "success" : "neutral"}>{c.status === "ativo" ? "Ativo" : "Pausado"}</Badge>
            {c.test_mode && <Badge tone="warning">Modo teste</Badge>}
            {uso.level === "nunca" && !recemCriado && <Badge tone="danger" data-testid="container-sem-uso">Nunca recebeu evento</Badge>}
            {uso.level === "atencao" && (
              <Badge tone="warning" data-testid="container-sem-uso">Sem uso desde {formatDataCurta(stats!.last_event_at!)}</Badge>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-600" data-testid="container-last-event">
          {stats?.last_event_at
            ? `Último evento recebido ${formatRelative(stats.last_event_at)}${uso.level === "atencao" ? ` (em ${formatDataCurta(stats.last_event_at)})` : ""}.`
            : "Nenhum evento recebido ainda. Confira se o código foi instalado."}
        </p>
        <dl className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
          <div className="rounded-lg bg-slate-50 p-2"><dt>Sessões</dt><dd className="text-base font-semibold text-slate-900">{stats?.sessions ?? 0}</dd></div>
          <div className="rounded-lg bg-slate-50 p-2"><dt>Páginas</dt><dd className="text-base font-semibold text-slate-900">{stats?.pageviews ?? 0}</dd></div>
          <div className="rounded-lg bg-slate-50 p-2"><dt>Eventos</dt><dd className="text-base font-semibold text-slate-900">{stats?.events ?? 0}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onMeta} aria-label={`Meta API de Conversões: ${c.name}`}>
            Pixel do Meta · {meta.label}
          </Button>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onRules} aria-label={`Regras do site: ${c.name}`}>
            <ListChecks className="size-3.5" aria-hidden /> Regras · {c.rules_version ? `versão ${c.rules_version}` : "nenhuma publicada"}
          </Button>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onInstall} aria-label={`Código de instalação: ${c.name}`}>
            <Code2 className="size-3.5" aria-hidden /> Código de instalação
          </Button>
          {canManage && (
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onEdit} aria-label={`Editar ${c.name}`}>
              <Pencil className="size-3.5" aria-hidden /> Editar
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" className="px-3 py-1.5 text-xs text-rose-700 hover:text-rose-800" onClick={onExclude} aria-label={`Excluir site: ${c.name}`}>
              <Trash2 className="size-3.5" aria-hidden /> Excluir site
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}

/**
 * T5.35: confirmação de "Excluir site" — digitar o nome do site.
 * Nada é apagado: o site sai da lista, o script passa a ser recusado e o histórico fica guardado (dá para restaurar).
 */
function ExcludeSiteModal({ container, onClose }: { container: TrackingContainer; onClose: () => void }) {
  const exclude = useExcludeContainer();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === container.name.trim().toLowerCase();
  return (
    <Modal title="Excluir site" open onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (!matches) return;
        setError(null);
        exclude.mutate({ id: container.id, name: typed.trim() }, { onSuccess: onClose, onError: (err) => setError(errorMessage(err)) });
      }}>
        <p className="text-sm text-slate-600">
          O site <strong>{container.name}</strong> sai da lista e dos totais, e o código dele deixa de enviar eventos.
          O WhatsApp do cliente continua funcionando. <strong>Nada é apagado</strong> — o histórico fica guardado e dá para restaurar depois.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={`Para confirmar, digite o nome do site: ${container.name}`}>
          {(fid) => <Input id={fid} autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="container-exclude-name" />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={!matches} loading={exclude.isPending} data-testid="container-exclude-confirm">
            <Trash2 className="size-4" aria-hidden /> Excluir site
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** T5.35: sites excluídos (ficam guardados, fora das listas). Só administrador e gestor veem e restauram. */
function ExcludedSitesCard({ sites, clientName }: {
  sites: TrackingContainer[];
  clientName: (id: string) => string;
}) {
  const restore = useRestoreContainer();
  const [error, setError] = useState<string | null>(null);
  if (sites.length === 0) return null;
  return (
    <ConfigSection id="cfg-excluidos" title="Sites excluídos" description="Sites tirados da operação. O histórico continua guardado e dá para trazer de volta.">
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="space-y-2" data-testid="excluded-sites">
        {sites.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3" data-testid="excluded-site-row">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{c.name}</p>
              <p className="text-xs text-slate-500">{clientName(c.client_id)} · {c.allowed_domains.join(", ") || "sem domínio"}</p>
            </div>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" loading={restore.isPending} onClick={() => {
              setError(null);
              restore.mutate(c.id, { onError: (err) => setError(errorMessage(err)) });
            }} aria-label={`Restaurar site: ${c.name}`}>
              <Undo2 className="size-3.5" aria-hidden /> Restaurar
            </Button>
          </li>
        ))}
      </ul>
    </ConfigSection>
  );
}

/** Confere, sem gravar nada, como uma URL de anúncio seria classificada. */
function LinkTester() {
  const [url, setUrl] = useState("");
  const [referrer, setReferrer] = useState("");
  const [result, setResult] = useState<ReturnType<typeof classify> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      new URL(url);
    } catch {
      setResult(null);
      return setError("Cole a URL completa, começando com https://");
    }
    setError(null);
    setResult(classify(url, referrer));
  }

  const adIds = result?.params.adIds ?? {};
  const lookup = useAdLinkLookup(adIds.campaign ?? null, adIds.adset ?? null, adIds.ad ?? null, result != null);

  return (
    <Card className="space-y-3 p-4" aria-label="Testar link">
      <div className="flex items-center gap-2">
        <MousePointerClick className="size-4 text-slate-400" aria-hidden />
        <h2 className="text-base font-semibold text-slate-900">Testar um link</h2>
      </div>
      <p className="text-sm text-slate-500">Cole a URL de um anúncio para ver o que o tracking vai entender. Nada é gravado.</p>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end" noValidate>
        <Field label="URL de destino">
          {(id) => <Input id={id} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://loja.com.br/?utm_source=facebook&fbclid=…" />}
        </Field>
        <Field label="Site de origem (opcional)">
          {(id) => <Input id={id} value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="https://www.google.com/" />}
        </Field>
        <Button type="submit" variant="secondary">Testar</Button>
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      {result && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm" data-testid="link-test-result">
          {result.touch ? (
            <p>
              <strong>{CHANNEL_LABELS[result.touch.channel]}</strong> · {paidLabel(result.touch.paid)} ·{" "}
              <Badge tone={EVIDENCE_TONE[result.touch.evidence]}>{EVIDENCE_LABELS[result.touch.evidence]}</Badge>
              <span className="block text-slate-600">{result.touch.reason}</span>
            </p>
          ) : (
            <p>Navegação dentro do próprio site: não conta como nova origem.</p>
          )}
          <p className="text-xs text-slate-500">
            UTMs: {Object.entries(result.params.utm).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhuma"} · Identificadores de clique:{" "}
            {Object.keys(result.params.clickIds).join(", ") || "nenhum"} · IDs do anúncio:{" "}
            {Object.entries(result.params.adIds).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhum"}
          </p>
          <AnuncioDoLink ids={adIds} lookup={lookup.data} carregando={lookup.isLoading} />
        </div>
      )}
    </Card>
  );
}

/**
 * O que o link aponta dentro do CRM: a campanha, o conjunto e o criativo (anúncio).
 * Quando o ID não está no CRM, a tela diz que não está — não inventa nome.
 */
function AnuncioDoLink({ ids, lookup, carregando }: {
  ids: { campaign?: string; adset?: string; ad?: string };
  lookup: AdLinkLookup | undefined;
  carregando: boolean;
}) {
  if (!ids.campaign && !ids.adset && !ids.ad) return null;
  const linhas: { rotulo: string; id: string; entidade: AdLinkEntity | null }[] = [
    { rotulo: "Campanha", id: ids.campaign ?? "", entidade: lookup?.campaign ?? null },
    { rotulo: "Conjunto", id: ids.adset ?? "", entidade: lookup?.adset ?? null },
    { rotulo: "Criativo (anúncio)", id: ids.ad ?? "", entidade: lookup?.ad ?? null },
  ].filter((l) => l.id);
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3" data-testid="link-anuncio">
      <p className="text-xs font-medium text-slate-600">O que este link aponta</p>
      {carregando ? (
        <p className="text-xs text-slate-500">Procurando no CRM…</p>
      ) : (
        <ul className="space-y-1.5">
          {linhas.map((l) => (
            <li key={l.rotulo} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">{l.rotulo}:</span>
              {l.entidade ? (
                <>
                  {l.entidade.thumbnail_url ? (
                    <img src={l.entidade.thumbnail_url} alt="" className="size-8 shrink-0 rounded object-cover ring-1 ring-slate-200" referrerPolicy="no-referrer" loading="lazy" />
                  ) : null}
                  <span className="font-medium text-slate-900">{l.entidade.name}</span>
                  <span className="text-xs text-slate-500">ID {l.id}</span>
                  {l.entidade.creative_type ? <Badge tone="neutral">{l.entidade.creative_type}</Badge> : null}
                </>
              ) : (
                <span className="text-slate-500">ID {l.id} — não encontrada no CRM</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {lookup?.ambiguo ? (
        <p className="text-xs text-amber-700">Este ID existe em mais de um cliente: o link, sozinho, não diz de quem é.</p>
      ) : null}
    </div>
  );
}

function classify(url: string, referrer: string) {
  const params = captureParams(url);
  return { params, touch: classifyTouch({ params, referrer: referrer.trim() || null, pageUrl: url }) };
}
