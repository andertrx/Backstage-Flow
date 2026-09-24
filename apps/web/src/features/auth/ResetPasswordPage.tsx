import { Link, useNavigate } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { AuthLayout } from "./AuthLayout.tsx";
import { useAuth } from "./AuthProvider.tsx";
import { ChangePasswordForm } from "./ChangePasswordForm.tsx";

/** Página aberta pelo link do e-mail de recuperação. */
export function ResetPasswordPage() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();

  if (loading) return <FullPageSpinner />;

  return (
    <AuthLayout title="Criar nova senha">
      {session ? (
        <ChangePasswordForm submitLabel="Salvar e entrar" onDone={() => navigate("/", { replace: true })} />
      ) : (
        <div className="space-y-4">
          <Alert tone="error">
            Este link é inválido ou expirou. Peça um novo link e abra-o no mesmo navegador em que fez o pedido.
          </Alert>
          <Link to="/recuperar-senha" className="block text-center text-sm font-medium text-brand-600 hover:text-brand-700">
            Pedir novo link
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
