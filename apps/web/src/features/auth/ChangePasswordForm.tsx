import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { friendlyAuthError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { validateNewPassword } from "./password.ts";

interface Props {
  submitLabel?: string;
  onDone?: () => void;
}

export function ChangePasswordForm({ submitLabel = "Alterar senha", onDone }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(false);
    const problem = validateNewPassword(password, confirm);
    if (problem) return setError(problem);
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) return setError(friendlyAuthError(error));
    setPassword("");
    setConfirm("");
    setSuccess(true);
    onDone?.();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">Senha alterada com sucesso.</Alert>}
      <Field label="Nova senha" hint="Mínimo de 8 caracteres, com letras e números.">
        {(id) => (
          <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      <Field label="Confirme a nova senha">
        {(id) => (
          <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
      </Field>
      <Button type="submit" className="w-full" loading={submitting} disabled={!password || !confirm}>
        {submitLabel}
      </Button>
    </form>
  );
}
