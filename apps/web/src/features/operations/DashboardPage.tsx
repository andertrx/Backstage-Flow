import { OPS_DASHBOARD_PERIODS, type OpsDashboardPeriod, opsDashboardRange, opsToday } from "@backstage/shared";
import { AlarmClock, Building2, CalendarDays, Gauge, Handshake, Hourglass, Link2, type LucideIcon, PauseCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { type OpsDashboard, type OpsDashboardFilters, type OpsDashboardTaskRef, useOpsDashboard } from "./dashboardApi.ts";
import { RequireOps } from "./OpsLayout.tsx";
import { OpsModuleHeader } from "./OpsHeader.tsx";
import { SavedViews } from "./SavedViews.tsx";
import { TaskDetailHost, useOpenTask, useTasksContext } from "./tasksContext.tsx";

const VIEW_KEYS = ["sector_id", "client_id", "person_id", "period"] as const;

/** Endereço da Central de Tarefas com os filtros do painel + o do atalho. */
function tasksLink(ctx: OpsDashboardFilters, extra: Record<string, string>) {
  const p = new URLSearchParams();
  for (const k of ["sector_id", "client_id", "person_id"] as const) if (ctx[k]) p.set(k, ctx[k] as string);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `/operacoes/tarefas?${p.toString()}`;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Cartão de indicador. Só vira link quando existe a lista certinha por trás. */
function StatCard({ label, value, hint, to, tone = "neutral", testId }: {
  label: string;
  value: string;
  hint?: string;
  to?: string;
  tone?: "neutral" | "danger" | "warning";
  testId: string;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-3xl font-bold tabular-nums",
        tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : "text-slate-900")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const base = "block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200";
  return to ? (
    <Link to={to} className={cn(base, "transition hover:ring-blue-400")} data-testid={testId}>{body}</Link>
  ) : (
    <div className={base} data-testid={testId}>{body}</div>
  );
}

/** Barra horizontal de magnitude (uma cor só; o número fica escrito ao lado). */
function Bar({ value, max, tone = "blue" }: { value: number; max: number; tone?: "blue" | "red" }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100" aria-hidden>
      <div className={cn("h-2 rounded-full", tone === "red" ? "bg-red-500" : "bg-blue-500")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Section({ title, icon: Icon, children, testId, right }: { title: string; icon: LucideIcon; children: React.ReactNode; testId: string; right?: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-5" data-testid={testId}>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-blue-600" aria-hidden />
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </Card>
  );
}

function TaskRefList({ items, empty, detail, onOpen, testId }: {
  items: OpsDashboardTaskRef[];
  empty: string;
  detail: (t: OpsDashboardTaskRef) => string;
  onOpen: (id: string) => void;
  testId: string;
}) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100" data-testid={testId}>
      {items.map((t) => (
        <li key={t.id}>
          <button type="button" className="flex w-full items-center gap-3 py-2 text-left text-sm hover:text-blue-700" onClick={() => onOpen(t.id)}>
            <span className="text-xs font-semibold text-slate-400">#{t.number}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.title}</span>
            <span className="shrink-0 text-xs text-slate-500">{detail(t)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DashboardBody({ d, f, onOpen }: { d: OpsDashboard; f: OpsDashboardFilters; onOpen: (id: string) => void }) {
  const c = d.cards;
  const maxSector = Math.max(0, ...d.by_sector.map((s) => s.abertas));
  const maxStatus = Math.max(0, ...d.by_status.map((s) => s.n));
  const maxPerson = Math.max(0, ...d.by_person.map((p) => p.abertas));
  const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="ops-dash-cards">
        <StatCard testId="ops-dash-abertas" label="Em aberto" value={fmt(c.abertas)} hint={`${fmt(c.andamento)} em andamento`} to={tasksLink(f, { abertas: "1" })} />
        <StatCard testId="ops-dash-atrasadas" label="Atrasadas" value={fmt(c.atrasadas)} tone={c.atrasadas > 0 ? "danger" : "neutral"} to={tasksLink(f, { due: "atrasadas" })} />
        <StatCard testId="ops-dash-hoje" label="Vencem hoje" value={fmt(c.vencem_hoje)} tone={c.vencem_hoje > 0 ? "warning" : "neutral"} to={tasksLink(f, { due: "hoje", abertas: "1" })} />
        <StatCard testId="ops-dash-7d" label="Próximos 7 dias" value={fmt(c.vencem_7d)} hint="depois de hoje" />
        <StatCard testId="ops-dash-sem-dono" label="Sem responsável" value={fmt(c.sem_responsavel)} to={tasksLink(f, { person_id: "nenhum", abertas: "1" })} />
        <StatCard testId="ops-dash-bloqueadas" label="Bloqueadas" value={fmt(c.bloqueadas)} hint="status bloqueado ou dependência aberta" />
        <StatCard testId="ops-dash-aguardando" label="Aguardando cliente" value={fmt(c.aguardando_cliente)} />
        <StatCard testId="ops-dash-paradas" label="Paradas" value={fmt(c.paradas)} hint="sem movimento há mais de 7 dias" tone={c.paradas > 0 ? "warning" : "neutral"} />
        <StatCard testId="ops-dash-concluidas" label="Concluídas no período" value={fmt(c.concluidas)} />
        <StatCard testId="ops-dash-media" label="Tempo médio" value={c.media_dias === null ? "—" : `${c.media_dias.toLocaleString("pt-BR")} d`}
          hint="da criação à conclusão" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Por setor" icon={Building2} testId="ops-dash-sectors">
          {d.by_sector.length === 0 ? <p className="text-sm text-slate-500">Nenhuma tarefa nos setores com esses filtros.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="py-1">Setor</th><th className="w-1/3 py-1 pl-3">Em aberto</th><th className="py-1 pl-3 text-right">Atrasadas</th><th className="py-1 pl-3 text-right">Bloqueadas</th><th className="py-1 pl-3 text-right">Concluídas</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.by_sector.map((s) => (
                  <tr key={s.sector_id} data-testid="ops-dash-sector-row">
                    <td className="py-2"><Link className="inline-flex items-center gap-2 font-medium text-slate-800 hover:text-blue-700" to={tasksLink({ ...f, sector_id: s.sector_id }, { abertas: "1" })}>
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />{s.name}</Link></td>
                    <td className="py-2 pl-3"><div className="flex items-center gap-2"><Bar value={s.abertas} max={maxSector} /><span className="w-8 text-right tabular-nums text-slate-700">{fmt(s.abertas)}</span></div></td>
                    <td className={cn("py-2 pl-3 text-right tabular-nums", s.atrasadas > 0 ? "font-semibold text-red-600" : "text-slate-500")}>{fmt(s.atrasadas)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-slate-600">{fmt(s.bloqueadas)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-slate-600">{fmt(s.concluidas)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Section>

        <Section title="Em aberto por status" icon={Gauge} testId="ops-dash-status">
          {d.by_status.length === 0 ? <p className="text-sm text-slate-500">Nenhuma tarefa em aberto.</p> : (
            <ul className="space-y-2">
              {d.by_status.map((s) => (
                <li key={s.status_id} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm" data-testid="ops-dash-status-row">
                  <span className="flex items-center gap-2 truncate text-slate-700"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />{s.name}</span>
                  <Bar value={s.n} max={maxStatus} />
                  <span className="text-right tabular-nums text-slate-700">{fmt(s.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Carga por pessoa (responsável principal)" icon={Hourglass} testId="ops-dash-people">
          {d.by_person.length === 0 ? <p className="text-sm text-slate-500">Ninguém com tarefa em aberto.</p> : (
            <ul className="space-y-2">
              {d.by_person.map((p) => (
                <li key={p.user_id} className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-2 text-sm" data-testid="ops-dash-person-row">
                  <Link className="truncate text-slate-700 hover:text-blue-700" to={tasksLink({ ...f, person_id: p.user_id }, { abertas: "1" })}>{p.name}</Link>
                  <Bar value={p.abertas} max={maxPerson} />
                  <span className="text-right tabular-nums text-slate-700">{fmt(p.abertas)}{p.atrasadas > 0 && <span className="text-red-600"> · {fmt(p.atrasadas)} atr.</span>}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-400">As 15 pessoas com mais atrasadas e mais tarefas em aberto.</p>
        </Section>

        <Section title="Gargalos" icon={AlarmClock} testId="ops-dash-bottlenecks">
          <div className="space-y-4">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><PauseCircle className="size-3.5" aria-hidden />Paradas há mais de 7 dias</p>
              <TaskRefList items={d.stalled} empty="Nenhuma tarefa parada." detail={(t) => plural(t.dias ?? 0, "dia", "dias")} onOpen={onOpen} testId="ops-dash-stalled" />
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Link2 className="size-3.5" aria-hidden />Bloqueadas</p>
              <TaskRefList items={d.blocked} empty="Nenhuma tarefa bloqueada." onOpen={onOpen} testId="ops-dash-blocked"
                detail={(t) => (t.dependencias ?? 0) > 0 ? `espera ${plural(t.dependencias ?? 0, "tarefa", "tarefas")}` : "status bloqueado"} />
            </div>
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {d.clients_waiting && (
          <Section title="Clientes parados na etapa (mais de 14 dias)" icon={Building2} testId="ops-dash-clients">
            {d.clients_waiting.length === 0 ? <p className="text-sm text-slate-500">Nenhum cliente parado.</p> : (
              <ul className="divide-y divide-slate-100">
                {d.clients_waiting.map((c) => (
                  <li key={c.client_id}>
                    <Link to={`/operacoes/clientes?cliente=${c.client_id}`} className="flex items-center gap-2 py-2 text-sm hover:text-blue-700">
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{c.stage} · {plural(c.dias, "dia", "dias")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
        <Section title="Reuniões" icon={CalendarDays} testId="ops-dash-meetings">
          <p className="text-sm text-slate-700"><b className="tabular-nums">{fmt(d.meetings_today)}</b> {d.meetings_today === 1 ? "reunião hoje" : "reuniões hoje"}</p>
          <p className="text-sm text-slate-700"><b className="tabular-nums">{fmt(d.meeting_pending)}</b> {d.meeting_pending === 1 ? "pendência de reunião ainda sem tarefa" : "pendências de reunião ainda sem tarefa"}</p>
          <Link to="/operacoes/reunioes" className="inline-block text-sm font-semibold text-blue-700 hover:underline">Abrir reuniões</Link>
        </Section>
        {d.leads_overdue !== null && (
          <Section title="Comercial" icon={Handshake} testId="ops-dash-leads">
            <p className="text-sm text-slate-700"><b className={cn("tabular-nums", d.leads_overdue > 0 && "text-red-600")}>{fmt(d.leads_overdue)}</b> {d.leads_overdue === 1 ? "lead com a próxima ação atrasada" : "leads com a próxima ação atrasada"}</p>
            <Link to="/operacoes/comercial" className="inline-block text-sm font-semibold text-blue-700 hover:underline">Abrir comercial</Link>
          </Section>
        )}
      </div>
    </div>
  );
}

/** Painel operacional (36.7): indicadores reais, só do que a pessoa pode ver. */
export function DashboardPage() {
  const ctx = useTasksContext();
  const { open } = useOpenTask();
  const [sector, setSector] = useState("");
  const [client, setClient] = useState("");
  const [person, setPerson] = useState("");
  const [period, setPeriod] = useState<OpsDashboardPeriod>(30);
  const today = opsToday();
  const f = useMemo<OpsDashboardFilters>(() => {
    const out: OpsDashboardFilters = { ...opsDashboardRange(period, today) };
    if (sector) out.sector_id = sector;
    if (client) out.client_id = client;
    if (person) out.person_id = person;
    return out;
  }, [sector, client, person, period, today]);
  const dash = useOpsDashboard(f);
  const active = Boolean(sector || client || person || period !== 30);

  return (
    <div className="space-y-4" data-testid="ops-dashboard">
      <OpsModuleHeader number="01" icon={Gauge} title="Painel operacional"
        description="Como está a operação agora: prazos, gargalos, setores e pessoas. Só conta o que você pode ver." />
      <div className="flex flex-wrap items-center gap-2" data-testid="ops-dash-filters">
        <Select aria-label="Filtrar por setor" className="w-auto" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">Todos os setores</option>
          {ctx.sectors.filter((s) => s.status !== "arquivado").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por cliente" className="w-auto" value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">Todos os clientes</option>
          {ctx.directory.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por pessoa" className="w-auto" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Todas as pessoas</option>
          {ctx.directory.people.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
        </Select>
        <Select aria-label="Período das concluídas" className="w-auto" value={String(period)} onChange={(e) => setPeriod(Number(e.target.value) as OpsDashboardPeriod)}>
          {OPS_DASHBOARD_PERIODS.map((p) => <option key={p} value={p}>Concluídas: últimos {p} dias</option>)}
        </Select>
        {active && <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setSector(""); setClient(""); setPerson(""); setPeriod(30); }}>Limpar filtros</Button>}
      </div>
      <SavedViews page="painel" keys={VIEW_KEYS} current={{ sector_id: sector, client_id: client, person_id: person, period: period === 30 ? "" : String(period) }}
        onApply={(v) => {
          setSector(typeof v.sector_id === "string" ? v.sector_id : "");
          setClient(typeof v.client_id === "string" ? v.client_id : "");
          setPerson(typeof v.person_id === "string" ? v.person_id : "");
          const p = Number(v.period);
          setPeriod((OPS_DASHBOARD_PERIODS as readonly number[]).includes(p) ? (p as OpsDashboardPeriod) : 30);
        }} />

      {dash.error || ctx.error ? <Alert tone="error">{errorMessage(dash.error ?? ctx.error)}</Alert> : null}
      {dash.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando" />
      ) : dash.data ? (
        <DashboardBody d={dash.data} f={f} onOpen={open} />
      ) : null}
      <TaskDetailHost ctx={ctx} />
    </div>
  );
}

export function DashboardRoute() {
  return (
    <RequireOps permission="ops.dashboard.view">
      <DashboardPage />
    </RequireOps>
  );
}
