import { can } from "@backstage/shared";
import { LayoutDashboard, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { useClients } from "@/features/clients/api.ts";
import { errorMessage } from "@/lib/errors.ts";

/**
 * Página inicial do papel "cliente" (Etapa 19.2): vai direto para o dashboard
 * da empresa. O banco só devolve empresas com o login ligado.
 */
function ClientHome() {
  const { data: clients, isLoading, error } = useClients();
  if (isLoading) return <FullPageSpinner />;
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!clients?.length) {
    return (
      <Card className="mx-auto max-w-md space-y-3 p-6 text-center" data-testid="client-home-off">
        <Lock className="mx-auto size-8 text-slate-400" aria-hidden />
        <h1 className="text-lg font-semibold text-slate-900">Seu painel ainda não está liberado</h1>
        <p className="text-sm text-slate-600">O acesso ao dashboard está desligado no momento. Fale com a agência para liberar.</p>
      </Card>
    );
  }
  if (clients.length === 1) return <Navigate to={`/clientes/${clients[0].id}/dashboard`} replace />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Seus painéis</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => (
          <Link key={c.id} to={`/clientes/${c.id}/dashboard`} className="rounded-xl bg-white p-5 ring-1 ring-slate-200 hover:ring-brand-600">
            <LayoutDashboard className="mb-2 size-5 text-brand-600" aria-hidden />
            <p className="font-medium text-slate-900">{c.name}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Na página inicial: o cliente vai para o painel dele; a equipe vê o Dashboard normal. */
export function ClientHomeOr({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  return profile?.role === "cliente" ? <ClientHome /> : children;
}

/** O dashboard do cliente abre para a equipe (quem vê clientes) e para o papel cliente. */
export function RequireReportAccess({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const ok = profile?.role === "cliente" || can(profile?.role, "clients.view");
  return ok ? children : <Navigate to="/" replace />;
}
