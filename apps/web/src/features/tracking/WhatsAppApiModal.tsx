import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { formatRelative } from "@/lib/format.ts";
import { type TrackingContainer, type WhatsAppConnection, useWhatsAppConnectionAction } from "./api.ts";
import { validateWaIds, waConnectionStatus } from "./logic.ts";

const TONE = { neutral: "neutral", warning: "warning", danger: "danger", success: "success" } as const;

/**
 * WhatsApp pela API oficial (WhatsApp Business Platform), por site.
 * Para quem usa o app comum nada disso é preciso: o código na mensagem já resolve.
 */
export function WhatsAppApiModal({ container, connection, canManage, onClose }: {
  container: TrackingContainer;
  connection: WhatsAppConnection | undefined;
  canManage: boolean;
  onClose: () => void;
}) {
  const action = useWhatsAppConnectionAction();
  const [phoneNumberId, setPhoneNumberId] = useState(connection?.phone_number_id ?? "");
  const [wabaId, setWabaId] = useState(connection?.waba_id ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [enabled, setEnabled] = useState(connection?.enabled ?? false);
  const [revealed, setRevealed] = useState<{ webhookUrl: string; verifyToken: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const status = waConnectionStatus(connection);

  async function run(body: Parameters<typeof action.mutateAsync>[0], ok: (r: Awaited<ReturnType<typeof action.mutateAsync>>) => string) {
    setError(null);
    setNotice(null);
    try {
      const r = await action.mutateAsync(body);
      setNotice(ok(r));
      setAppSecret("");
      return r;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    }
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    const invalid = validateWaIds(phoneNumberId, wabaId, appSecret, enabled && !connection?.has_app_secret);
    if (invalid) return setError(invalid);
    void run(
      { action: "connection_save", containerId: container.id, phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim(), appSecret: appSecret.trim() || undefined, enabled },
      () => (enabled ? "Salvo. As mensagens recebidas passam a ser registradas." : "Salvo. A conexão está desligada."),
    );
  }

  async function onReveal() {
    const r = await run({ action: "connection_reveal", containerId: container.id }, () => "Copie os dois dados abaixo para o app do Meta.");
    if (r?.webhookUrl) setRevealed({ webhookUrl: r.webhookUrl, verifyToken: r.verifyToken ?? null });
  }

  return (
    <Modal title={`WhatsApp — API oficial — ${container.name}`} open onClose={onClose} size="lg">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3" data-testid="wa-api-status">
          <Badge tone={TONE[status.tone]}>{status.label}</Badge>
          <span className="text-slate-600">{status.detail}</span>
          {connection?.last_webhook_at && <span className="text-xs text-slate-500">Última mensagem {formatRelative(connection.last_webhook_at)}.</span>}
        </div>

        <Alert tone="info">
          Só para números na <strong>API oficial</strong> do WhatsApp (WhatsApp Business Platform). Quem usa o app comum do WhatsApp Business
          continua com o código “ref.” na mensagem — não precisa configurar nada aqui. Com a API oficial, a conversa chega sozinha no CRM e,
          quando vem de anúncio de clique para o WhatsApp, a origem fica <strong>confirmada</strong>. O texto das mensagens não é guardado.
        </Alert>

        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        {canManage ? (
          <form onSubmit={onSave} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ID do número de telefone *" hint="developers.facebook.com → seu app → WhatsApp → Configuração da API.">
                {(id) => <Input id={id} value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} inputMode="numeric" placeholder="106540352242922" />}
              </Field>
              <Field label="ID da conta do WhatsApp Business (WABA) *" hint="Mesma tela, logo abaixo do ID do número.">
                {(id) => <Input id={id} value={wabaId} onChange={(e) => setWabaId(e.target.value)} inputMode="numeric" placeholder="102290129340398" />}
              </Field>
              <Field
                label={connection?.has_app_secret ? "Segredo do app (salvo)" : "Segredo do app *"}
                hint="Configurações do app → Básico → Chave secreta do app. Fica guardado no cofre e nunca aparece de novo."
              >
                {(id) => (
                  <Input id={id} type="password" autoComplete="off" value={appSecret} onChange={(e) => setAppSecret(e.target.value)}
                    placeholder={connection?.has_app_secret ? "•••••• salvo (deixe vazio para manter)" : "Cole o segredo aqui"} />
                )}
              </Field>
              <label className="flex items-start gap-2 self-end rounded-lg bg-slate-50 p-3">
                <input type="checkbox" className="mt-0.5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span>
                  <span className="font-medium text-slate-800">Registrar as conversas</span>
                  <span className="block text-xs text-slate-500">Cada cliente que mandar mensagem vira uma conversa na lista do WhatsApp.</span>
                </span>
              </label>
            </div>
            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={!connection || action.isPending} onClick={() => void onReveal()}>
                  Ver endereço do webhook
                </Button>
                {connection && (
                  <Button type="button" variant="ghost" disabled={action.isPending}
                    onClick={() => void run({ action: "connection_remove", containerId: container.id }, () => "Segredos apagados. A conexão foi desligada.")}>
                    Apagar segredos
                  </Button>
                )}
              </div>
              <Button type="submit" loading={action.isPending}>Salvar</Button>
            </div>
          </form>
        ) : (
          <p className="text-slate-500">Só administradores e gestores configuram a API oficial do WhatsApp.</p>
        )}

        {revealed && (
          <dl className="space-y-2 rounded-lg bg-slate-50 p-3" data-testid="wa-api-webhook">
            <div>
              <dt className="text-xs font-medium text-slate-500">URL de retorno de chamada</dt>
              <dd className="break-all font-mono text-xs text-slate-900">{revealed.webhookUrl}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Token de verificação</dt>
              <dd className="break-all font-mono text-xs text-slate-900">{revealed.verifyToken ?? "—"}</dd>
            </div>
          </dl>
        )}

        <details className="rounded-lg ring-1 ring-slate-200">
          <summary className="cursor-pointer px-3 py-2 font-medium text-slate-800">Como ligar (passo a passo)</summary>
          <ol className="list-decimal space-y-1 px-8 pb-3 text-slate-600">
            <li>Preencha o ID do número, o ID da conta (WABA) e o segredo do app, e clique em Salvar.</li>
            <li>Clique em “Ver endereço do webhook”.</li>
            <li>No app do Meta: WhatsApp → Configuração → Webhook → Editar. Cole a URL e o token de verificação e clique em “Verificar e salvar”.</li>
            <li>Ainda em Webhook, assine o campo <strong>messages</strong>.</li>
            <li>Volte aqui, marque “Registrar as conversas” e salve. Mande uma mensagem de teste para o número.</li>
          </ol>
        </details>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}
