import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@backstage/shared";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import { Modal } from "@/components/ui/modal.tsx";
import type { Profile } from "@/features/auth/types.ts";
import { validateNewPassword } from "@/features/auth/password.ts";
import { errorMessage } from "@/lib/errors.ts";
import { useOpsSectors, useOpsTeam, useSaveMember } from "@/features/operations/api.ts";
import { type MemberDraft, memberDraftFrom, MemberFields } from "@/features/operations/MemberFields.tsx";
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

  // Etapa 36: setores e cargo na Central de Operações (mesmo login; tabela própria).
  const team = useOpsTeam(open);
  const sectors = useOpsSectors();
  const saveMember = useSaveMember();
  const member = user ? team.data?.find((m) => m.user_id === user.id) : undefined;
  const [ops, setOps] = useState<MemberDraft | null>(null);
  const opsDraft = ops ?? memberDraftFrom(member);
  const opsReady = isNew || Boolean(team.data);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError("Informe o nome.");
    if (isNew || password) {
      const problem = validateNewPassword(password);
      if (problem) return setError(problem);
    }
    const withOps = role !== "cliente" && Boolean(opsDraft.primarySector) && (ops !== null || Boolean(member?.in_ops));
    try {
      let userId = user?.id;
      if (isNew) {
        const created = await mutation.mutateAsync({ action: "create", email: email.trim(), fullName: fullName.trim(), role, password });
        userId = created.data.id;
      } else {
        await mutation.mutateAsync({ action: "update", userId: user.id, fullName: fullName.trim(), role });
        if (password) await mutation.mutateAsync({ action: "set_password", userId: user.id, password });
      }
      if (withOps && userId) {
        try {
          await saveMember.mutateAsync({ userId, ...opsDraft });
        } catch (err) {
          setError(`${isNew ? "Usuário criado" : "Usuário salvo"}, mas os setores não foram salvos: ${errorMessage(err)}`);
          return;
        }
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
        {role !== "cliente" && sectors.data && opsReady && (
          <details className="rounded-lg ring-1 ring-slate-200" open={Boolean(member?.in_ops) || role === "equipe"} data-testid="user-ops-section">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800">
              Central de Operações: setores e cargo
              {member?.in_ops && <span className="ml-2 text-xs font-normal text-slate-500">(já participa)</span>}
            </summary>
            <div className="border-t border-slate-100 p-3">
              <MemberFields value={opsDraft} onChange={setOps} sectors={sectors.data} role={role} inOps={Boolean(member?.in_ops)} />
            </div>
          </details>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending || saveMember.isPending}>
            {isNew ? "Criar usuário" : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
