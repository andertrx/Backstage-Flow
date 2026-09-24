import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { friendlyAuthError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { AuthLayout } from "./AuthLayout.tsx";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) setError(friendlyAuthError(error));
    // Registra a entrada no log (Etapa 17). Falha aqui não impede o login.
    else void supabase.rpc("log_auth_event", { p_event: "login" }).then(({ error: logError }) => logError && console.error("[log] login", logError));
    // Sucesso: o AuthProvider recebe a sessão e o RedirectIfAuthenticated leva
    // o usuário para a página que ele tentou abrir.
  }

  return (
    <AuthLayout title="Entrar no Backstage Flow" subtitle="Painel de performance de tráfego pago">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="E-mail">
          {(id) => (
            <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Senha">
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={submitting} disabled={!email || !password}>
          Entrar
        </Button>
        <p className="text-center text-sm">
          <Link to="/recuperar-senha" className="font-medium text-brand-600 hover:text-brand-700">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
