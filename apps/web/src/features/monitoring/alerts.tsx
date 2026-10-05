import { can, type ComparedMetric, matchesObjectives, PLATFORM_OPTIONS } from "@backstage/shared";
import { BellRing, CheckCircle2, ClipboardList, ImageOff, Play, Repeat, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format.ts";
import { useSearchParamsUpdater } from "@/lib/useSearchParamsUpdater.ts";
import { AlertDetailModal, STATUS_LABELS, StatusBadge } from "./alertDetail.tsx";
import {
  type AlertContextChange,
  type AlertKind,
  type AlertSeverity,
  type AlertStatus,
  type MonitorAlertRow,
  type MonitorStatus,
  useEvaluateNow,
  useMonitorAlerts,
  useMonitorStatus,
  useResolveAlert,
  useSaveMinSeverity,
  useSaveMonitorSettings,
} from "./api.ts";
import { fmtMetric, SEVERITY_LOOK, SeverityBadge } from "./compare.tsx";
import { useMonitorObjectives } from "./objectivesFilter.tsx";
import { useMonitorSummary } from "./overviewApi.ts";

export const KIND_LABELS: Record<AlertKind, string> = {
  limite: "Passou do limite",
  anomalia: "Fora do padrão",
  sem_resultados: "Sem resultados",
};

const LEVEL_NAMES: Record<MonitorAlertRow["level"], string> = { campaign: "Campanha", ad: "Anúncio" };

export const INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "A cada 15 minutos" },
  { value: 30, label: "A cada 30 minutos" },
  { value: 60, label: "A cada 1 hora" },
  { value: 180, label: "A cada 3 horas" },
  { value: 360, label: "A cada 6 horas" },
  { value: 1440, label: "1 vez por dia" },
];
const intervalLabel = (m: number) => INTERVAL_OPTIONS.find((o) => o.value === m)?.label.toLowerCase() ?? `a cada ${m} minutos`;

const SEVERITY_ORDER: AlertSeverity[] = ["critico", "atencao", "informativo"];
const SEVERITY_TITLES: Record<AlertSeverity, string> = { critico: "Críticos", atencao: "Atenção", informativo: "Informativos" };

/** "Avaliar agora": admin e gestor (regras), no máximo uma vez a cada 2 minutos (conferido no banco). */
function EvaluateNowButton() {
  const { profile } = useAuth();
  const evaluate = useEvaluateNow();
  if (!can(profile?.role, "monitor.rules")) return null;
  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={() => evaluate.mutate()} loading={evaluate.isPending} data-testid="avaliar-agora">
        <Play className="size-4" aria-hidden /> Avaliar agora
      </Button>
      {evaluate.error && <Alert tone="error">{errorMessage(evaluate.error)}</Alert>}
      {evaluate.data && (
        <Alert tone="success">
          Avaliação concluída: {evaluate.data.evaluated ?? 0} conta(s) avaliada(s), {evaluate.data.created ?? 0} alerta(s) novo(s),{" "}
          {evaluate.data.updated ?? 0} atualizado(s) e {evaluate.data.resolved ?? 0} normalizado(s).
        </Alert>
      )}
    </div>
  );
}

function lastRunText(s: MonitorStatus, now: Date) {
  const r = s.last_run;
  if (!r) return "Ainda não houve nenhuma avaliação.";
  const who = r.trigger === "manual" ? "manual" : "automática";
  return `Última avaliação (${who}) ${formatRelative(r.started_at, now)}: ${r.evaluated} conta(s) avaliada(s), ${r.skipped} pulada(s) por coleta atrasada, com erro, sem histórico ou sem dados novos.`;
}

