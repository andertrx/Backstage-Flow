import { ROLE_LABELS } from "@backstage/shared";
import { Card } from "@/components/ui/card.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";

export function DashboardPage() {
  const { profile } = useAuth();
  const firstName = profile?.full_name.split(" ")[0] || "";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá{firstName && `, ${firstName}`}!</h1>
        <p className="mt-1 text-sm text-slate-500">
          Você entrou como <strong>{profile && ROLE_LABELS[profile.role]}</strong>.
        </p>
      </div>
      <Card className="p-6">
        <p className="text-sm text-slate-600">
          O resumo geral com investimento, leads, CPL e demais indicadores será construído na <strong>Etapa 6</strong>,
          depois que clientes e contas de anúncio estiverem cadastrados.
        </p>
      </Card>
    </div>
  );
}
