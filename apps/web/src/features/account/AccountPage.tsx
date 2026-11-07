import { ROLE_LABELS } from "@backstage/shared";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { ChangePasswordForm } from "@/features/auth/ChangePasswordForm.tsx";
import { GoogleAgendaCard } from "@/features/google-agenda/GoogleAgendaCard.tsx";
import { supabase } from "@/lib/supabase.ts";

function ProfileForm() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) return setMessage({ tone: "error", text: "Informe o nome." });
    setSaving(true);
    // O RLS só permite alterar o próprio nome; papel e status são protegidos.
    const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", profile.id);
    setSaving(false);
    if (error) {
      console.error("[conta]", error);
      return setMessage({ tone: "error", text: "Não conseguimos salvar. Tente novamente." });
    }
    await refreshProfile();
    setMessage({ tone: "success", text: "Dados salvos." });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Field label="Nome">{(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="E-mail">{(id) => <Input id={id} value={profile?.email ?? ""} disabled />}</Field>
      <Field label="Papel" hint="Somente um administrador pode alterar o seu papel.">
        {(id) => <Input id={id} value={profile ? ROLE_LABELS[profile.role] : ""} disabled />}
      </Field>
      <Button type="submit" loading={saving}>
        Salvar
      </Button>
    </form>
  );
}

export function AccountPage() {
  const { profile } = useAuth();
  const usaAgenda = profile && profile.role !== "cliente" && profile.role !== "vendedor"; // quem usa a Central de Operações
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold">Dados pessoais</h2>
        <ProfileForm />
      </Card>
      {usaAgenda && <GoogleAgendaCard />}
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold">Alterar senha</h2>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
