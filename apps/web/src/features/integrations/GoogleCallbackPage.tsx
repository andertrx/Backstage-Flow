import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { googleRedirectUri, useConnectionAction } from "@/features/ad-accounts/api.ts";
import { errorMessage } from "@/lib/errors.ts";

/** O Google devolve o usuário para cá com um código de uso único. */
export function GoogleCallbackPage() {
  const [params] = useSearchParams();
  const action = useConnectionAction();
  const started = useRef(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (started.current) return; // evita enviar o código duas vezes
    started.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");
    // Remove o código do endereço (ele não deve ficar no histórico do navegador).
    window.history.replaceState(null, "", window.location.pathname);

    if (denied || !code || !state) {
      setResult({
        tone: "error",
        text: denied === "access_denied" ? "A autorização foi cancelada no Google." : "O Google não devolveu a autorização. Tente de novo.",
      });
      return;
    }
    action
      .mutateAsync({ action: "google_complete", code, state, redirectUri: googleRedirectUri(), label: "Google Ads da agência" })
      .then((r) => setResult({ tone: "success", text: `Google Ads conectado com ${r.ownerName ?? "sua conta Google"}.` }))
      .catch((err: unknown) => setResult({ tone: "error", text: errorMessage(err) }));
  }, [params, action]);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Conectando o Google Ads</h1>
      <Card className="space-y-4 p-6">
        {result ? <Alert tone={result.tone}>{result.text}</Alert> : <FullPageSpinner label="Finalizando a conexão com o Google..." />}
        {result && (
          <Link to="/configuracoes/integracoes" className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
            Voltar para Integrações
          </Link>
        )}
      </Card>
    </div>
  );
}
