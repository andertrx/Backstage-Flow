import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useConnectionAction, useConnections } from "@/features/ad-accounts/api.ts";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge.tsx";

const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

/** Conexões ativas de uma plataforma, com o botão de desconectar. O token nunca aparece. */
export function ConnectionsList({ platform, emptyText }: { platform: string; emptyText: string }) {
  const { data: connections, isLoading, error } = useConnections(platform);
  const action = useConnectionAction();
  const active = connections?.filter((c) => c.status !== "revogada") ?? [];

  async function disconnect(id: string, label: string) {
    if (!window.confirm(`Desconectar "${label}"? A credencial será apagada do cofre e as contas vinculadas param de atualizar.`)) return;
    try {
      await action.mutateAsync({ action: "disconnect", connectionId: id });
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (isLoading) return <p className="text-sm text-slate-500">Carregando conexões...</p>;
  if (!active.length) return <p className="text-sm text-slate-500">{emptyText}</p>;

  return (
    <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
      {active.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium">{c.label}</p>
              <ConnectionStatusBadge status={c.status} />
            </div>
            <p className="text-xs text-slate-500">
              {c.external_user_name ?? "Conta conectada"} · verificada em {dateTime(c.last_checked_at)}
            </p>
            {c.status === "erro" && c.last_error && <p className="mt-1 text-xs text-red-700">{c.last_error}</p>}
          </div>
          <Button variant="ghost" className="text-xs" onClick={() => disconnect(c.id, c.label)} aria-label={`Desconectar ${c.label}`}>
            Desconectar
          </Button>
        </li>
      ))}
    </ul>
  );
}
