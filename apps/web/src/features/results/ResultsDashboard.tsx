import {
  addDays, classifiedShare, type DateRange, profileShare, rankItems, type RiLevel, type RiProfile,
  type RiRankMetric, type RiResultItem, type RiResults, topFor,
} from "@backstage/shared";
import { ListChecks, Search } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { type DashboardFilters, type ResolvedPeriod } from "@/features/dashboard/filters.ts";
import { PeriodPicker } from "@/features/structure/PeriodPicker.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatChange, formatDate, formatDateTime } from "@/lib/format.ts";
import { type RiDailyRow, type RiSource, useRiDaily, useRiResults } from "./api.ts";
import { ExportBar } from "./ExportBar.tsx";
import { PROFILE_LOOK, PROFILES, RANKED_PROFILES } from "./look.ts";
import { RecordsModal, type RecordsTarget } from "./RecordsModal.tsx";

const LEVEL_LABEL: Record<RiLevel, { one: string; many: string; of: string }> = {
  campaign: { one: "campanha", many: "Campanhas", of: "da campanha" },
  ad_group: { one: "conjunto", many: "Conjuntos", of: "do conjunto" },
  ad: { one: "anúncio", many: "Anúncios", of: "do anúncio" },
};

const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export interface ResultsView {
  filters: DashboardFilters;
  period: ResolvedPeriod;
  onPeriod: (patch: Partial<DashboardFilters>) => void;
  tab: "visao" | (typeof RANKED_PROFILES)[number];
  campaignId: string | null;
  adGroupId: string | null;
  metric: RiRankMetric;
  search: string;
  onChange: (patch: { campanha?: string | null; conjunto?: string | null; ordem?: RiRankMetric; busca?: string }) => void;
}

/**
 * Etapa 39.4 — números da planilha do cliente no período: cards, perfis por dia,
 * campanhas e, em cada aba de perfil, o ranking de campanhas → conjuntos → anúncios.
 */
