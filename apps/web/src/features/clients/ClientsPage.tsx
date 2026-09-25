import { can, CLIENT_STATUS_LABELS, type ClientStatus, formatPhone } from "@backstage/shared";
import { Building2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { FullPageSpinner } from "@/components/feedback/FullPageSpinner.tsx";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { searchable } from "@/lib/text.ts";
import { useClients } from "./api.ts";
import { ClientFormModal } from "./ClientFormModal.tsx";
import { ClientStatusBadge } from "./StatusBadge.tsx";

const PAGE_SIZE = 25;
type Filter = ClientStatus | "todos";

export function ClientsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: clients, isLoading, error } = useClients();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ativo");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = searchable(query);
    return (clients ?? []).filter(
      (c) =>
        (filter === "todos" || c.status === filter) &&
        (!q || [c.name, c.company, c.owner_name, c.email, c.cnpj].some((field) => searchable(field).includes(q))),
    );
  }, [clients, query, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { todos: clients?.length ?? 0, ativo: 0, pausado: 0, encerrado: 0 };
    for (const c of clients ?? []) result[c.status]++;
    return result;
  }, [clients]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-slate-500">Empresas atendidas pela agência e suas contas de anúncio.</p>
        </div>
        {can(profile?.role, "clients.edit") && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Novo cliente
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input
            aria-label="Buscar cliente"
            placeholder="Buscar por nome, empresa, CNPJ..."
            className="pl-9"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar por status">
          {(["ativo", "pausado", "encerrado", "todos"] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                filter === f ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {f === "todos" ? "Todos" : CLIENT_STATUS_LABELS[f]} <span className="opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {isLoading ? (
        <FullPageSpinner />
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Building2 className="size-10 text-slate-300" aria-hidden />
          <p className="font-medium text-slate-700">
            {clients?.length ? "Nenhum cliente encontrado com esses filtros." : "Nenhum cliente cadastrado ainda."}
          </p>
          {!clients?.length && !can(profile?.role, "clients.edit") && (
            <p className="text-sm text-slate-500">Peça a um administrador para liberar seus clientes.</p>
          )}
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Cadastro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer whitespace-nowrap hover:bg-slate-50"
                  onClick={() => navigate(`/clientes/${c.id}`)}
                >
                  <td className="px-4 py-3">
                    <a href={`/clientes/${c.id}`} className="font-medium text-slate-900" onClick={(e) => e.preventDefault()}>
                      {c.name}
                    </a>
                    {c.company && <div className="text-xs text-slate-500">{c.company}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.owner_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{c.email ?? "—"}</div>
                    {c.phone && <div className="text-xs text-slate-500">{formatPhone(c.phone)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <ClientStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>
                {filtered.length} clientes · página {page + 1} de {pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button variant="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {creating && (
        <ClientFormModal client={null} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/clientes/${id}`)} />
      )}
    </div>
  );
}
