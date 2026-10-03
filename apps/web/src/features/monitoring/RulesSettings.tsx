import {
  type BadDirection,
  can,
  DEFAULT_MIN_VOLUME,
  MONITOR_METRIC_DEFINITIONS,
  MONITOR_METRICS,
  type MonitorMetric,
  SCOPE_LABELS,
  type ScopeLevel,
  validateRule,
  VOLUME_BASE,
  VOLUME_BASE_LABELS,
} from "@backstage/shared";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import { type MonitorRuleRow, useArchiveMonitorRule, useMonitorRules, useSaveMonitorRule, useScopeOptions } from "./api.ts";

const pct = (n: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n)}%`;

const DIRECTION_LABELS: Record<BadDirection, string> = {
  up: "Quando subir",
  down: "Quando cair",
  both: "Quando mudar (subir ou cair)",
};

function minVolumeText(r: Pick<MonitorRuleRow, "metric" | "min_volume">): string {
  const base = VOLUME_BASE[r.metric];
  if (base === "none") return "—";
  const n = r.min_volume ?? DEFAULT_MIN_VOLUME[base];
  return `${new Intl.NumberFormat("pt-BR").format(n)} ${VOLUME_BASE_LABELS[base]}${r.min_volume == null ? " (padrão)" : ""}`;
}

type Editing = { mode: "new" } | { mode: "edit"; rule: MonitorRuleRow } | null;

/** Configurações (37.1): limites gerais, regras específicas e o histórico de mudanças. */
export function RulesSettings() {
  const { profile } = useAuth();
  const canRules = can(profile?.role, "monitor.rules");
  const canGlobal = can(profile?.role, "monitor.admin");
  const [showHistory, setShowHistory] = useState(false);
  const { data: rules = [], isLoading, error } = useMonitorRules(showHistory);
  const archive = useArchiveMonitorRule();
  const [editing, setEditing] = useState<Editing>(null);

  const current = rules.filter((r) => !r.archived_at);
  const general = current.filter((r) => r.scope === "global").sort((a, b) => MONITOR_METRICS.indexOf(a.metric) - MONITOR_METRICS.indexOf(b.metric));
  const specific = current.filter((r) => r.scope !== "global");
  const history = rules.filter((r) => r.archived_at).sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""));

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {archive.error && <Alert tone="error">{errorMessage(archive.error)}</Alert>}

      <Alert tone="info">
        Os limites são <strong>sugestões iniciais</strong>, não regras universais. Vale sempre a regra mais específica:
        anúncio → campanha → conta → cliente → todos os clientes. Com pouco volume de dados, o sistema só mostra um aviso informativo (“amostra pequena”).
      </Alert>

      <section aria-labelledby="limites-gerais" className="space-y-3">
        <h2 id="limites-gerais" className="text-base font-semibold">Limites gerais (todos os clientes)</h2>
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Métrica</th>
                <th className="px-4 py-2">Alerta</th>
                <th className="px-4 py-2 text-right">Atenção</th>
                <th className="px-4 py-2 text-right">Crítico</th>
                <th className="px-4 py-2">Volume mínimo</th>
                <th className="px-4 py-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Carregando…</td></tr>
              )}
              {general.map((r) => (
                <tr key={r.id} data-testid={`regra-geral-${r.metric}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {MONITOR_METRIC_DEFINITIONS[r.metric].label}
                    {!r.active && <span className="ml-2"><Badge>Desativada</Badge></span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{DIRECTION_LABELS[r.direction]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-orange-700">{pct(r.attention_pct)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{pct(r.critical_pct)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{minVolumeText(r)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canGlobal && (
                      <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing({ mode: "edit", rule: r })} aria-label={`Editar ${MONITOR_METRIC_DEFINITIONS[r.metric].label}`}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {!canGlobal && <p className="text-xs text-slate-500">Só o administrador muda os limites que valem para todos os clientes.</p>}
      </section>

      <section aria-labelledby="regras-especificas" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="regras-especificas" className="text-base font-semibold">Regras específicas</h2>
          {canRules && (
            <Button onClick={() => setEditing({ mode: "new" })}>
              <Plus className="size-4" aria-hidden /> Nova regra
            </Button>
          )}
        </div>
        {specific.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">
            Nenhuma regra específica. Todos os clientes usam os limites gerais.
          </Card>
        ) : (
          <Card className="divide-y divide-slate-100">
            {specific.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="regra-especifica">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {MONITOR_METRIC_DEFINITIONS[r.metric].label} · {DIRECTION_LABELS[r.direction].toLowerCase()}{" "}
                    <span className="tabular-nums text-orange-700">{pct(r.attention_pct)}</span> /{" "}
                    <span className="tabular-nums text-red-700">{pct(r.critical_pct)}</span>
                    {!r.active && <span className="ml-2"><Badge>Desativada: não alerta aqui</Badge></span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {SCOPE_LABELS[r.scope]}: {r.scope_name ?? "—"}
                    {r.scope !== "client" && r.client_name ? ` (${r.client_name})` : ""} · Volume mínimo: {minVolumeText(r)}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                {canRules && (
                  <div className="flex gap-1">
                    <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing({ mode: "edit", rule: r })} aria-label="Editar regra">
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-red-700 hover:text-red-800"
                      aria-label="Remover regra"
                      loading={archive.isPending && archive.variables === r.id}
                      onClick={() => {
                        if (window.confirm("Remover esta regra? Volta a valer o limite mais geral. Ela continua no histórico.")) archive.mutate(r.id);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-labelledby="historico-regras" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="historico-regras" className="text-base font-semibold">Histórico de mudanças</h2>
          <Button variant="secondary" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <History className="size-4" aria-hidden /> {showHistory ? "Esconder" : "Mostrar"}
          </Button>
        </div>
        {showHistory && (
          history.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-500">Nenhuma mudança ainda.</Card>
          ) : (
            <Card className="divide-y divide-slate-100">
              {history.map((r) => (
                <div key={r.id} className="px-4 py-2.5 text-sm" data-testid="regra-historico">
                  <p className="text-slate-800">
                    {MONITOR_METRIC_DEFINITIONS[r.metric].label} · {SCOPE_LABELS[r.scope]}{r.scope_name && r.scope !== "global" ? `: ${r.scope_name}` : ""} ·{" "}
                    {pct(r.attention_pct)} / {pct(r.critical_pct)}{!r.active ? " (desativada)" : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    Valeu de {formatDateTime(r.created_at)} até {formatDateTime(r.archived_at!)}
                    {r.created_by_name ? ` · criada por ${r.created_by_name}` : ""}
                  </p>
                </div>
              ))}
            </Card>
          )
        )}
      </section>

      {editing && <RuleModal editing={editing} canGlobal={canGlobal} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleModal({ editing, canGlobal, onClose }: { editing: NonNullable<Editing>; canGlobal: boolean; onClose: () => void }) {
  const rule = editing.mode === "edit" ? editing.rule : null;
  const save = useSaveMonitorRule();
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState(rule?.client_id ?? "");
  const [accountId, setAccountId] = useState(rule?.scope === "account" ? (rule.scope_id ?? "") : "");
  const [campaignId, setCampaignId] = useState(rule?.scope === "campaign" ? (rule.scope_id ?? "") : "");
  const [adId, setAdId] = useState(rule?.scope === "ad" ? (rule.scope_id ?? "") : "");
  const [metric, setMetric] = useState<MonitorMetric>(rule?.metric ?? "cost_per_result");
  const [direction, setDirection] = useState<BadDirection>(rule?.direction ?? MONITOR_METRIC_DEFINITIONS.cost_per_result.bad);
  const [attention, setAttention] = useState(String(rule?.attention_pct ?? 20));
  const [critical, setCritical] = useState(String(rule?.critical_pct ?? 40));
  const [minVolume, setMinVolume] = useState(rule?.min_volume == null ? "" : String(rule.min_volume));
  const [active, setActive] = useState(rule?.active ?? true);
  const [note, setNote] = useState(rule?.note ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const accounts = useScopeOptions("account", editing.mode === "new" ? clientId || null : null);
  const campaigns = useScopeOptions("campaign", editing.mode === "new" ? accountId || null : null);
  const ads = useScopeOptions("ad", editing.mode === "new" ? campaignId || null : null);

  const scope: ScopeLevel = rule ? rule.scope : adId ? "ad" : campaignId ? "campaign" : accountId ? "account" : "client";
  const scopeId = rule ? rule.scope_id : adId || campaignId || accountId || clientId || null;
  const base = VOLUME_BASE[metric];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input = {
      scope,
      scope_id: scopeId,
      attention_pct: Number(attention.replace(",", ".")),
      critical_pct: Number(critical.replace(",", ".")),
      min_volume: minVolume.trim() === "" ? null : Number(minVolume),
    };
    const problem = !scopeId && scope !== "global" ? "Escolha o cliente." : validateRule(input);
    if (problem) return setFormError(problem);
    if (scope === "global" && !canGlobal) return setFormError("Só o administrador muda os limites gerais.");
    setFormError(null);
    save.mutate(
      {
        replacesId: rule?.id ?? null,
        scope,
        scopeId: input.scope_id,
        metric,
        direction,
        attention: input.attention_pct,
        critical: input.critical_pct,
        minVolume: input.min_volume,
        active,
        note: note.trim() || null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal open title={rule ? "Editar regra" : "Nova regra"} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        {rule ? (
          <p className="text-sm text-slate-600">
            <strong>{MONITOR_METRIC_DEFINITIONS[rule.metric].label}</strong> · {SCOPE_LABELS[rule.scope]}
            {rule.scope !== "global" && rule.scope_name ? `: ${rule.scope_name}` : ""}. A versão atual vai para o histórico.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente">
              {(id) => (
                <Select id={id} value={clientId} onChange={(e) => { setClientId(e.target.value); setAccountId(""); setCampaignId(""); setAdId(""); }} required>
                  <option value="">Escolha…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Conta (opcional)">
              {(id) => (
                <Select id={id} value={accountId} disabled={!clientId} onChange={(e) => { setAccountId(e.target.value); setCampaignId(""); setAdId(""); }}>
                  <option value="">Todas as contas do cliente</option>
                  {(accounts.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Campanha (opcional)">
              {(id) => (
                <Select id={id} value={campaignId} disabled={!accountId} onChange={(e) => { setCampaignId(e.target.value); setAdId(""); }}>
                  <option value="">Todas as campanhas da conta</option>
                  {(campaigns.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Anúncio (opcional)">
              {(id) => (
                <Select id={id} value={adId} disabled={!campaignId} onChange={(e) => setAdId(e.target.value)}>
                  <option value="">Todos os anúncios da campanha</option>
                  {(ads.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Métrica">
              {(id) => (
                <Select id={id} value={metric} onChange={(e) => { const m = e.target.value as MonitorMetric; setMetric(m); setDirection(MONITOR_METRIC_DEFINITIONS[m].bad); }}>
                  {MONITOR_METRICS.map((m) => <option key={m} value={m}>{MONITOR_METRIC_DEFINITIONS[m].label}</option>)}
                </Select>
              )}
            </Field>
            <p className="self-end pb-2 text-xs text-slate-500">Vale para: <strong>{SCOPE_LABELS[scope]}</strong></p>
          </div>
        )}

        <p className="text-xs text-slate-500">{MONITOR_METRIC_DEFINITIONS[metric].description}</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Alertar">
            {(id) => (
              <Select id={id} value={direction} onChange={(e) => setDirection(e.target.value as BadDirection)}>
                {(Object.keys(DIRECTION_LABELS) as BadDirection[]).map((d) => <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Atenção a partir de (%)">
            {(id) => <Input id={id} inputMode="decimal" value={attention} onChange={(e) => setAttention(e.target.value)} required />}
          </Field>
          <Field label="Crítico a partir de (%)">
            {(id) => <Input id={id} inputMode="decimal" value={critical} onChange={(e) => setCritical(e.target.value)} required />}
          </Field>
        </div>

        {base !== "none" && (
          <Field label={`Volume mínimo (${VOLUME_BASE_LABELS[base]})`} hint={`Vazio = padrão de ${DEFAULT_MIN_VOLUME[base]} ${VOLUME_BASE_LABELS[base]}. Abaixo disso, só aviso informativo.`}>
            {(id) => <Input id={id} inputMode="numeric" value={minVolume} onChange={(e) => setMinVolume(e.target.value.replace(/\D/g, ""))} placeholder={String(DEFAULT_MIN_VOLUME[base])} />}
          </Field>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 rounded border-slate-300" />
          Ativa {scope !== "global" && <span className="text-xs text-slate-500">(desativada = não alerta esta métrica aqui)</span>}
        </label>

        <Field label="Observação (opcional)">
          {(id) => <Textarea id={id} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="min-h-16" />}
        </Field>

        {(formError || save.error) && <Alert tone="error">{formError ?? errorMessage(save.error)}</Alert>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
