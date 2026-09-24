import { LogIn, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { googleRedirectUri, startGoogleConnection, useGoogleStatus } from "@/features/ad-accounts/api.ts";
import { ConnectionsList } from "./ConnectionsList.tsx";

function SetupGuide({ missing }: { missing: string[] }) {
  return (
    <div className="space-y-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
      <p className="font-medium">Falta configurar o servidor para conectar o Google Ads:</p>
      <ul className="list-disc pl-5">
        {missing.map((name) => (
          <li key={name}>
            <code>{name}</code>
          </li>
        ))}
      </ul>
      <p>
        Esses valores são cadastrados no painel do Supabase, em <strong>Edge Functions → Secrets</strong>. Eles nunca ficam no
        site nem no código.
      </p>
    </div>
  );
}

function HowTo() {
  return (
    <details className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-800">Como obter as chaves do Google (passo a passo)</summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>
          <strong>Developer token:</strong> na conta <strong>MCC</strong> (conta administradora) do Google Ads da agência, abra{" "}
          <em>Administrador → Central de API</em>, aceite os termos e copie o token. Ele começa em <strong>modo de teste</strong>;
          para acessar contas reais, clique em <em>solicitar acesso Básico</em> (o Google analisa em alguns dias).
        </li>
        <li>
          <strong>Google Cloud:</strong> em console.cloud.google.com, crie um projeto, ative a <em>Google Ads API</em> e, em{" "}
          <em>APIs e serviços → Credenciais</em>, crie um <strong>ID do cliente OAuth</strong> do tipo <em>Aplicativo da Web</em>.
        </li>
        <li>
          Em <em>URIs de redirecionamento autorizados</em>, adicione exatamente: <code className="break-all">{googleRedirectUri()}</code>
        </li>
        <li>
          Configure a <em>Tela de permissão OAuth</em> (tipo Externo) e adicione seu e-mail como usuário de teste enquanto o app não
          for publicado.
        </li>
        <li>
          No Supabase (<em>Edge Functions → Secrets</em>), cadastre <code>GOOGLE_ADS_DEVELOPER_TOKEN</code>,{" "}
          <code>GOOGLE_OAUTH_CLIENT_ID</code> e <code>GOOGLE_OAUTH_CLIENT_SECRET</code>.
        </li>
        <li>Volte aqui e clique em “Conectar com o Google”, entrando com a conta Google que acessa a MCC.</li>
      </ol>
    </details>
  );
}

export function GoogleIntegrationCard() {
  const status = useGoogleStatus();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const missing = status.data?.missing ?? [];

  async function connect() {
    setError(null);
    setStarting(true);
    try {
      await startGoogleConnection(); // leva para a página oficial do Google
    } catch (err) {
      setError((err as Error).message);
      setStarting(false);
    }
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
          <Search className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold">Google Ads</h2>
          <p className="text-sm text-slate-500">Conexão oficial pela Google Ads API, com login do Google (OAuth) e acesso via MCC.</p>
        </div>
      </div>

      <Alert tone="info">
        <span className="inline-flex items-center gap-1 font-medium">
          <ShieldCheck className="size-4" aria-hidden /> Segurança:
        </span>{" "}
        você entra na página oficial do Google. O sistema recebe só uma autorização, que fica criptografada no servidor.
      </Alert>

      {status.error && <Alert tone="error">{(status.error as Error).message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {missing.length > 0 && <SetupGuide missing={missing} />}

      <ConnectionsList platform="google" emptyText="Nenhuma conexão com o Google Ads ainda." />

      <div className="space-y-3 border-t border-slate-100 pt-5">
        <Button onClick={connect} loading={starting} disabled={status.isLoading || missing.length > 0}>
          <LogIn className="size-4" aria-hidden /> Conectar com o Google
        </Button>
        <HowTo />
      </div>
    </Card>
  );
}
