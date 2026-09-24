import { Megaphone, Plug, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { useConnectionAction, useConnections } from "@/features/ad-accounts/api.ts";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge.tsx";

const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

function ConnectForm() {
  const action = useConnectionAction();
  const [label, setLabel] = useState("BM da agência");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const result = await action.mutateAsync({ action: "connect", platform: "meta", label: label.trim(), accessToken: token.trim() });
      setToken(""); // o token não fica guardado na tela
      setMessage({
        tone: "success",
        text: result.renewed
          ? `Token renovado para ${result.ownerName ?? "este usuário do sistema"}.`
          : `Conectado como ${result.ownerName ?? "usuário do sistema"}. Agora vincule as contas na página de cada cliente.`,
      });
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label="Nome da conexão">
          {(id) => <Input id={id} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />}
        </Field>
        <Field label="Token do usuário do sistema" hint="Colado aqui, vai direto para o cofre criptografado do servidor.">
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAAB..."
            />
          )}
        </Field>
      </div>
      <Button type="submit" loading={action.isPending} disabled={token.trim().length < 20 || label.trim().length < 2}>
        <Plug className="size-4" aria-hidden /> Conectar Meta
      </Button>
    </form>
  );
}

function HowTo() {
  return (
    <details className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-800">Como gerar o token (passo a passo)</summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>
          No <strong>Meta Business Suite</strong> da agência, abra <em>Configurações do negócio → Usuários → Usuários do sistema</em>.
        </li>
        <li>Crie um usuário do sistema (ex.: “Backstage Flow”) com função de <strong>Administrador</strong> ou <strong>Funcionário</strong>.</li>
        <li>
          Em <em>Atribuir ativos</em>, dê acesso às <strong>contas de anúncio</strong> (e páginas) dos clientes, com permissão de visualização.
        </li>
        <li>
          Clique em <strong>Gerar novo token</strong>, escolha o app da agência e marque as permissões <code>ads_read</code> e{" "}
          <code>business_management</code>. Para ver o Instagram vinculado, marque também <code>pages_show_list</code> e{" "}
          <code>instagram_basic</code>.
        </li>
        <li>Copie o token e cole no campo acima. Ele não aparece de novo em lugar nenhum do sistema.</li>
      </ol>
    </details>
  );
}

export function MetaIntegrationCard() {
  const { data: connections, isLoading, error } = useConnections("meta");
  const action = useConnectionAction();
  const active = connections?.filter((c) => c.status !== "revogada") ?? [];

  async function disconnect(id: string, label: string) {
    if (!window.confirm(`Desconectar "${label}"? O token será apagado do cofre e as contas vinculadas param de atualizar.`)) return;
    try {
      await action.mutateAsync({ action: "disconnect", connectionId: id });
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
          <Megaphone className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold">Meta Ads</h2>
          <p className="text-sm text-slate-500">Conexão oficial pela Marketing API, usando um usuário do sistema do Business Manager.</p>
        </div>
      </div>

      <Alert tone="info">
        <span className="inline-flex items-center gap-1 font-medium">
          <ShieldCheck className="size-4" aria-hidden /> Segurança:
        </span>{" "}
        o token fica criptografado no servidor (Supabase Vault). Nem esta tela, nem os usuários, conseguem vê-lo depois de salvo.
      </Alert>

      {error && <Alert tone="error">{error.message}</Alert>}
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando conexões...</p>
      ) : active.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {active.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{c.label}</p>
                  <ConnectionStatusBadge status={c.status} />
                </div>
                <p className="text-xs text-slate-500">
                  {c.external_user_name ?? "Usuário do sistema"} · verificada em {dateTime(c.last_checked_at)}
                </p>
                {c.status === "erro" && c.last_error && <p className="mt-1 text-xs text-red-700">{c.last_error}</p>}
              </div>
              <Button variant="ghost" className="text-xs" onClick={() => disconnect(c.id, c.label)}>
                Desconectar
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma conexão com o Meta ainda.</p>
      )}

      <div className="space-y-3 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold">{active.length ? "Adicionar ou renovar token" : "Conectar"}</h3>
        <ConnectForm />
        <HowTo />
      </div>
    </Card>
  );
}
