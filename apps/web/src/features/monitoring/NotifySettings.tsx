import { can, ROLE_LABELS, type Role } from "@backstage/shared";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";
import {
  type DeliveryChannel,
  type DeliveryStatus,
  type MonitorNotifyKind,
  type MonitorPrefs,
  type MonitorPrefsInput,
  useMonitorDeliveries,
  useMonitorNotifyPeople,
  useMonitorPrefs,
  useSaveMonitorPrefs,
} from "./notifyApi.ts";

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, "0")}:00` }));
const SEVERITY_OPTIONS = [
  { value: "critico", label: "Só críticos" },
  { value: "atencao", label: "Críticos e de atenção" },
  { value: "informativo", label: "Todos (inclusive informativos)" },
] as const;
const MODE_OPTIONS = [
  { value: "imediato", label: "Na hora" },
  { value: "resumo", label: "Só no resumo diário" },
  { value: "ambos", label: "Na hora e no resumo diário" },
] as const;
export const NOTIFY_KIND_LABELS: Record<MonitorNotifyKind, string> = {
  "alerta.novo": "Alerta novo",
  "alerta.piorou": "Piorou para crítico",
  "alerta.atribuido": "Virou responsável",
  "alerta.avaliacao": "Avaliação da providência",
  "resumo.diario": "Resumo diário",
};
const CHANNEL_LABELS: Record<DeliveryChannel, string> = { interno: "No sistema", email: "E-mail", whatsapp: "WhatsApp" };
const STATUS_LOOK: Record<DeliveryStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "brand" }> = {
  enviado: { label: "Enviado", tone: "success" },
  pendente: { label: "Na fila", tone: "brand" },
  falhou: { label: "Falhou", tone: "danger" },
  preparado: { label: "Preparado", tone: "neutral" },
  pulado: { label: "Não enviado", tone: "warning" },
};

function Check({ label, checked, onChange, disabled, testid }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testid?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
      {label}
    </label>
  );
}

function toInput(p: MonitorPrefs): MonitorPrefsInput {
  return {
    enabled: p.enabled, internal: p.internal, email: p.email, whatsapp: p.whatsapp, min_severity: p.min_severity,
    client_ids: p.client_ids, mode: p.mode, digest_hour: p.digest_hour, quiet_start: p.quiet_start, quiet_end: p.quiet_end,
    notify_assigned: p.notify_assigned, notify_followups: p.notify_followups,
  };
}

function PrefsForm({ prefs, userId, isSelf }: { prefs: MonitorPrefs; userId: string | null; isSelf: boolean }) {
  const [f, setF] = useState<MonitorPrefsInput>(() => toInput(prefs));
  const [dirty, setDirty] = useState(false);
  const save = useSaveMonitorPrefs();
  const { data: clients = [] } = useClients();
  const set = (patch: Partial<MonitorPrefsInput>) => { setF((v) => ({ ...v, ...patch })); setDirty(true); };
  const quiet = f.quiet_start !== null;
  const chosen = new Set(f.client_ids ?? []);
  const toggleClient = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    set({ client_ids: next.size ? [...next] : null });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ userId, prefs: f }, { onSuccess: () => setDirty(false) });
  };

  return (
    <form onSubmit={submit} className="space-y-5" data-testid="prefs-form">
      {prefs.is_default && (
        <p className="text-xs text-slate-500" data-testid="prefs-padrao">
          {isSelf ? "Você ainda está com o padrão" : "Esta pessoa ainda está com o padrão"}: quem trata alertas recebe os críticos no sistema; o visualizador começa desligado.
        </p>
      )}
      <Check label="Receber avisos do monitoramento" checked={f.enabled} onChange={(v) => set({ enabled: v })} testid="prefs-ligado" />

      <fieldset className="space-y-2" disabled={!f.enabled}>
        <legend className="text-sm font-semibold text-slate-900">Por onde</legend>
        <Check label="No sistema (ícone de avisos no topo)" checked={f.internal} onChange={(v) => set({ internal: v })} testid="prefs-interno" />
        <Check label="Por e-mail" checked={f.email} onChange={(v) => set({ email: v })} testid="prefs-email" />
        {f.email && !prefs.email_ready && <Alert tone="warning">O envio de e-mails ainda não foi configurado (Configurações → Integrações). Os e-mails ficam na fila até lá.</Alert>}
        {f.email && !prefs.has_email && <Alert tone="warning">Esta pessoa não tem e-mail cadastrado.</Alert>}
        <Check label="Por WhatsApp (preparado: o envio ainda não está ligado)" checked={f.whatsapp} onChange={(v) => set({ whatsapp: v })} testid="prefs-whatsapp" />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3" disabled={!f.enabled}>
        <legend className="sr-only">Quais e quando</legend>
        <Field label="Quais alertas" hint="Vale para alerta novo e para o que piorou.">
          {(id) => (
            <Select id={id} value={f.min_severity} onChange={(e) => set({ min_severity: e.target.value as MonitorPrefsInput["min_severity"] })} data-testid="prefs-gravidade">
              {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Quando">
          {(id) => (
            <Select id={id} value={f.mode} onChange={(e) => set({ mode: e.target.value as MonitorPrefsInput["mode"] })} data-testid="prefs-modo">
              {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Hora do resumo diário" hint="Fuso de São Paulo. Sem alerta aberto, não manda resumo.">
          {(id) => (
            <Select id={id} value={f.digest_hour} disabled={f.mode === "imediato"} onChange={(e) => set({ digest_hour: Number(e.target.value) })} data-testid="prefs-hora">
              {HOURS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-2" disabled={!f.enabled}>
        <legend className="text-sm font-semibold text-slate-900">Também avisar quando</legend>
        <Check label="Eu virar responsável por um alerta" checked={f.notify_assigned} onChange={(v) => set({ notify_assigned: v })} />
        <Check label="Sair a avaliação (3 e 7 dias) de uma providência minha ou de um alerta meu" checked={f.notify_followups} onChange={(v) => set({ notify_followups: v })} />
      </fieldset>

      <fieldset className="space-y-2" disabled={!f.enabled}>
        <legend className="text-sm font-semibold text-slate-900">Horário de silêncio (e-mail)</legend>
        <Check label="Não mandar e-mail neste horário (o aviso no sistema continua chegando)" checked={quiet}
          onChange={(v) => set(v ? { quiet_start: 22, quiet_end: 7 } : { quiet_start: null, quiet_end: null })} testid="prefs-silencio" />
        {quiet && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            das
            <Select aria-label="Início do silêncio" className="w-28" value={f.quiet_start ?? 22} onChange={(e) => set({ quiet_start: Number(e.target.value) })}>
              {HOURS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            às
            <Select aria-label="Fim do silêncio" className="w-28" value={f.quiet_end ?? 7} onChange={(e) => set({ quiet_end: Number(e.target.value) })}>
              {HOURS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2" disabled={!f.enabled}>
        <legend className="text-sm font-semibold text-slate-900">Clientes</legend>
        <p className="text-xs text-slate-500">Nenhum marcado = todos os clientes liberados para a pessoa.</p>
        <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2" data-testid="prefs-clientes">
          {clients.map((c) => (
            <Check key={c.id} label={c.name} checked={chosen.has(c.id)} onChange={(v) => toggleClient(c.id, v)} />
          ))}
        </div>
      </fieldset>

      {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      {save.isSuccess && !dirty && <Alert tone="success">Preferências salvas.</Alert>}
      <Button type="submit" loading={save.isPending} disabled={!dirty} data-testid="prefs-salvar">Salvar preferências</Button>
    </form>
  );
}

/** Configurações → Minhas notificações (o administrador também escolhe outra pessoa) + histórico de envios. */
export function NotifySettings() {
  const { profile } = useAuth();
  const isAdmin = can(profile?.role, "monitor.admin");
  const [userId, setUserId] = useState<string | null>(null);
  const people = useMonitorNotifyPeople(isAdmin);
  const prefs = useMonitorPrefs(userId);
  const isSelf = !userId || userId === profile?.id;
  const { hash } = useLocation();
  // Atalho "Preferências de aviso" (ícone do topo): rola até esta parte.
  useEffect(() => {
    if (hash === "#minhas-notificacoes") document.getElementById("minhas-notificacoes")?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <section aria-labelledby="minhas-notificacoes-titulo" className="space-y-3" id="minhas-notificacoes">
      <h2 id="minhas-notificacoes-titulo" className="text-base font-semibold">{isSelf ? "Minhas notificações" : "Notificações de outra pessoa"}</h2>
      <Card className="space-y-4 p-4">
        {isAdmin && people.data && (
          <Field label="Pessoa">
            {(id) => (
              <Select id={id} className="max-w-sm" value={userId ?? profile?.id ?? ""} data-testid="prefs-pessoa"
                onChange={(e) => setUserId(e.target.value === profile?.id ? null : e.target.value)}>
                {people.data.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.id === profile?.id ? " (você)" : ""} · {ROLE_LABELS[p.role as Role] ?? p.role}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {prefs.error && <Alert tone="error">{errorMessage(prefs.error)}</Alert>}
        {prefs.isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
        {prefs.data && <PrefsForm key={prefs.data.user_id} prefs={prefs.data} userId={userId} isSelf={isSelf} />}
      </Card>
      <DeliveryHistory showPerson={isAdmin} />
    </section>
  );
}

function DeliveryHistory({ showPerson }: { showPerson: boolean }) {
  const { data, error, isLoading } = useMonitorDeliveries(100);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">Histórico de envios</h3>
      <p className="text-xs text-slate-500">
        {showPerson ? "Os últimos 100 envios de todas as pessoas." : "Os seus últimos 100 envios."} Fica guardado para sempre; nada é apagado.
      </p>
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {data && data.length === 0 && <Card className="p-4 text-sm text-slate-500">Nenhum envio ainda.</Card>}
      {data && data.length > 0 && (
        <Card className="relative overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-left text-sm" data-testid="historico-envios">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Quando</th>
                {showPerson && <th className="px-3 py-2 font-medium">Pessoa</th>}
                <th className="px-3 py-2 font-medium">Canal</th>
                <th className="px-3 py-2 font-medium">Aviso</th>
                <th className="px-3 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d) => (
                <tr key={d.id} data-testid="envio" data-status={d.status} data-channel={d.channel}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(d.created_at)}</td>
                  {showPerson && <td className="px-3 py-2 text-slate-700">{d.user_name ?? "—"}</td>}
                  <td className="px-3 py-2 text-slate-700">{CHANNEL_LABELS[d.channel]}</td>
                  <td className="px-3 py-2">
                    <span className="block text-slate-900">{d.title ?? "—"}</span>
                    <span className="block text-xs text-slate-500">{NOTIFY_KIND_LABELS[d.kind] ?? d.kind}</span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_LOOK[d.status].tone}>{STATUS_LOOK[d.status].label}</Badge>
                    {d.reason && <span className="mt-0.5 block text-xs text-slate-500">{d.reason}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