export function ResultsDashboard({ source, view, clientName }: { source: RiSource; view: ResultsView; clientName: string }) {
  const clientId = source.client_id;
  const range = view.period.current;
  const [records, setRecords] = useState<RecordsTarget | null>(null);

  return (
    <div className="space-y-4">
      <PeriodPicker filters={view.filters} period={view.period} onChange={view.onPeriod} />
      {!source.last_success_at ? (
        <Alert tone="info">A planilha ainda não foi lida. Use "Atualizar agora" acima ou espere a próxima leitura automática.</Alert>
      ) : (<>
        <ExportBar clientId={clientId} clientName={clientName} range={range} profile={view.tab === "visao" ? "todos" : view.tab}
          label={view.tab === "visao" ? "todos os perfis" : PROFILE_LOOK[view.tab].plural.toLowerCase()} />
        {view.tab === "visao" ? (
        <Overview clientId={clientId} period={view.period} onRecords={setRecords} />
      ) : (
        <ProfileTab key={view.tab} clientId={clientId} profile={view.tab} period={view.period} view={view} onRecords={setRecords} />
        )}
      </>)}
      {records && <RecordsModal clientId={clientId} range={range} target={records} onClose={() => setRecords(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Visão geral

function Overview({ clientId, period, onRecords }: { clientId: string; period: ResolvedPeriod; onRecords: (t: RecordsTarget) => void }) {
  const cur = useRiResults(clientId, period.current, "campaign");
  const prev = useRiResults(clientId, period.previous, "campaign");
  const daily = useRiDaily(clientId, period.current);
  if (cur.error) return <Alert tone="error">{errorMessage(cur.error)}</Alert>;
  if (!cur.data) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  const t = cur.data.totals;
  const p = prev.data?.totals;

  return (
    <div className="space-y-4" data-testid="ri-overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ri-cards">
        <Kpi label="Contatos únicos" value={int(t.contacts)} previous={p?.contacts} current={t.contacts} testid="ri-card-contacts" />
        {RANKED_PROFILES.map((pr) => (
          <Kpi key={pr} label={PROFILE_LOOK[pr].plural} value={int(t[pr])} sub={`${pct(t.contacts ? (t[pr] / t.contacts) * 100 : null)} dos contatos`}
            previous={p?.[pr]} current={t[pr]} color={PROFILE_LOOK[pr].color} testid={`ri-card-${pr}`} />
        ))}
        <Kpi label="Não identificados" value={int(t.nao_identificado)} sub="sem perfil reconhecido" color={PROFILE_LOOK.nao_identificado.color} testid="ri-card-nao_identificado" />
        <Kpi label="Classificados" value={pct(classifiedShare(t))} sub="contatos com perfil" testid="ri-card-classified" />
        <Kpi label="Com origem identificada" value={pct(t.contacts ? (t.with_origin / t.contacts) * 100 : null)} sub={`${int(t.with_origin)} de ${int(t.contacts)} contatos`} testid="ri-card-origin" />
        <Kpi label="Linhas no período" value={int(t.rows)} sub={`${int(cur.data.outside.no_date)} linha(s) sem data ficam fora`} testid="ri-card-rows" />
      </div>
      <CampaignGaps results={cur.data} profiles={RANKED_PROFILES} onRecords={onRecords} />

      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-slate-900">Distribuição dos perfis</h2>
        <ProfileBar totals={t} />
        <OriginNote results={cur.data} onRecords={onRecords} />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-slate-900">Contatos por dia</h2>
        <DailyChart range={period.current} rows={daily.data} error={daily.error} profiles={PROFILES} />
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Campanhas por perfil</h2>
          <p className="text-xs text-slate-500">Contatos únicos de cada perfil, contados na planilha</p>
        </div>
        {cur.data.items.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum contato do período foi ligado a uma campanha.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="ri-overview-campaigns">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Campanha</th>
                  <th className="px-2 py-2 text-right font-medium">Contatos</th>
                  {PROFILES.map((pr) => <th key={pr} className="px-2 py-2 text-right font-medium">{PROFILE_LOOK[pr].plural}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cur.data.items.map((i) => (
                  <tr key={i.id}>
                    <td className="max-w-64 truncate py-2 pr-3 font-medium text-slate-900" title={i.name}>{i.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{int(i.contacts)}</td>
                    {PROFILES.map((pr) => <td key={pr} className="px-2 py-2 text-right tabular-nums">{int(i[pr])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ReadNote results={cur.data} />
    </div>
  );
}

function Kpi({ label, value, sub, previous, current, color, testid, small }: {
  label: string; value: string; sub?: string; previous?: number; current?: number; color?: string; testid: string; small?: boolean;
}) {
  const change = previous != null && current != null && previous > 0 ? ((current - previous) / previous) * 100 : null;
  return (
    <Card className="p-4" data-testid={testid}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {color && <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}{label}
      </p>
      <p className={cn("mt-1 font-semibold tabular-nums text-slate-900", small ? "text-base leading-snug" : "text-2xl")} data-testid="ri-kpi-value">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      {previous != null && (
        <p className="text-xs text-slate-500" data-testid="ri-kpi-previous">
          Período anterior: {int(previous)}{change != null && <> ({formatChange(change)})</>}
        </p>
      )}
    </Card>
  );
}

/** Barra 100% com os 4 perfis (quantidade e % sempre escritas ao lado, não só a cor). */
function ProfileBar({ totals }: { totals: RiResults["totals"] }) {
  const total = PROFILES.reduce((s, p) => s + totals[p], 0);
  if (!total) return <p className="text-sm text-slate-500">Nenhum contato no período.</p>;
  return (
    <div className="space-y-2" data-testid="ri-profile-bar">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img"
        aria-label={PROFILES.map((p) => `${PROFILE_LOOK[p].plural}: ${totals[p]}`).join(", ")}>
        {PROFILES.filter((p) => totals[p] > 0).map((p) => (
          <div key={p} style={{ width: `${(totals[p] / total) * 100}%`, backgroundColor: PROFILE_LOOK[p].color }} title={`${PROFILE_LOOK[p].plural}: ${totals[p]}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {PROFILES.map((p) => (
          <li key={p} className="flex items-center gap-1.5 text-slate-600">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: PROFILE_LOOK[p].color }} aria-hidden />
            {PROFILE_LOOK[p].plural}: <strong className="tabular-nums text-slate-900">{int(totals[p])}</strong> ({pct((totals[p] / total) * 100)})
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">Um mesmo contato pode aparecer em mais de um perfil se a planilha tiver linhas diferentes para ele.</p>
    </div>
  );
}

/**
 * Aviso pedido pelo Ander (21/10/2026): quantos contatos de cada perfil estão sem campanha
 * preenchida na planilha, e quantos têm campanha preenchida que o CRM não achou. Eles contam
 * no total do perfil, mas não aparecem nas tabelas de campanha.
 */
function CampaignGaps({ results, profiles, onRecords }: {
  results: RiResults; profiles: readonly (typeof RANKED_PROFILES)[number][]; onRecords: (t: RecordsTarget) => void;
}) {
  const lines: { key: string; text: ReactNode; target: RecordsTarget }[] = [];
  for (const pr of profiles) {
    const g = results.gaps?.[pr];
    const plural = PROFILE_LOOK[pr].plural.toLowerCase();
    if (g && g.no_campaign > 0) lines.push({ key: `${pr}-blank`, text: <><strong>{int(g.no_campaign)} {plural}</strong> sem campanha preenchida na planilha.</>,
      target: { issue: "sem_campanha", profile: pr, title: `${PROFILE_LOOK[pr].plural} sem campanha na planilha` } });
    if (g && g.not_linked > 0) lines.push({ key: `${pr}-missing`,
      text: <><strong>{int(g.not_linked)} {plural}</strong> com campanha preenchida, mas que o CRM não conseguiu ligar (nome diferente do Meta/Google, nome repetido em mais de uma campanha ou conta não ligada a este cliente).</>,
      target: { issue: "campanha_nao_ligada", profile: pr, title: `${PROFILE_LOOK[pr].plural} com campanha não encontrada` } });
  }
  if (lines.length === 0) return null;
  return (
    <div data-testid="ri-campaign-gaps">
      <Alert tone="warning">
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l.key} className="flex flex-wrap items-center gap-x-2">
              <span>{l.text}</span>
              <button type="button" className="text-xs font-medium text-amber-900 underline" onClick={() => onRecords(l.target)}>Ver linhas</button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs">Eles contam no total, mas não aparecem nas tabelas de campanhas, conjuntos e criativos.</p>
      </Alert>
    </div>
  );
}

/** Quantos contatos ficaram sem origem segura (não entram em ranking), com o atalho para ver as linhas. */
function OriginNote({ results, onRecords }: { results: RiResults; onRecords: (t: RecordsTarget) => void }) {
  const t = results.totals;
  const problems: [string, number, RecordsTarget][] = [
    ["sem campanha, conjunto ou anúncio na planilha", t.no_origin, { issue: "sem_origem", title: "Linhas sem origem" }],
    ["com nome igual a mais de um item (nome ambíguo)", t.ambiguous, { issue: "nome_ambiguo", title: "Linhas com nome ambíguo" }],
    ["com origem que não existe no CRM", t.not_found, { issue: "nao_encontrada", title: "Linhas com origem não encontrada" }],
  ];
  const shown = problems.filter(([, n]) => n > 0);
  return (
    <div className="space-y-1 text-sm text-slate-600" data-testid="ri-origin-note">
      <p>
        Origem: <strong className="text-slate-900">{int(t.origin_ad)}</strong> linha(s) ligadas ao anúncio, <strong className="text-slate-900">{int(t.origin_ad_group)}</strong> só ao conjunto e{" "}
        <strong className="text-slate-900">{int(t.origin_campaign)}</strong> só à campanha{t.origin_by_name > 0 && <> ({int(t.origin_by_name)} pelo nome, sem ID)</>}.
      </p>
      {shown.length > 0 && (
        <ul className="space-y-0.5">
          {shown.map(([label, n, target]) => (
            <li key={label} className="flex flex-wrap items-center gap-2">
              <span><strong className="text-slate-900">{int(n)}</strong> linha(s) {label} — contam no total, fora dos rankings.</span>
              <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => onRecords(target)}>Ver linhas</button>
            </li>
          ))}
        </ul>
      )}
      {results.outside.no_date > 0 && (
        <p className="flex flex-wrap items-center gap-2">
          <span><strong className="text-slate-900">{int(results.outside.no_date)}</strong> linha(s) sem data ficam fora de qualquer período.</span>
          <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => onRecords({ issue: "sem_data", title: "Linhas sem data" })}>Ver linhas</button>
        </p>
      )}
    </div>
  );
}

function ReadNote({ results }: { results: RiResults }) {
  return (
    <p className="text-xs text-slate-500" data-testid="ri-read-note">
      Tudo aqui vem só da planilha (nada do gerenciador de anúncios), contado pela <strong>data do contato</strong>.
      {results.read_at && <> Dados da leitura de {formatDateTime(results.read_at)}.</>}
    </p>
  );
}

/** Contatos por dia (cada dia do período aparece; dia sem linha na planilha = 0 contatos). */
function DailyChart({ range, rows, error, profiles }: { range: DateRange; rows: RiDailyRow[] | undefined; error: unknown; profiles: RiProfile[] }) {
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = range.from; d <= range.to && out.length < 401; d = addDays(d, 1)) out.push(d);
    return out;
  }, [range.from, range.to]);
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!rows) return <div className="h-48 animate-pulse rounded-lg bg-slate-100" aria-label="Carregando" />;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return (
    <div className="space-y-2" data-testid="ri-daily">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legenda">
        {profiles.map((p) => (
          <li key={p} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: PROFILE_LOOK[p].color }} aria-hidden />{PROFILE_LOOK[p].plural}</li>
        ))}
      </ul>
      <TimeSeriesChart
        ariaLabel={`Contatos por dia: ${profiles.map((p) => PROFILE_LOOK[p].plural).join(", ")}`}
        lines={profiles.map((p) => ({ key: p, label: PROFILE_LOOK[p].plural, color: PROFILE_LOOK[p].color, values: days.map((d) => Number(byDay.get(d)?.[p] ?? 0)) }))}
        xLabels={days.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)}
        pointTitles={days.map((d) => formatDate(d))}
        formatValue={(v) => `${int(v)} contato(s)`}
        formatAxis={(v) => int(v)}
        height={200}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Abas por perfil

/**
 * Aba de um perfil (pedido do Ander, 21/10/2026): campanhas, conjuntos e criativos
 * aparecem juntos, cada um com a quantidade do perfil. Só números da planilha, nada do
 * gerenciador de anúncios (correção do Ander, 21/10/2026). Clicar numa campanha ou conjunto filtra as tabelas de baixo (sem trocar de tela).
 */
function ProfileTab({ clientId, profile, period, view, onRecords }: {
  clientId: string; profile: (typeof RANKED_PROFILES)[number]; period: ResolvedPeriod; view: ResultsView; onRecords: (t: RecordsTarget) => void;
}) {
  const look = PROFILE_LOOK[profile];
  const camps = useRiResults(clientId, period.current, "campaign");
  const prev = useRiResults(clientId, period.previous, "campaign");
  const setsAll = useRiResults(clientId, period.current, "ad_group");
  const adsAll = useRiResults(clientId, period.current, "ad");
  const sets = useRiResults(clientId, period.current, "ad_group", view.campaignId, null, Boolean(view.campaignId));
  const ads = useRiResults(clientId, period.current, "ad", view.campaignId, view.adGroupId, Boolean(view.campaignId || view.adGroupId));
  const daily = useRiDaily(clientId, period.current, view.campaignId, view.adGroupId);
  const setsShown = view.campaignId ? sets : setsAll;
  const adsShown = view.campaignId || view.adGroupId ? ads : adsAll;

  if (camps.error) return <Alert tone="error">{errorMessage(camps.error)}</Alert>;
  if (!camps.data) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  const t = camps.data.totals;
  const best = (r: RiResults | undefined) => {
    const top = r ? topFor(r.items, profile) : [];
    return top.length === 0 ? "—" : top.length === 1 ? `${top[0].name} (${int(top[0][profile])})` : `${top.length} empatados com ${int(top[0][profile])}`;
  };
  const campaignName = camps.data.items.find((i) => i.id === view.campaignId)?.name ?? "Campanha";
  const adGroupName = setsAll.data?.items.find((i) => i.id === view.adGroupId)?.name ?? "Conjunto";

  return (
    <div className="space-y-4" data-testid={`ri-tab-${profile}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={look.plural} value={int(t[profile])} sub={`${pct(t.contacts ? (t[profile] / t.contacts) * 100 : null)} dos ${int(t.contacts)} contatos`}
          previous={prev.data?.totals[profile]} current={t[profile]} color={look.color} testid="ri-profile-total" />
        <Kpi small label={`Campanha com mais ${look.plural.toLowerCase()}`} value={best(camps.data)} testid="ri-best-campaign" />
        <Kpi small label={`Conjunto com mais ${look.plural.toLowerCase()}`} value={best(setsAll.data)} testid="ri-best-adset" />
        <Kpi small label={`Criativo com mais ${look.plural.toLowerCase()}`} value={best(adsAll.data)} testid="ri-best-ad" />
      </div>
      <CampaignGaps results={camps.data} profiles={[profile]} onRecords={onRecords} />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-64">
          <Field label="Ordenar por">
            {(id) => (
              <Select id={id} value={view.metric} onChange={(e) => view.onChange({ ordem: e.target.value as RiRankMetric })}>
                <option value="count">Quantidade de {look.plural.toLowerCase()}</option>
                <option value="share">% de {look.plural.toLowerCase()} no item</option>
              </Select>
            )}
          </Field>
        </div>
        <div className="w-full sm:w-64">
          <Field label="Buscar pelo nome">
            {(id) => (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <Input id={id} className="pl-8" value={view.search} onChange={(e) => view.onChange({ busca: e.target.value })} placeholder="Campanha, conjunto ou criativo" />
              </div>
            )}
          </Field>
        </div>
        {(view.campaignId || view.adGroupId) && (
          <div className="flex flex-wrap items-center gap-2 pb-1 text-sm" data-testid="ri-active-filters">
            <span className="text-slate-500">Mostrando só:</span>
            {view.campaignId && <FilterChip label={`Campanha: ${campaignName}`} onClear={() => view.onChange({ campanha: null, conjunto: null })} />}
            {view.adGroupId && <FilterChip label={`Conjunto: ${adGroupName}`} onClear={() => view.onChange({ conjunto: null })} />}
          </div>
        )}
      </Card>

      <LevelSection title="Campanhas" level="campaign" query={camps} profile={profile} view={view} onRecords={onRecords}
        selectedId={view.campaignId} onOpen={(r) => view.onChange(view.campaignId === r.id ? { campanha: null, conjunto: null } : { campanha: r.id, conjunto: null })}
        openHint="Clique na campanha para ver só os conjuntos e criativos dela." />
      <LevelSection title={view.campaignId ? `Conjuntos de ${campaignName}` : "Conjuntos de anúncios"} level="ad_group" query={setsShown} profile={profile} view={view} onRecords={onRecords}
        selectedId={view.adGroupId} onOpen={(r) => view.onChange(view.adGroupId === r.id ? { conjunto: null } : { campanha: r.campaign_id, conjunto: r.id })}
        openHint="Clique no conjunto para ver só os criativos dele." />
      <LevelSection title={view.adGroupId ? `Criativos de ${adGroupName}` : view.campaignId ? `Criativos de ${campaignName}` : "Criativos (anúncios)"} level="ad"
        query={adsShown} profile={profile} view={view} onRecords={onRecords} />

      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-slate-900">{look.plural} por dia{view.campaignId && <span className="font-normal text-slate-500"> · {view.adGroupId ? adGroupName : campaignName}</span>}</h2>
        <DailyChart range={period.current} rows={daily.data} error={daily.error} profiles={[profile]} />
      </Card>
      <ReadNote results={camps.data} />
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-800 ring-1 ring-inset ring-blue-200">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label={`Tirar o filtro ${label}`} className="rounded-full px-1 text-blue-700 hover:bg-blue-100">✕</button>
    </span>
  );
}

const SHOW_FIRST = 10;

/** Uma tabela do perfil (campanhas, conjuntos ou criativos) com as 10 primeiras e "Ver todos". */
function LevelSection({ title, level, query, profile, view, onRecords, onOpen, selectedId, openHint }: {
  title: string; level: RiLevel; query: { data?: RiResults; error: unknown }; profile: (typeof RANKED_PROFILES)[number]; view: ResultsView;
  onRecords: (t: RecordsTarget) => void; onOpen?: (r: RiResultItem) => void; selectedId?: string | null; openHint?: string;
}) {
  const [all, setAll] = useState(false);
  const look = PROFILE_LOOK[profile];
  const term = view.search.trim().toLocaleLowerCase("pt-BR");
  const data = query.data;
  const ranked = data ? rankItems(data.items, profile, view.metric).filter((r) => !term
    || [r.name, r.campaign_name, r.ad_group_name].some((n) => n?.toLocaleLowerCase("pt-BR").includes(term))) : [];
  const total = ranked.reduce((sum, r) => sum + r[profile], 0);
  const shown = all ? ranked : ranked.slice(0, SHOW_FIRST);
  const without = data ? data.items.filter((i) => i[profile] === 0).length : 0;
  const one = LEVEL_LABEL[level].one === "anúncio" ? "criativo" : LEVEL_LABEL[level].one;

  return (
    <Card className="space-y-3 p-5" data-testid={`ri-level-${level}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {data && ranked.length > 0 && (
          <p className="text-sm text-slate-600" data-testid="ri-level-summary">
            <strong className="text-slate-900">{int(total)}</strong> {look.plural.toLowerCase()} vieram de <strong className="text-slate-900">{int(ranked.length)}</strong> {one}(s)
          </p>
        )}
      </div>
      {query.error ? <Alert tone="error">{errorMessage(query.error)}</Alert>
        : !data ? <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-label="Carregando" />
        : ranked.length === 0 ? (
          <p className="text-sm text-slate-500" data-testid="ri-ranking-empty">
            {term ? "Nenhum item com esse nome." : `Nenhum(a) ${one} trouxe ${look.plural.toLowerCase()} neste período.`}
          </p>
        ) : (
          // relative: o texto só para leitor de tela (sr-only) fica preso aqui e não alarga a página no celular.
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="ri-ranking">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">{one.charAt(0).toUpperCase() + one.slice(1)}</th>
                  <th className="px-2 py-2 text-right font-medium">{look.plural}</th>
                  <th className="px-2 py-2 text-right font-medium">% no item</th>
                  <th className="px-2 py-2 text-right font-medium">Contatos</th>
                  <th className="py-2 pl-2"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => {
                  const selected = selectedId === r.id;
                  return (
                    <tr key={r.id} data-testid="ri-ranking-row" className={cn(selected && "bg-blue-50")}>
                      <td className="py-2 pr-2 tabular-nums text-slate-500">{r.position}{r.tied && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-600">empate</span>}</td>
                      <td className="max-w-80 py-2 pr-3">
                        <div className="flex items-center gap-2">
                          {level === "ad" && (r.thumbnail_url
                            ? <img src={r.thumbnail_url} alt="" className="size-10 shrink-0 rounded object-cover ring-1 ring-slate-200" loading="lazy" />
                            : <span className="grid size-10 shrink-0 place-items-center rounded bg-slate-100 text-[10px] text-slate-400" aria-hidden>sem imagem</span>)}
                          <div className="min-w-0">
                            {onOpen ? (
                              <button type="button" className="block max-w-full truncate text-left font-medium text-blue-700 hover:underline" title={selected ? `Mostrar todos de novo` : openHint}
                                onClick={() => onOpen(r)}>{r.name}</button>
                            ) : <span className="block truncate font-medium text-slate-900" title={r.name}>{r.name}</span>}
                            {level !== "campaign" && (
                              <span className="block truncate text-xs text-slate-500">{level === "ad" ? [r.campaign_name, r.ad_group_name].filter(Boolean).join(" › ") : r.campaign_name}</span>
                            )}
                            {r.by_name > 0 && <span className="text-[11px] text-amber-700">{int(r.by_name)} linha(s) ligadas pelo nome</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-base font-semibold tabular-nums text-slate-900">{int(r[profile])}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{pct(profileShare(r, profile))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{int(r.contacts)}</td>
                      <td className="py-2 pl-2 text-right">
                        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => onRecords({
                          title: `${look.plural} · ${r.name}`, profile,
                          campaignId: level === "campaign" ? r.id : null, adGroupId: level === "ad_group" ? r.id : null, adId: level === "ad" ? r.id : null,
                        })}>
                          <ListChecks className="size-3.5" aria-hidden /> Registros
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {ranked.length > SHOW_FIRST && (
        <Button type="button" variant="secondary" onClick={() => setAll((a) => !a)} data-testid="ri-level-more">
          {all ? "Mostrar só os 10 primeiros" : `Ver todos (${int(ranked.length)})`}
        </Button>
      )}
      {data && (without > 0 || data.scope_without_level > 0) && (
        <p className="text-xs text-slate-500" data-testid="ri-ranking-note">
          {without > 0 && <>{int(without)} {one}(s) com contatos, mas nenhum {look.label.toLowerCase()}, não aparece(m). </>}
          {data.scope_without_level > 0 && <>{int(data.scope_without_level)} contato(s) sem {one} {level === "campaign" ? "identificada" : "identificado"} não entram nesta tabela.</>}
        </p>
      )}
    </Card>
  );
}
