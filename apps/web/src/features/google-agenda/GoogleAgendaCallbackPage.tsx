import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { errorMessage } from "@/lib/errors.ts";
import { useConcluirAgenda } from "./api.ts";

/** O Google devolve a pessoa para cá com um código de uso único (46.1). */
export function GoogleAgendaCallbackPage() {
  const [params] = useSearchParams();
  const concluir = useConcluirAgenda();
  const started = useRef(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (started.current) return; // não enviar o código duas vezes
    started.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");
    window.history.replaceState(null, "", window.location.pathname); // o código não deve ficar no histórico do navegador
    if (denied || !code || !state) {
      setResult({ tone: "error", text: denied === "access_denied" ? "A autorização foi cancelada no Google." : "O Google não devolveu a autorização. Tente de novo." });
      return;
    }
    concluir.mutateAsync({ code, state })
      .then((r) => setResult({ tone: "success", text: `Google Agenda conectado com ${r.conexao?.google_email ?? "sua conta Google"}.` }))
      .catch((err: unknown) => setResult({ tone: "error", text: errorMessage(err) }));
  }, [params, concluir]);

  return (
    <div className="max-w-xl space-y-4" data-testid="google-agenda-retorno">
      <h1 className="text-2xl font-semibold tracking-tight">Conectando o Google Agenda</h1>
      <Card className="space-y-4 p-6">
        {result ? <Alert tone={result.tone}>{result.text}</Alert> : <FullPageSpinner label="Finalizando a conexão com o Google..." />}
        {result && <Link to="/reunioes" className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700">Voltar para Reuniões</Link>}
      </Card>
    </div>
  );
}
