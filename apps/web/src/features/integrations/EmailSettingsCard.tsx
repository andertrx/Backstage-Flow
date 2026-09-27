import { KeyRound, Mail, Send, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { type EmailSettings, isEmail, useEmailSettings, useRemoveEmailKey, useSaveEmailSettings, useTestEmailSettings } from "@/features/client-report/emailApi.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";

/**
 * Etapa 19.4 — envio de e-mails do relatório pelo Resend (só admin).
 * A chave é colada aqui e vai direto para o cofre do servidor: a tela nunca
 * mostra a chave de volta, só se ela existe.
 */
export function EmailSettingsCard() {
  const settings = useEmailSettings(true);
  const save = useSaveEmailSettings();
  const remove = useRemoveEmailKey();
  const test = useTestEmailSettings();
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const s = settings.data;

  // Preenche o formulário quando os dados chegam (ou mudam no servidor).
  const [loaded, setLoaded] = useState<EmailSettings | null>(null);
  if (s && s !== loaded) {
    setLoaded(s);
    setFromName(s.from_name); setFromEmail(s.from_email); setReplyTo(s.reply_to ?? "");
  }

  async function run(fn: () => Promise<string>) {
    setMessage(null);
    try { setMessage({ tone: "success", text: await fn() }); } catch (err) { setMessage({ tone: "error", text: errorMessage(err) }); }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fromName.trim()) return setMessage({ tone: "error", text: "Informe o nome do remetente." });
    if (!isEmail(fromEmail.trim())) return setMessage({ tone: "error", text: "E-mail do remetente inválido." });
    if (replyTo.trim() && !isEmail(replyTo.trim())) return setMessage({ tone: "error", text: "E-mail de resposta inválido." });
    if (apiKey.trim() && !/^re_[A-Za-z0-9_]{10,200}$/.test(apiKey.trim())) {
      return setMessage({ tone: "error", text: 'A chave do Resend começa com "re_". Confira e cole de novo.' });
    }
    void run(async () => {
      await save.mutateAsync({ fromName, fromEmail, replyTo, apiKey });
      const hadKey = Boolean(apiKey.trim());
      setApiKey(""); // a chave não fica na tela
      return hadKey ? "Salvo. A chave foi para o cofre. Agora clique em \"Enviar e-mail de teste\"." : "Remetente salvo.";
    });
  }

  return (
    <Card className="space-y-5 p-6" data-testid="email-settings-card">
      <div className="flex gap-3">
        <Mail className="mt-0.5 size-5 text-slate-400" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">E-mail do relatório (Resend)</h2>
          <p className="text-sm text-slate-500">
            Usado para o e-mail semanal de cada cliente. O domínio do remetente precisa estar verificado no Resend.
          </p>
        </div>
      </div>
      {settings.error ? <Alert tone="error">{errorMessage(settings.error)}</Alert> : null}

      {s && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm" data-testid="email-key-status">
          <span className="inline-flex items-center gap-1.5">
            <KeyRound className="size-4 text-slate-400" aria-hidden />
            {s.has_key ? <>Chave guardada no cofre{s.key_updated_at && <> em {formatDateTime(s.key_updated_at)}</>}</> : "Nenhuma chave cadastrada"}
          </span>
          {s.last_test_at && (
            <span className={s.last_test_ok ? "text-emerald-700" : "text-red-700"}>
              Último teste ({formatDateTime(s.last_test_at)}): {s.last_test_ok ? "funcionou" : s.last_test_error ?? "falhou"}
            </span>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do remetente">
            {(id) => <Input id={id} value={fromName} maxLength={80} onChange={(e) => setFromName(e.target.value)} />}
          </Field>
          <Field label="E-mail do remetente" hint="De um domínio verificado no Resend (ex.: relatorios@backstageflow.com.br).">
            {(id) => <Input id={id} type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />}
          </Field>
          <Field label="Responder para (opcional)" hint="Se o cliente responder o e-mail, a resposta vai para cá.">
            {(id) => <Input id={id} type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />}
          </Field>
          <Field label={s?.has_key ? "Trocar a chave do Resend (opcional)" : "Chave do Resend"} hint="Colada aqui, vai direto para o cofre criptografado. Nunca envie a chave por chat ou e-mail.">
            {(id) => (
              <Input id={id} type="password" autoComplete="off" spellCheck={false} value={apiKey} placeholder="re_..." onChange={(e) => setApiKey(e.target.value)} />
            )}
          </Field>
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={save.isPending}>Salvar</Button>
          <Button type="button" variant="secondary" disabled={!s?.has_key || test.isPending} loading={test.isPending}
            onClick={() => run(async () => `E-mail de teste enviado para ${(await test.mutateAsync()).sentTo}. Confira a caixa de entrada (e o spam).`)}>
            <Send className="size-4" aria-hidden /> Enviar e-mail de teste
          </Button>
          {s?.has_key && (
            <Button type="button" variant="ghost" loading={remove.isPending}
              onClick={() => window.confirm("Remover a chave? Os e-mails semanais param até você colar uma chave nova.") &&
                run(async () => { await remove.mutateAsync(); return "Chave removida. Nenhum e-mail será enviado até cadastrar outra."; })}>
              <Trash2 className="size-4" aria-hidden /> Remover chave
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
