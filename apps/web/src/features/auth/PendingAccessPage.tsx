import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { AuthLayout } from "./AuthLayout.tsx";
import { useAuth } from "./AuthProvider.tsx";

/** Usuário logado, mas sem perfil ativo (novo ou desativado). */
export function PendingAccessPage() {
  const { session, signOut } = useAuth();
  return (
    <AuthLayout title="Acesso pendente">
      <div className="space-y-4 text-center">
        <ShieldAlert className="mx-auto size-10 text-amber-500" aria-hidden />
        <p className="text-sm text-slate-600">
          A conta <strong>{session?.user.email}</strong> ainda não foi liberada ou está desativada. Peça a um administrador
          para ativar o seu acesso.
        </p>
        <Button variant="secondary" className="w-full" onClick={signOut}>
          Sair
        </Button>
      </div>
    </AuthLayout>
  );
}
