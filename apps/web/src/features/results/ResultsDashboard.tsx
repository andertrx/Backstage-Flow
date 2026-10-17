import {
  addDays, classifiedShare, costPerContact, type DateRange, profileShare, rankItems, type RiLevel, type RiProfile,
  type RiRankMetric, type RiResultItem, type RiResults, type RiSpend, topFor,
} from "@backstage/shared";
import { ChevronRight, ListChecks, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { type DashboardFilters, type ResolvedPeriod } from "@/features/dashboard/filters.ts";
import { PeriodPicker } from "@/features/structure/PeriodPicker.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatChange, formatDate, formatDateTime, formatMoney } from "@/lib/format.ts";
import { type RiDailyRow, type RiSource, useRiDaily, useRiResults } from "./api.ts";
import { PROFILE_LOOK, PROFILES, RANKED_PROFILES } from "./look.ts";
import { RecordsModal, type RecordsTarget } from "./RecordsModal.tsx";

const LEVEL_LABEL: Record<RiLevel, { one: string; many: string; of: string }> = {
  campaign: { one: "campanha", many: "Campanhas", of: "da campanha" },
  ad_group: { one: "conjunto", many: "Conjuntos", of: "do conjunto" },
  ad: { one: "anúncio", many: "Anúncios", of: "do anúncio" },
};

const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const spendText = (spend: RiSpend[]) => (spend.length ? spend.map((s) => formatMoney(s.spend_micros / 1e6, s.currency)).join(" + ") : "—");

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
export function ResultsDashboard({ source, view }: { source: RiSource; view: ResultsView }) {
  const clientId = source.client_id;
  const range = view.period.current;
  const [records, setRecords] = useState<RecordsTarget | null>(null);

  return (
    <div className="space-y-4">
      <PeriodPicker filters={view.filters} period={view.period} onChange={view.onPeriod} />
      {!source.last_success_at ? (
        <Alert tone="info">A planilha ainda não foi lida. Use "Atualizar agora" acima ou espere a próxima leitura automática.</Alert>
      ) : view.tab === "visao" ? (
        <Overview clientId={clientId} period={view.period} onRecords={setRecords} />
      ) : (
        <ProfileTab key={view.tab} clientId={clientId} profile={view.tab} period={view.period} view={view} onRecords={setRecords} />
      )}
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
          <p className="text-xs text-slate-500">Contatos únicos de cada perfil · investimento do Meta/Google no mesmo período</p>
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
                  <th className="py-2 pl-2 text-right font-medium">Investimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cur.data.items.map((i) => (
                  <tr key={i.id}>
                    <td className="max-w-64 truncate py-2 pr-3 font-medium text-slate-900" title={i.name}>{i.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{int(i.contacts)}</td>
                    {PROFILES.map((pr) => <td key={pr} className="px-2 py-2 text-right tabular-nums">{int(i[pr])}</td>)}
                    <td className="py-2 pl-2 text-right tabular-nums">{spendText(i.spend)}</td>
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
      Contatos pela <strong>data do contato na planilha</strong>; investimento pela data de veiculação no Meta/Google.
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

function ProfileTab({ clientId, profile, period, view, onRecords }: {
  clientId: string; profile: (typeof RANKED_PROFILES)[number]; period: ResolvedPeriod; view: ResultsView; onRecords: (t: RecordsTarget) => void;
}) {
  const look = PROFILE_LOOK[profile];
  const level: RiLevel = view.adGroupId ? "ad" : view.campaignId ? "ad_group" : "campaign";
  const camps = useRiResults(clientId, period.current, "campaign");
  const prev = useRiResults(clientId, period.previous, "campaign");
  const sets = useRiResults(clientId, period.current, "ad_group");
  const ads = useRiResults(clientId, period.current, "ad");
  const drilled = useRiResults(clientId, period.current, level, view.campaignId, view.adGroupId, level !== "campaign");
  const daily = useRiDaily(clientId, period.current, view.campaignId, view.adGroupId);
  const ranking = level === "campaign" ? camps : drilled;

  if (camps.error) return <Alert tone="error">{errorMessage(camps.error)}</Alert>;
  if (!camps.data) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />;
  const t = camps.data.totals;
  const best = (r: RiResults | undefined) => {
    const top = r ? topFor(r.items, profile) : [];
    return top.length === 0 ? "—" : top.length === 1 ? `${top[0].name} (${int(top[0][profile])})` : `${top.length} empatados com ${int(top[0][profile])}`;
  };
  const campaignName = sets.data?.items.find((i) => i.campaign_id === view.campaignId)?.campaign_name
    ?? camps.data.items.find((i) => i.id === view.campaignId)?.name ?? "Campanha";
  const adGroupName = ads.data?.items.find((i) => i.ad_group_id === view.adGroupId)?.ad_group_name
    ?? sets.data?.items.find((i) => i.id === view.adGroupId)?.name ?? "Conjunto";

  return (
    <div className="space-y-4" data-testid={`ri-tab-${profile}`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={look.plural} value={int(t[profile])} sub={`${pct(t.contacts ? (t[profile] / t.contacts) * 100 : null)} dos ${int(t.contacts)} contatos`}
          previous={prev.data?.totals[profile]} current={t[profile]} color={look.color} testid="ri-profile-total" />
        <Kpi small label={`Campanha com mais ${look.plural.toLowerCase()}`} value={best(camps.data)} testid="ri-best-campaign" />
        <Kpi small label={`Conjunto com mais ${look.plural.toLowerCase()}`} value={best(sets.data)} testid="ri-best-adset" />
        <Kpi small label={`Anúncio com mais ${look.plural.toLowerCase()}`} value={best(ads.data)} testid="ri-best-ad" />
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold text-slate-900">{look.plural} por dia{view.campaignId && <span className="font-normal text-slate-500"> · {level === "ad" ? adGroupName : campaignName}</span>}</h2>
        <DailyChart range={period.current} rows={daily.data} error={daily.error} profiles={[profile]} />
      </Card>

      <Card className="space-y-3 p-5">
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Nível do ranking" data-testid="ri-breadcrumb">
          <button type="button" className={cn("font-medium", level === "campaign" ? "text-slate-900" : "text-blue-700 hover:underline")}
            onClick={() => view.onChange({ campanha: null, conjunto: null, busca: "" })}>Campanhas</button>
          {view.campaignId && <><ChevronRight className="size-4 text-slate-400" aria-hidden />
            <button type="button" className={cn("max-w-56 truncate font-medium", level === "ad_group" ? "text-slate-900" : "text-blue-700 hover:underline")}
              onClick={() => view.onChange({ conjunto: null, busca: "" })}>{campaignName}</button></>}
          {view.adGroupId && <><ChevronRight className="size-4 text-slate-400" aria-hidden /><span className="max-w-56 truncate font-medium text-slate-900">{adGroupName}</span></>}
        </nav>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <Field label="Ordenar por">
              {(id) => (
                <Select id={id} value={view.metric} onChange={(e) => view.onChange({ ordem: e.target.value as RiRankMetric })}>
                  <option value="count">Quantidade de {look.plural.toLowerCase()}</option>
                  <option value="share">% de {look.plural.toLowerCase()} no item</option>
                  <option value="cost">Custo por {look.label.toLowerCase()} (menor primeiro)</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="w-full sm:w-64">
            <Field label="Buscar pelo nome">
              {(id) => (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <Input id={id} className="pl-8" value={view.search} onChange={(e) => view.onChange({ busca: e.target.value })} placeholder={`Nome ${LEVEL_LABEL[level].of}`} />
                </div>
              )}
            </Field>
          </div>
        </div>
        {ranking.error ? <Alert tone="error">{errorMessage(ranking.error)}</Alert>
          : !ranking.data ? <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-label="Carregando" />
          : <RankingTable results={ranking.data} level={level} profile={profile} view={view} onRecords={onRecords} />}
      </Card>
      <ReadNote results={camps.data} />
    </div>
  );
}

function RankingTable({ results, level, profile, view, onRecords }: {
  results: RiResults; level: RiLevel; profile: (typeof RANKED_PROFILES)[number]; view: ResultsView; onRecords: (t: RecordsTarget) => void;
}) {
  const look = PROFILE_LOOK[profile];
  const term = view.search.trim().toLocaleLowerCase("pt-BR");
  const ranked = rankItems(results.items, profile, view.metric).filter((r) => !term || r.name.toLocaleLowerCase("pt-BR").includes(term));
  const open = (r: RiResultItem) =>
    level === "campaign" ? view.onChange({ campanha: r.id, conjunto: null, busca: "" }) : level === "ad_group" ? view.onChange({ conjunto: r.id, busca: "" }) : null;
  const without = results.items.filter((i) => i[profile] === 0).length;

  return (
    <div className="space-y-2">
      {ranked.length === 0 ? (
        <p className="text-sm text-slate-500" data-testid="ri-ranking-empty">
          {term ? "Nenhum item com esse nome." : `Nenhum(a) ${LEVEL_LABEL[level].one} trouxe ${look.plural.toLowerCase()} neste período.`}
        </p>
      ) : (
        // relative: o texto só para leitor de tela (sr-only) fica preso aqui e não alarga a página no celular.
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid="ri-ranking">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">{LEVEL_LABEL[level].many.replace(/s$/, "")}</th>
                <th className="px-2 py-2 text-right font-medium">{look.plural}</th>
                <th className="px-2 py-2 text-right font-medium">% no item</th>
                <th className="px-2 py-2 text-right font-medium">Contatos</th>
                <th className="px-2 py-2 text-right font-medium">Investimento</th>
                <th className="px-2 py-2 text-right font-medium">Custo por {look.label.toLowerCase()}</th>
                <th className="py-2 pl-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranked.map((r) => {
                const cost = costPerContact(r.spend, r[profile]);
                return (
                  <tr key={r.id} data-testid="ri-ranking-row">
                    <td className="py-2 pr-2 tabular-nums text-slate-500">{r.position}{r.tied && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-600">empate</span>}</td>
                    <td className="max-w-72 py-2 pr-3">
                      {level === "ad" ? (
                        <span className="block truncate font-medium text-slate-900" title={r.name}>{r.name}</span>
                      ) : (
                        <button type="button" className="block max-w-full truncate text-left font-medium text-blue-700 hover:underline" title={`Abrir ${r.name}`} onClick={() => open(r)}>{r.name}</button>
                      )}
                      {level !== "campaign" && <span className="block truncate text-xs text-slate-500">{level === "ad" ? r.ad_group_name : r.campaign_name}</span>}
                      {r.by_name > 0 && <span className="text-[11px] text-amber-700">{int(r.by_name)} linha(s) ligadas pelo nome</span>}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900">{int(r[profile])}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{pct(profileShare(r, profile))}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{int(r.contacts)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{spendText(r.spend)}</td>
                    <td className="px-2 py-2 text-right tabular-nums" title={cost ? undefined : "Sem investimento informado no período (ou em mais de uma moeda)"}>
                      {cost ? formatMoney(cost.micros / 1e6, cost.currency) : "—"}
                    </td>
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
      <p className="text-xs text-slate-500" data-testid="ri-ranking-note">
        Ordem pela {view.metric === "count" ? "quantidade" : view.metric === "share" ? "% do perfil" : "custo por contato"}; itens empatados ficam na mesma posição.
        {without > 0 && <> {int(without)} {LEVEL_LABEL[level].one}(s) com contatos, mas nenhum {look.label.toLowerCase()}, não aparece(m).</>}
        {results.scope_without_level > 0 && <> {int(results.scope_without_level)} contato(s) {level === "campaign" ? "sem campanha identificada" : `sem ${LEVEL_LABEL[level].one} identificado`} não entram aqui.</>}
      </p>
    </div>
  );
}
