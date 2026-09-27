import { Mail, Send } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select, Textarea } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage, FriendlyError } from "@/lib/errors.ts";
import { formatDate, formatDateTime } from "@/lib/format.ts";
import { useClientPortal } from "./api.ts";
import { Switch } from "./ClientPortalCard.tsx";
import {
  type ClientEmail, type EmailButton, parseRecipients, useClientEmail, useClientEmailLog, useEmailLinkStatus, useEmailSettings,
  useSaveClientEmail, useSendClientEmail, useSetEmailLink, WEEKDAYS,
} from "./emailApi.ts";

const BUTTONS: { value: EmailButton; label: string }[] = [
  { value: "login", label: "Entrar no site (login do cliente)" },
  { value: "link", label: "Link secreto (abre sem login)" },
  { value: "none", label: "Sem botão" },
];
const TRIGGER_LABELS = { agendado: "Automático", manual: "Enviado agora", teste: "Teste" } as const;
const STATUS_LOOK = {
  enviado: { label: "Enviado", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  erro: { label: "Erro", cls: "bg-red-50 text-red-700 ring-red-200" },
  pulado: { label: "Não enviado", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
} as const;
const LINK_STATUS = {
  ok: { tone: "success", text: "Link guardado e válido: o botão abre o dashboard sem login." },
  sem_link: { tone: "warning", text: "Nenhum link guardado: o e-mail vai sem botão até você colar o link abaixo." },
  desatualizado: { tone: "warning", text: "O link guardado não vale mais (foi trocado, desligado ou venceu). Cole o link atual." },
} as const;

type Form = Omit<ClientEmail, "client_id" | "last_sent_at"> & { recipientsText: string };

/**
 * Etapa 19.4 — e-mail semanal do relatório deste cliente (admin e gestor).
 * O envio é feito pelo servidor (Resend); a tela só guarda a configuração.
 */
export function ClientEmailCard({ clientId, timezone }: { clientId: string; timezone: string }) {
  const cfg = useClientEmail(clientId);
  return (
    <Card className="space-y-5 p-6" data-testid="client-email-card">
      <div className="flex gap-3">
        <Mail className="mt-0.5 size-5 text-slate-400" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">E-mail semanal do relatório</h2>
          <p className="text-sm text-slate-500">
            Um resumo da semana (últimos 7 dias, sempre comparado à semana anterior), com a logo e as métricas do modelo do cliente.
            Semana sem números não gera e-mail.
          </p>
        </div>
      </div>
      {cfg.error ? <Alert tone="error">{errorMessage(cfg.error)}</Alert> : null}
      {cfg.data && <EmailForm clientId={clientId} timezone={timezone} row={cfg.data.row} />}
      <EmailLog clientId={clientId} />
    </Card>
  );
}

function EmailForm({ clientId, timezone, row }: { clientId: string; timezone: string; row: ClientEmail | null }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const sender = useEmailSettings(isAdmin);
  const portal = useClientPortal(clientId);
  const save = useSaveClientEmail(clientId);
  const send = useSendClientEmail(clientId);
  const setLink = useSetEmailLink(clientId);
  const [f, setF] = useState<Form>({
    enabled: row?.enabled ?? false, recipients: row?.recipients ?? [], weekday: row?.weekday ?? 1, send_hour: row?.send_hour ?? 8,
    button: row?.button ?? "login", recipientsText: (row?.recipients ?? []).join("\n"),
  });
  const linkStatus = useEmailLinkStatus(clientId, f.button === "link");
  const [link, setLinkText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<string | void>) {
    setError(null); setNotice(null);
    try { const msg = await fn(); if (msg) setNotice(msg); } catch (e) { setError(errorMessage(e)); }
  }

  const saveForm = () => run(async () => {
    const { list, invalid } = parseRecipients(f.recipientsText);
    if (invalid.length) throw new FriendlyError(`E-mail inválido: ${invalid.slice(0, 3).join(", ")}.`);
    if (list.length > 10) throw new FriendlyError("No máximo 10 destinatários.");
    if (f.enabled && !list.length) throw new FriendlyError("Informe pelo menos um destinatário para ligar o envio.");
    await save.mutateAsync({ exists: Boolean(row), value: { enabled: f.enabled, recipients: list, weekday: f.weekday, send_hour: f.send_hour, button: f.button } });
    setF((cur) => ({ ...cur, recipients: list, recipientsText: list.join("\n") }));
    return "E-mail semanal salvo.";
  });
  const sendNow = (action: "test" | "send_now") => run(async () => {
    if (action === "send_now" && !window.confirm("Enviar o e-mail desta semana agora para os destinatários salvos?")) return;
    const r = await send.mutateAsync(action);
    return r.status === "pulado" ? `Nada foi enviado: ${r.detail}` : action === "test" ? `Teste enviado para ${profile?.email}.` : `Enviado: ${r.detail}`;
  });

  const noKey = isAdmin && sender.data && !sender.data.has_key;
  const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4">
      {noKey && (
        <Alert tone="warning">O envio ainda não foi configurado: cole a chave do Resend em <strong>Configurações → Integrações</strong>.</Alert>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-slate-900">Enviar toda semana</p>
          <p className="text-sm text-slate-500">
            {row?.last_sent_at ? `Último envio automático: ${formatDateTime(row.last_sent_at)}.` : "Ainda não houve envio automático."}
          </p>
        </div>
        <Switch label="Enviar e-mail semanal" checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} />
      </div>

      <Field label="Destinatários" hint="Um por linha (ou separados por vírgula). Até 10. Cada pessoa recebe o próprio e-mail.">
        {(id) => <Textarea id={id} rows={3} value={f.recipientsText} placeholder="dono@cliente.com.br" onChange={(e) => setF({ ...f, recipientsText: e.target.value })} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Dia">
          {(id) => (
            <Select id={id} value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>
              {WEEKDAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Hora" hint={`No fuso do cliente (${timezone}).`}>
          {(id) => (
            <Select id={id} value={f.send_hour} onChange={(e) => setF({ ...f, send_hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Botão no e-mail">
          {(id) => (
            <Select id={id} value={f.button} onChange={(e) => setF({ ...f, button: e.target.value as EmailButton })}>
              {BUTTONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {f.button === "login" && portal.data && !portal.data.login_enabled && (
        <p className="text-sm text-amber-800" data-testid="email-login-off">O login do cliente está desligado: enquanto estiver assim, o e-mail vai sem botão.</p>
      )}
      {f.button === "link" && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200" data-testid="email-link-box">
          {linkStatus.data && <Alert tone={LINK_STATUS[linkStatus.data].tone}>{LINK_STATUS[linkStatus.data].text}</Alert>}
          <p className="text-xs text-slate-500">
            Por segurança o CRM não guarda o link em texto. Para usar no e-mail, cole aqui o link que aparece ao gerar em "Acesso do cliente"
            (ele fica no cofre; se você gerar um link novo, cole de novo).
          </p>
          <div className="flex gap-2">
            <Input aria-label="Link secreto para o e-mail" placeholder="https://www.backstageflow.com.br/r/…" value={link} onChange={(e) => setLinkText(e.target.value)} />
            <Button variant="secondary" disabled={!link.trim()} loading={setLink.isPending}
              onClick={() => run(async () => { await setLink.mutateAsync(link); setLinkText(""); return "Link guardado para o botão do e-mail."; })}>
              Guardar link
            </Button>
          </div>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => sendNow("test")} loading={send.isPending && send.variables === "test"} disabled={send.isPending}>
          <Send className="size-4" aria-hidden /> Enviar teste para mim
        </Button>
        <Button variant="secondary" onClick={() => sendNow("send_now")} loading={send.isPending && send.variables === "send_now"} disabled={send.isPending || !row?.recipients.length}>
          Enviar agora
        </Button>
        <Button onClick={saveForm} loading={save.isPending}>Salvar</Button>
      </div>
      <p className="text-right text-xs text-slate-500">"Enviar agora" usa os destinatários já salvos. O teste vai só para você.</p>
    </div>
  );
}

function EmailLog({ clientId }: { clientId: string }) {
  const log = useClientEmailLog(clientId);
  if (!log.data?.length) return null;
  return (
    <section className="space-y-2 border-t border-slate-100 pt-4" aria-label="Últimos envios" data-testid="email-log">
      <h3 className="text-sm font-medium text-slate-700">Últimos envios</h3>
      <ul className="divide-y divide-slate-100 text-sm">
        {log.data.map((l) => (
          <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_LOOK[l.status].cls)}>{STATUS_LOOK[l.status].label}</span>
            <span className="text-slate-700">{TRIGGER_LABELS[l.trigger]}</span>
            <span className="text-slate-500">{formatDateTime(l.created_at)}</span>
            {l.period_from && l.period_to && <span className="text-slate-500">semana {formatDate(l.period_from)} a {formatDate(l.period_to)}</span>}
            {l.detail && <span className="w-full text-xs text-slate-500">{l.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