/** Visão geral: alertas abertos por gravidade e a situação da avaliação automática. */
export function AlertsOverview({ onOpenAlerts }: { onOpenAlerts: () => void }) {
  const { data: s, isLoading, error } = useMonitorStatus();
  // Com filtro de objetivo, os totais vêm do resumo filtrado.
  const { objectives } = useMonitorObjectives();
  const filtered = useMonitorSummary(null, null, objectives.length > 0, objectives);
  const open = objectives.length > 0 ? filtered.data?.open : s?.open;
  const now = new Date();
  return (
    <section aria-labelledby="avaliacao" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="avaliacao" className="text-base font-semibold">Alertas de desempenho</h2>
        {s && (
          <p className="text-xs text-slate-500" data-testid="proxima-avaliacao">
            {s.enabled
              ? <>Avaliação automática {intervalLabel(s.eval_interval_minutes)}{s.next_run_at && <> · Próxima por volta de {formatDateTime(s.next_run_at)}</>}</>
              : "Avaliação automática desligada"}
          </p>
        )}
      </div>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      <div className="grid grid-cols-3 gap-3">
        {SEVERITY_ORDER.map((sev) => (
          <Card key={sev} className={cn("border-l-4 p-4", SEVERITY_LOOK[sev].border)} data-testid={`abertos-${sev}`}>
            <p className={cn("text-sm font-medium", SEVERITY_LOOK[sev].text)}>{SEVERITY_TITLES[sev]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{isLoading || !open ? "…" : open[sev]}</p>
            <p className="text-xs text-slate-500">aberto(s)</p>
          </Card>
        ))}
      </div>
      {s && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <p className="text-slate-700" data-testid="ultima-avaliacao">{lastRunText(s, now)}</p>
          <button type="button" onClick={onOpenAlerts} className="text-sm font-medium text-brand-700 hover:underline">
            Ver alertas
          </button>
        </Card>
      )}
      {s?.last_run?.error && (
        <Alert tone="error">A última avaliação parou por um erro e foi registrada; nenhum alerta foi alterado nela. Se repetir, avise o suporte.</Alert>
      )}
      <EvaluateNowButton />
    </section>
  );
}

function changeText(c: AlertContextChange): string {
  const when = c.at ? formatDateTime(String(c.at)) : "";
  const who = c.level === "ad" ? "Anúncio" : "Campanha";
  if (c.field === "status") return `${who}: status mudou de “${String(c.old ?? "—")}” para “${String(c.new ?? "—")}” (${when})`;
  if (c.field === "budget_micros") return `${who}: orçamento alterado (${when})`;
  return `${who}: ${c.field} alterado (${when})`;
}

function AlertThumb({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-100 text-center text-[9px] text-slate-500">
        <ImageOff className="size-4" aria-hidden /> Prévia indisponível
      </div>
    );
  }
  return <img src={url} alt={`Miniatura de ${name}`} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className="size-14 shrink-0 rounded-lg bg-slate-100 object-cover" />;
}

/** Botão "Resolvido" da lista: pede confirmação (não dá para reabrir) e o alerta sai da lista de abertos. */
function QuickResolve({ a }: { a: MonitorAlertRow }) {
  const resolve = useResolveAlert();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button type="button" onClick={() => setConfirm(true)} data-testid="resolver-rapido"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
        <CheckCircle2 className="size-4" aria-hidden /> Resolvido
      </button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1" data-testid="confirmar-resolvido">
      <span className="text-xs text-slate-600">Marcar como resolvido?</span>
      <div className="flex gap-1">
        <Button type="button" className="px-2 py-1 text-xs" loading={resolve.isPending}
          onClick={() => resolve.mutate({ id: a.id, note: "", version: a.version }, { onSuccess: () => setConfirm(false) })}>
          Sim
        </Button>
        <button type="button" onClick={() => setConfirm(false)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
          Não
        </button>
      </div>
      {resolve.error && <span className="max-w-[12rem] text-right text-xs text-red-700">{errorMessage(resolve.error)}</span>}
    </div>
  );
}

