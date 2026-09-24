import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { friendlyAuthError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { AuthLayout } from "./AuthLayout.tsx";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setSubmitting(false);
    // Por segurança, a mensagem de sucesso é a mesma exista ou não o e-mail.
    if (error && error.code !== "user_not_found") return setError(friendlyAuthError(error));
    setSent(true);
  }

  return (
    <AuthLayout title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">
            Se este e-mail estiver cadastrado, você receberá um link em alguns minutos. Abra o link <strong>neste mesmo
            navegador</strong>.
          </Alert>
          <Link to="/login" className="block text-center text-sm font-medium text-brand-600 hover:text-brand-700">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="E-mail">
            {(id) => (
              <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={submitting} disabled={!email}>
            Enviar link
          </Button>
          <Link to="/login" className="block text-center text-sm font-medium text-slate-600 hover:text-slate-900">
            Voltar para o login
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
