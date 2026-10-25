import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useCoexAction, waReturnUri } from "./api.ts";

/** T4.2: o Meta devolve a pessoa para cá depois do cadastro oficial do WhatsApp (Coexistence), com um código de uso único. */
export function WhatsAppCallbackPage() {
  const [params] = useSearchParams();
  const action = useCoexAction();
  const started = useRef(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (started.current) return; // não manda o código duas vezes
    started.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");
    // Tira o código do endereço (não deve ficar no histórico do navegador).
    window.history.replaceState(null, "", window.location.pathname);
    if (denied || !code || !state) {
      setResult({ tone: "error", text: denied ? "O cadastro foi cancelado no Meta." : "O Meta não devolveu a autorização. Tente ligar de novo." });
      return;
    }
    action
      .mutateAsync({ action: "coex_complete", code, state, redirectUri: waReturnUri() })
      .then((r) => setResult({
        tone: "success",
        text: `WhatsApp ligado${r.displayPhone ? `: ${r.displayPhone}` : ""}${r.verifiedName ? ` (${r.verifiedName})` : ""}. `
          + "As mensagens e as Frases do WhatsApp passam a chegar sozinhas."
          + (r.numbers && r.numbers > 1 ? ` A conta tem ${r.numbers} números: foi ligado o primeiro.` : ""),
      }))
      .catch((err: unknown) => setResult({ tone: "error", text: errorMessage(err) }));
  }, [params, action]);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ligando o WhatsApp</h1>
      <Card className="space-y-4 p-6">
        {result ? <Alert tone={result.tone}>{result.text}</Alert> : <FullPageSpinner label="Finalizando o cadastro com o Meta..." />}
        {result && (
          <Link to="/tracking" className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700">Voltar para o Tracking</Link>
        )}
      </Card>
    </div>
  );
}