function AlertCard({ a, now, onOpen, canHandle }: { a: MonitorAlertRow; now: Date; onOpen: () => void; canHandle: boolean }) {
  const entity = (a.level === "ad" ? a.ad_name : a.campaign_name) ?? "—";
  const metric = a.metric as ComparedMetric;
  return (
    <Card className={cn("flex gap-3 border-l-4 p-4", SEVERITY_LOOK[a.severity].border)} data-testid="alerta" data-severity={a.severity} data-kind={a.kind}>
      {a.level === "ad" && <AlertThumb url={a.thumbnail_url} name={entity} />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={a.severity} />
          {!a.resolved_at && <StatusBadge status={a.status} />}
          <span className="text-xs font-medium text-slate-600">{KIND_LABELS[a.kind]}</span>
          {a.recurrence_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700" data-testid="reincidencia">
              <Repeat className="size-3" aria-hidden /> Reincidência ({a.recurrence_count + 1}ª vez)
            </span>
          )}
          {a.resolved_at && (
            <span className="text-xs text-slate-500">
              {a.resolution === "manual" ? "Resolvido à mão" : a.details.closed_reason === "inativo" ? "Encerrado: item desativado" : a.details.closed_reason === "abaixo_do_minimo" ? "Encerrado: deixou de ser crítico" : "Normalizou sozinho"}{" "}
              {formatRelative(a.resolved_at, now)}
            </span>
          )}
        </div>
        <p className="font-medium text-slate-900">
          <span className="text-slate-500">{LEVEL_NAMES[a.level]}:</span> {entity}
        </p>
        <p className="text-xs text-slate-500">
          {a.client_name} · {a.account_name}{a.level === "ad" && a.campaign_name ? <> · {a.campaign_name}</> : null}
        </p>
        <p className="text-sm text-slate-800" data-testid="explicacao">{a.explanation}</p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <div>
            <dt className="inline">Período: </dt>
            <dd className="inline">
              {formatDate(a.period_from)}{a.period_to !== a.period_from && <> a {formatDate(a.period_to)}</>}
              {a.prev_from && a.prev_to && <> × {formatDate(a.prev_from)} a {formatDate(a.prev_to)}</>}
            </dd>
          </div>
          {a.kind === "limite" && a.current_value != null && (
            <div>
              <dt className="inline">Agora: </dt>
              <dd className="inline">{fmtMetric(metric, a.current_value, a.currency)} (antes {fmtMetric(metric, a.previous_value, a.currency)})</dd>
            </div>
          )}
          <div>
            <dt className="inline">Detectado: </dt>
            <dd className="inline" data-testid="deteccoes">
              {a.detections} {a.detections === 1 ? "vez" : "vezes"} · desde {formatDateTime(a.first_detected_at)}
            </dd>
          </div>
        </dl>
        {(a.assignee_name || a.task_number) && (
          <p className="flex flex-wrap gap-x-4 text-xs text-slate-600">
            {a.assignee_name && <span className="inline-flex items-center gap-1" data-testid="responsavel"><UserRound className="size-3.5" aria-hidden /> {a.assignee_name}</span>}
            {a.task_number && <span className="inline-flex items-center gap-1"><ClipboardList className="size-3.5" aria-hidden /> Tarefa nº {a.task_number}</span>}
          </p>
        )}
        {a.context.length > 0 && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="mudancas">
            <p className="font-medium text-slate-700">Mudanças no período (podem explicar a variação):</p>
            <ul className="mt-1 list-disc pl-4">
              {a.context.slice(0, 5).map((c, i) => <li key={i}>{changeText(c)}</li>)}
            </ul>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" onClick={onOpen} className="rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50" data-testid="abrir-alerta">
          Abrir
        </button>
        {canHandle && !a.resolved_at && <QuickResolve a={a} />}
      </div>
    </Card>
  );
}

/** Aba Alertas: os alertas de desempenho gerados pelo motor (abertos ou o histórico). */
export function AlertsTab() {
  const [open, setOpen] = useState(true);
  const [severity, setSeverity] = useState<"" | AlertSeverity>("");
  const [kind, setKind] = useState<"" | AlertKind>("");
  const [status, setStatus] = useState<"" | AlertStatus>("");
  const [mine, setMine] = useState(false);
  const { profile } = useAuth();
  const [params, updateParams] = useSearchParamsUpdater();
  // Cliente e plataforma ficam no endereço: os atalhos do dashboard, da ficha do cliente e das visões Meta/Google abrem já filtrados.
  const clientId = params.get("cliente") ?? "";
  const platform = params.get("plataforma") ?? "";
  const setUrlFilter = (key: "cliente" | "plataforma", value: string) => updateParams((p) => { if (value) p.set(key, value); else p.delete(key); return p; });
  const setClientId = (v: string) => setUrlFilter("cliente", v);
  const { objectives } = useMonitorObjectives();
  const openId = Number(params.get("alerta")) || null;
  const setOpenId = (id: number | null) => updateParams((p) => { if (id) p.set("alerta", String(id)); else p.delete("alerta"); return p; });
  const { data: clients = [] } = useClients();
  const { data: alerts = [], isLoading, error } = useMonitorAlerts(open);
  const now = new Date();
  const shown = alerts.filter((a) => (!open || !a.resolved_at) && (open || a.resolved_at))
    .filter((a) => (!clientId || a.client_id === clientId) && (!platform || a.platform_id === platform)
      && (objectives.length === 0 || (a.campaign_id != null && matchesObjectives(a.campaign_objective, objectives))) && (!severity || a.severity === severity) && (!kind || a.kind === kind)
      && (!status || a.status === status) && (!mine || a.assigned_to === profile?.id));

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Os alertas são gerados sozinhos, comparando os <strong>últimos 7 dias completos</strong> com os 7 anteriores (e o dia de ontem com os 28 dias antes dele).
        Cada alerta explica a conta feita; clique em <strong>Abrir</strong> para tratar (estado, responsável, comentários, providências, tarefa) ou em <strong>Resolvido</strong> para tirá-lo da lista (ele vai para Resolvidos, no histórico). <strong>Só alertas críticos, e só de campanhas, conjuntos e anúncios ativos</strong> (o administrador muda a gravidade em Configurações): quando um item é desativado, o alerta dele é encerrado (fica no histórico). Nada é pausado nem alterado nas plataformas.
      </Alert>
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Quais alertas">
          {[{ v: true, l: "Abertos" }, { v: false, l: "Resolvidos (histórico)" }].map((o) => (
            <button key={o.l} type="button" aria-pressed={open === o.v} onClick={() => setOpen(o.v)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", open === o.v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
              {o.l}
            </button>
          ))}
        </div>
        <label className="text-xs text-slate-600">
          Cliente
          <Select className="mt-1 w-48" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Cliente">
            <option value="">Todos</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="text-xs text-slate-600">
          Plataforma
          <Select className="mt-1 w-36" value={platform} onChange={(e) => setUrlFilter("plataforma", e.target.value)} aria-label="Plataforma">
            <option value="">Todas</option>
            {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </label>
        <label className="text-xs text-slate-600">
          Gravidade
          <Select className="mt-1 w-40" value={severity} onChange={(e) => setSeverity(e.target.value as "" | AlertSeverity)} aria-label="Gravidade">
            <option value="">Todas</option>
            {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{SEVERITY_TITLES[s]}</option>)}
          </Select>
        </label>
        <label className="text-xs text-slate-600">
          Tipo
          <Select className="mt-1 w-44" value={kind} onChange={(e) => setKind(e.target.value as "" | AlertKind)} aria-label="Tipo">
            <option value="">Todos</option>
            {(Object.keys(KIND_LABELS) as AlertKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </label>
        {open && (
          <label className="text-xs text-slate-600">
            Estado
            <Select className="mt-1 w-44" value={status} onChange={(e) => setStatus(e.target.value as "" | AlertStatus)} aria-label="Estado">
              <option value="">Todos</option>
              {(["novo", "visualizado", "em_analise", "aguardando_acao", "ignorado"] as AlertStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </label>
        )}
        <label className="flex items-center gap-2 self-center text-sm text-slate-700">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Só os meus
        </label>
      </Card>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500" data-testid="sem-alertas">
          <BellRing className="size-6 text-slate-400" aria-hidden />
          {open ? "Nenhum alerta de desempenho aberto com esses filtros." : "Nenhum alerta resolvido com esses filtros."}
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500" data-testid="total-alertas">{shown.length} alerta(s)</p>
          {shown.map((a) => <AlertCard key={a.id} a={a} now={now} onOpen={() => setOpenId(a.id)} canHandle={can(profile?.role, "monitor.handle")} />)}
        </div>
      )}
      {openId && <AlertDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** Configurações: liga/desliga e frequência (só o administrador muda); "Avaliar agora" (admin e gestor). */
export function EngineSettings() {
  const { profile } = useAuth();
  const isAdmin = can(profile?.role, "monitor.admin");
  const { data: s, error } = useMonitorStatus();
  const save = useSaveMonitorSettings();
  const [draft, setDraft] = useState<{ enabled: boolean; interval: number; stale: string } | null>(null);
  const form = draft ?? (s ? { enabled: s.enabled, interval: s.eval_interval_minutes, stale: String(s.stale_hours) } : null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    save.mutate({ enabled: form.enabled, interval: form.interval, staleHours: Number(form.stale) }, { onSuccess: () => setDraft(null) });
  };

  return (
    <section aria-labelledby="avaliacao-automatica" className="space-y-3">
      <h2 id="avaliacao-automatica" className="text-base font-semibold">Avaliação automática dos alertas</h2>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {s && form && (
        <Card className="space-y-4 p-4">
          {isAdmin ? (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" data-testid="config-motor">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-3">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setDraft({ ...form, enabled: e.target.checked })} />
                Avaliar automaticamente
              </label>
              <Field label="Frequência">
                {(id) => (
                  <Select id={id} value={form.interval} onChange={(e) => setDraft({ ...form, interval: Number(e.target.value) })}>
                    {INTERVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Coleta atrasada depois de (horas)" hint="Conta sem atualização há mais tempo que isso não gera alerta.">
                {(id) => <Input id={id} type="number" min={1} max={48} value={form.stale} onChange={(e) => setDraft({ ...form, stale: e.target.value })} />}
              </Field>
              <div className="flex items-end">
                <Button type="submit" loading={save.isPending} disabled={!draft}>Salvar</Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-700" data-testid="config-motor-leitura">
              {s.enabled ? <>Avaliação automática ligada, {intervalLabel(s.eval_interval_minutes)}.</> : "Avaliação automática desligada."}{" "}
              Contas sem atualização há mais de {s.stale_hours} hora(s) não geram alerta. Só o administrador muda isso.
            </p>
          )}
          {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
          {save.isSuccess && !draft && <Alert tone="success">Configuração salva.</Alert>}
          <MinSeveritySetting isAdmin={isAdmin} current={s.min_severity ?? "critico"} />
          <EvaluateNowButton />
        </Card>
      )}
    </section>
  );
}


const MIN_SEVERITY_OPTIONS: { value: AlertSeverity; label: string }[] = [
  { value: "critico", label: "Só críticos (recomendado)" },
  { value: "atencao", label: "Críticos e de atenção" },
  { value: "informativo", label: "Todos (inclusive informativos)" },
];

/** Quais alertas o motor gera (padrão: só críticos). Só o administrador muda. */
function MinSeveritySetting({ isAdmin, current }: { isAdmin: boolean; current: AlertSeverity }) {
  const save = useSaveMinSeverity();
  const [value, setValue] = useState<AlertSeverity | null>(null);
  const shown = value ?? current;
  const label = MIN_SEVERITY_OPTIONS.find((o) => o.value === current)?.label ?? current;
  if (!isAdmin) {
    return <p className="text-sm text-slate-700" data-testid="gravidade-minima-leitura">Gera alertas: <strong>{label}</strong>, só de campanhas, conjuntos e anúncios ativos. Só o administrador muda isso.</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4" data-testid="gravidade-minima">
      <Field label="Gerar alertas a partir de" hint="Vale a partir da próxima avaliação. Abaixo disso, o alerta aberto é encerrado (fica no histórico).">
        {(id) => (
          <Select id={id} className="w-64" value={shown} onChange={(e) => setValue(e.target.value as AlertSeverity)}>
            {MIN_SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}
      </Field>
      <Button type="button" loading={save.isPending} disabled={value === null || value === current}
        onClick={() => value && save.mutate(value, { onSuccess: () => setValue(null) })}>Salvar</Button>
      {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      {save.isSuccess && value === null && <span className="text-sm text-emerald-700">Salvo.</span>}
    </div>
  );
}
