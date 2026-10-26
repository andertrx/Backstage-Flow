import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { AuthLayout } from "@/features/auth/AuthLayout.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { supabase } from "@/lib/supabase.ts";

/** Papéis que podem usar o MCP na primeira versão (igual à Edge Function "mcp"). */
const MCP_ROLES = ["admin", "gestor", "operador", "visualizador", "equipe"];

interface Details {
  authorization_id: string;
  client: { name: string; uri?: string };
  user: { email: string };
  scope: string;
}

/** Só segue para endereços http(s) (o Supabase devolve o endereço do programa de IA, com o código de uso único). */
const safeRedirect = (url: string | undefined) => {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

/**
 * Etapa 40 — tela de autorização do login OAuth (Supabase Auth): um programa de IA (ex.: Claude Code)
 * pede para usar o servidor MCP do Backstage Flow em nome da pessoa logada. Só leitura.
 * Fica fora do menu (como o login); a pessoa chega aqui pelo link que o programa de IA abre.
 */
export function OAuthConsentPage() {
  const [params] = useSearchParams();
  const { profile } = useAuth();
  const id = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<Details | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [done, setDone] = useState<"approve" | "deny" | null>(null);
  const allowed = MCP_ROLES.includes(profile?.role ?? "");

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) {
      setProblem("Pedido de autorização inválido. Comece de novo pelo programa de IA.");
      return;
    }
    let alive = true;
    supabase.auth.oauth.getAuthorizationDetails(id).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) {
        setProblem("Este pedido de autorização expirou ou não existe. Comece de novo pelo programa de IA.");
        return;
      }
      if ("redirect_url" in data && !("authorization_id" in data)) {
        // Já autorizado antes: volta direto para o programa de IA.
        const to = safeRedirect(data.redirect_url);
        if (to) window.location.assign(to);
        else setProblem("Endereço de retorno inválido.");
        return;
      }
      setDetails(data as Details);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  async function decide(action: "approve" | "deny") {
    setBusy(action);
    setProblem(null);
    const fn = action === "approve" ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error } = await fn.call(supabase.auth.oauth, id, { skipBrowserRedirect: true });
    setBusy(null);
    const to = safeRedirect(data?.redirect_url);
    if (error || !to) {
      setProblem("Não conseguimos registrar a sua resposta. Comece de novo pelo programa de IA.");
      return;
    }
    setDone(action);
    window.location.assign(to);
  }

  if (!details && !problem) return <FullPageSpinner label="Abrindo o pedido de autorização..." />;

  return (
    <AuthLayout title="Conectar um programa de IA" subtitle="Servidor MCP do Backstage Flow">
      <div className="space-y-4 text-sm" data-testid="oauth-consent">
        {problem && <Alert tone="error">{problem}</Alert>}
        {details && !done && (
          <>
            <p className="text-slate-700">
              <strong className="text-slate-900">{details.client.name || "Um programa de IA"}</strong> quer acessar o Backstage Flow como{" "}
              <strong className="text-slate-900">{details.user.email}</strong>.
            </p>
            <ul className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-slate-600" data-testid="oauth-consent-rules">
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Só leitura: consultar clientes, métricas, campanhas e alertas.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Vê só o que você já vê no CRM.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Não altera campanhas, orçamentos, saldos, usuários nem integrações.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> Cada consulta fica registrada (sem dados nem senhas).</li>
            </ul>
            {!allowed && <Alert tone="warning">Seu tipo de usuário não pode usar o MCP nesta versão. Você pode recusar o pedido.</Alert>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" loading={busy === "deny"} disabled={busy !== null} onClick={() => void decide("deny")}>Recusar</Button>
              {allowed && <Button loading={busy === "approve"} disabled={busy !== null} onClick={() => void decide("approve")}>Permitir</Button>}
            </div>
          </>
        )}
        {done && (
          <Alert tone={done === "approve" ? "success" : "info"}>
            <span className="inline-flex items-center gap-1.5">
              {done === "approve" && <CheckCircle2 className="size-4" aria-hidden />}
              {done === "approve" ? "Acesso permitido. Volte para o programa de IA." : "Pedido recusado."} Pode fechar esta aba.
            </span>
          </Alert>
        )}
      </div>
    </AuthLayout>
  );
}
