import { ROLE_LABELS } from "@backstage/shared";
import { UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Select } from "@/components/ui/field.tsx";
import { useUsers } from "@/features/users/api.ts";
import { useChangeClientAccess, useClientAccess } from "./api.ts";

/** Quem pode ver este cliente. Somente administradores veem e alteram. */
export function ClientAccessCard({ clientId }: { clientId: string }) {
  const { data: access, isLoading, error } = useClientAccess(clientId, true);
  const { data: users } = useUsers();
  const change = useChangeClientAccess(clientId);
  const [selected, setSelected] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const withAccess = new Set(access?.map((a) => a.user_id));
  // Administradores já veem todos os clientes; só faz sentido liberar para os demais.
  const candidates = (users ?? []).filter((u) => u.active && u.role !== "admin" && !withAccess.has(u.id));

  async function run(userId: string, grant: boolean) {
    setActionError(null);
    try {
      await change.mutateAsync({ userId, grant });
      setSelected("");
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Users className="size-4 text-slate-500" aria-hidden />
        <h2 className="text-base font-semibold">Equipe com acesso</h2>
      </div>
      <p className="mb-4 text-sm text-slate-500">Administradores veem todos os clientes. Aqui você libera os demais usuários.</p>

      {(error || actionError) && <Alert tone="error">{actionError ?? error?.message}</Alert>}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : access?.length ? (
        <ul className="divide-y divide-slate-100">
          {access.map((a) => (
            <li key={a.user_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.profile?.full_name || a.profile?.email}</p>
                <p className="truncate text-xs text-slate-500">{a.profile?.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.profile && <Badge>{ROLE_LABELS[a.profile.role]}</Badge>}
                {a.profile && !a.profile.active && <Badge tone="danger">Inativo</Badge>}
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => run(a.user_id, false)}
                  aria-label={`Remover acesso de ${a.profile?.email}`}
                >
                  <UserMinus className="size-3.5" aria-hidden /> Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nenhum usuário (além dos administradores) tem acesso a este cliente.</p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Select aria-label="Usuário para liberar" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Selecione um usuário...</option>
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {(u.full_name || u.email) + " — " + ROLE_LABELS[u.role]}
            </option>
          ))}
        </Select>
        <Button className="shrink-0" disabled={!selected} loading={change.isPending} onClick={() => run(selected, true)}>
          Liberar acesso
        </Button>
      </div>
    </Card>
  );
}
