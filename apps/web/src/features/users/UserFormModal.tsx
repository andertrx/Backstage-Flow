import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@backstage/shared";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import type { Profile } from "@/features/auth/types.ts";
import { validateNewPassword } from "@/features/auth/password.ts";
import { errorMessage } from "@/lib/errors.ts";
import { useAdminUsers } from "./api.ts";

interface Props {
  /** null = criar novo usuário. */
  user: Profile | null;
  open: boolean;
  onClose: () => void;
}

export function UserFormModal({ user, open, onClose }: Props) {
  const isNew = user === null;
  const mutation = useAdminUsers();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "visualizador");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError("Informe o nome.");
    if (isNew || password) {
      const problem = validateNewPassword(password);
      if (problem) return setError(problem);
    }
    try {
      if (isNew) {
        await mutation.mutateAsync({ action: "create", email: email.trim(), fullName: fullName.trim(), role, password });
      } else {
        await mutation.mutateAsync({ action: "update", userId: user.id, fullName: fullName.trim(), role });
        if (password) await mutation.mutateAsync({ action: "set_password", userId: user.id, password });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={isNew ? "Novo usuário" : "Editar usuário"} open={open} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Nome completo">
          {(id) => <Input id={id} value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} />}
        </Field>
        <Field label="E-mail">
          {(id) => <Input id={id} type="email" value={email} disabled={!isNew} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Papel" hint={ROLE_DESCRIPTIONS[role]}>
          {(id) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={isNew ? "Senha inicial" : "Nova senha (opcional)"}
          hint={isNew ? "Passe esta senha para a pessoa. Ela poderá trocá-la em Minha conta." : "Deixe em branco para manter a atual."}
        >
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {isNew ? "Criar usuário" : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
