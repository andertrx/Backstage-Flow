import { KeyRound, MessageCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { type WaAppSettings, useSaveWaAppSettings, useWaAppSettings, waAppWebhookUrl, waReturnUri } from "@/features/tracking/api.ts";
import { errorMessage } from "@/lib/errors.ts";

/**
 * Tracking T4.2 — app do Meta da agência para ligar o WhatsApp dos clientes pelo cadastro oficial (Coexistence).
 * Só admin. O segredo do app vai direto para o cofre: a tela nunca o recebe de volta.
 */
export function WhatsAppAppCard() {
  const settings = useWaAppSettings(true);
  const save = useSaveWaAppSettings();
  const [appId, setAppId] = useState("");
  const [configId, setConfigId] = useState("");
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const s = settings.data;
  const [loaded, setLoaded] = useState<WaAppSettings | null>(null);
  if (s && s !== loaded) {
    setLoaded(s);
    setAppId(s.app_id ?? "");
    setConfigId(s.config_id ?? "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!/^\d{5,30}$/.test(appId.trim())) return setMessage({ tone: "error", text: "O ID do app tem só números." });
    if (!/^\d{5,30}$/.test(configId.trim())) return setMessage({ tone: "error", text: "O ID da configuração tem só números." });
    if (secret.trim() && !/^[0-9a-f]{32}$/.test(secret.trim())) return setMessage({ tone: "error", text: "O segredo do app tem 32 letras e números (Configurações do app → Básico)." });
    try {
      const r = await save.mutateAsync({ appId: appId.trim(), configId: configId.trim(), appSecret: secret.trim() });
      setSecret("");
      setMessage({ tone: "success", text: r.ready ? "Salvo. O botão “Ligar WhatsApp Business” já aparece no Tracking." : "Salvo. Falta o segredo do app." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  }

  return (
    <Card className="space-y-5 p-6" data-testid="wa-app-card">
      <div className="flex gap-3">
        <MessageCircle className="mt-0.5 size-5 text-slate-400" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">WhatsApp (Coexistence)</h2>
          <p className="text-sm text-slate-500">
            App do Meta da agência para ligar o WhatsApp Business dos clientes pelo cadastro oficial. O número continua no celular; o CRM recebe as
            mensagens e as Frases do WhatsApp. O app precisa estar no programa <strong>Tech Provider</strong> do Meta.
          </p>
        </div>
      </div>
      {settings.error && <Alert tone="error">{errorMessage(settings.error)}</Alert>}
      {s && (
        <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="wa-app-status">
          {s.ready ? <Badge tone="success">Pronto</Badge> : <Badge tone="warning">Falta configurar</Badge>}
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <KeyRound className="size-4 text-slate-400" aria-hidden /> {s.has_secret ? "Segredo do app guardado no cofre" : "Segredo do app não cadastrado"}
          </span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ID do app" hint="Painel do app → Configurações → Básico.">
            {(id) => <Input id={id} value={appId} inputMode="numeric" onChange={(e) => setAppId(e.target.value)} />}
          </Field>
          <Field label="ID da configuração" hint="Login do Facebook para Empresas → Configurações (tipo WhatsApp).">
            {(id) => <Input id={id} value={configId} inputMode="numeric" onChange={(e) => setConfigId(e.target.value)} />}
          </Field>
          <Field label={s?.has_secret ? "Segredo do app (salvo)" : "Segredo do app"} hint="Vai direto para o cofre; nunca aparece de novo.">
            {(id) => (
              <Input id={id} type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)}
                placeholder={s?.has_secret ? "•••••• (vazio = manter)" : "Cole aqui"} />
            )}
          </Field>
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" loading={save.isPending}>Salvar</Button>
      </form>

      {s?.verify_token && (
        <dl className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm" data-testid="wa-app-webhook">
          <div>
            <dt className="text-xs font-medium text-slate-500">URL de retorno de chamada (webhook)</dt>
            <dd className="break-all font-mono text-xs text-slate-900">{waAppWebhookUrl()}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Token de verificação</dt>
            <dd className="break-all font-mono text-xs text-slate-900">{s.verify_token}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">URI de redirecionamento do OAuth</dt>
            <dd className="break-all font-mono text-xs text-slate-900">{waReturnUri()}</dd>
          </div>
        </dl>
      )}

      <details className="rounded-lg ring-1 ring-slate-200 text-sm">
        <summary className="cursor-pointer px-3 py-2 font-medium text-slate-800">Como configurar (passo a passo)</summary>
        <ol className="list-decimal space-y-1 px-8 pb-3 text-slate-600">
          <li>No Meta for Developers, no app da agência: adicione os produtos <strong>WhatsApp</strong> e <strong>Login do Facebook para Empresas</strong>.</li>
          <li>Entre no programa <strong>Tech Provider</strong> (verificação da empresa e aprovação do app pelo Meta).</li>
          <li>Em Login do Facebook para Empresas → Configurações, crie uma configuração do tipo WhatsApp (Cadastro incorporado) e copie o ID.</li>
          <li>Cole aqui o ID do app, o ID da configuração e o segredo do app, e salve.</li>
          <li>Em Login do Facebook para Empresas → Configurações, adicione a <strong>URI de redirecionamento</strong> mostrada acima.</li>
          <li>Em WhatsApp → Configuração → Webhook, cole a URL e o token de verificação, e assine <strong>messages</strong> e <strong>smb_message_echoes</strong>.</li>
          <li>Pronto: no Tracking, no card do site do cliente → WhatsApp API → <strong>Ligar WhatsApp Business</strong>.</li>
        </ol>
      </details>
    </Card>
  );
}
