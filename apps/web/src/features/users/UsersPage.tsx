import { ROLE_LABELS } from "@backstage/shared";
import { Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import type { Profile } from "@/features/auth/types.ts";
import { useAdminUsers, useUsers } from "./api.ts";
import { UserFormModal } from "./UserFormModal.tsx";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

function StatusToggle({ user }: { user: Profile }) {
  const { profile } = useAuth();
  const mutation = useAdminUsers();
  const isSelf = profile?.id === user.id;

  async function toggle() {
    const verb = user.active ? "desativar" : "reativar";
    if (!window.confirm(`Deseja ${verb} ${user.full_name || user.email}?`)) return;
    try {
      await mutation.mutateAsync({ action: "update", userId: user.id, active: !user.active });
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return (
    <Button
      variant="ghost"
      className="px-2 py-1 text-xs"
      onClick={toggle}
      loading={mutation.isPending}
      disabled={isSelf}
      title={isSelf ? "Você não pode desativar a si mesmo" : undefined}
    >
      {user.active ? "Desativar" : "Reativar"}
    </Button>
  );
}

export function UsersPage() {
  const { data: users, isLoading, error } = useUsers();
  // undefined = fechado; null = novo; Profile = editar
  const [editing, setEditing] = useState<Profile | null | undefined>(undefined);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="mt-1 text-sm text-slate-500">Quem pode acessar o sistema e com qual papel.</p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <UserPlus className="size-4" aria-hidden /> Novo usuário
        </Button>
      </div>

      {error && <Alert tone="error">{error.message}</Alert>}
      {isLoading ? (
        <FullPageSpinner />
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users?.map((user) => (
                <tr key={user.id} className="whitespace-nowrap">
                  <td className="px-4 py-3 font-medium">{user.full_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge tone={user.role === "admin" ? "brand" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={user.active ? "success" : "danger"}>{user.active ? "Ativo" : "Inativo"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{dateFormat.format(new Date(user.created_at))}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEditing(user)}>
                        <Pencil className="size-3.5" aria-hidden /> Editar
                      </Button>
                      <StatusToggle user={user} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing !== undefined && (
        <UserFormModal key={editing?.id ?? "new"} user={editing} open onClose={() => setEditing(undefined)} />
      )}
    </div>
  );
}
