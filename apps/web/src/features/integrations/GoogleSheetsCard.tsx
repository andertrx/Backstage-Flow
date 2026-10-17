import { CheckCircle2, Copy, FileSpreadsheet, KeyRound, PlugZap, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Textarea } from "@/components/ui/field.tsx";
import { useRemoveSheetsKey, useSaveSheetsKey, useSheetsSettings, useTestSheets } from "@/features/results/api.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime } from "@/lib/format.ts";

/**
 * Etapa 39.1 — conta de serviço do Google para ler as planilhas (só admin).
 * A chave (arquivo JSON) é colada aqui e vai direto para o cofre do servidor;
 * a tela nunca mostra a chave de volta, só o e-mail da conta.
 */
export function GoogleSheetsCard() {
  const settings = useSheetsSettings();
  const save = useSaveSheetsKey();
  const remove = useRemoveSheetsKey();
  const test = useTestSheets();
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const s = settings.data;

  async function run(fn: () => Promise<string>) {
    setMessage(null);
    try { setMessage({ tone: "success", text: await fn() }); } catch (err) { setMessage({ tone: "error", text: errorMessage(err) }); }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = key.trim();
    if (!text) return setMessage({ tone: "error", text: "Cole o conteúdo do arquivo JSON da chave." });
    if (!text.startsWith("{") || !text.includes("\"private_key\"")) {
      return setMessage({ tone: "error", text: "Isto não parece o arquivo JSON da chave. Abra o arquivo baixado do Google Cloud e copie tudo." });
    }
    void run(async () => {
      const email = await save.mutateAsync(text);
      setKey(""); // a chave não fica na tela
      return `Chave guardada no cofre. Agora clique em "Testar conexão" e compartilhe cada planilha com ${email} como Leitor.`;
    });
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* sem permissão de copiar: o e-mail continua visível na tela */ }
  }

  return (
    <Card className="space-y-5 p-6" data-testid="sheets-settings-card">
      <div className="flex gap-3">
        <FileSpreadsheet className="mt-0.5 size-5 text-emerald-600" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">Google Sheets (Inteligência de Resultados)</h2>
          <p className="text-sm text-slate-500">
            O CRM lê as planilhas dos clientes com uma conta de serviço do Google, só para leitura. Ele só enxerga as planilhas
            que você compartilhar com o e-mail dessa conta.
          </p>
        </div>
      </div>
      {settings.error ? <Alert tone="error">{errorMessage(settings.error)}</Alert> : null}

      {s && (
        <div className="space-y-1 text-sm" data-testid="sheets-key-status">
          <p className="inline-flex items-center gap-1.5">
            <KeyRound className="size-4 text-slate-400" aria-hidden />
            {s.has_key ? <>Chave guardada no cofre{s.key_updated_at && <> em {formatDateTime(s.key_updated_at)}</>}</> : "Nenhuma chave cadastrada"}
          </p>
          {s.has_key && s.service_account_email && (
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Compartilhe as planilhas com:</span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs" data-testid="sheets-service-email">{s.service_account_email}</code>
              <button type="button" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline" onClick={() => copyEmail(s.service_account_email!)}>
                {copied ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? "Copiado" : "Copiar"}
              </button>
            </p>
          )}
          {s.last_test_at && (
            <p className={s.last_test_ok ? "text-emerald-700" : "text-red-700"}>
              Último teste ({formatDateTime(s.last_test_at)}): {s.last_test_ok ? "funcionou" : s.last_test_error ?? "falhou"}
            </p>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label={s?.has_key ? "Trocar a chave (opcional)" : "Chave da conta de serviço (arquivo JSON)"}
          hint="Abra o arquivo .json baixado do Google Cloud, copie tudo e cole aqui. Vai direto para o cofre criptografado. Nunca envie a chave por chat ou e-mail.">
          {(id) => (
            <Textarea id={id} value={key} autoComplete="off" spellCheck={false} placeholder='{"type": "service_account", ...}'
              className="font-mono text-xs" onChange={(e) => setKey(e.target.value)} />
          )}
        </Field>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={save.isPending}>Salvar chave</Button>
          <Button type="button" variant="secondary" disabled={!s?.has_key || test.isPending} loading={test.isPending}
            onClick={() => run(async () => `Conexão com o Google funcionando (conta ${(await test.mutateAsync()).serviceAccountEmail}).`)}>
            <PlugZap className="size-4" aria-hidden /> Testar conexão
          </Button>
          {s?.has_key && (
            <Button type="button" variant="ghost" loading={remove.isPending}
              onClick={() => window.confirm("Remover a chave? O CRM para de ler as planilhas até você colar uma chave nova.") &&
                run(async () => { await remove.mutateAsync(); return "Chave removida. Nenhuma planilha será lida até cadastrar outra."; })}>
              <Trash2 className="size-4" aria-hidden /> Remover chave
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
