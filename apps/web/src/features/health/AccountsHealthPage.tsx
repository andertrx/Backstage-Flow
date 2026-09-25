import { can, formatAccountId, HEALTH_LABELS, HEALTH_STATUSES, type HealthStatus, PLATFORM_LABELS } from "@backstage/shared";
import { RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input, Select } from "@/components/ui/field.tsx";
import { useAuth } from "@/features/auth/AuthProvider.tsx";
import { describeVerify, type RefreshResult, useRefreshBalances } from "@/features/balance/api.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format.ts";
import { useAccountHealth } from "./api.ts";
import { HealthBadge } from "./HealthBadge.tsx";
import { buildHealthItems, countByStatus, filterHealthItems, type HealthItem } from "./rows.ts";

const NOT_AVAILABLE = "Informação não disponível pela API.";

function Balance({ item }: { item: HealthItem }) {
  if (!item.captured_at) return <span className="text-slate-400">Saldo não verificado</span>;
  return (
    <>
      {item.available_micros == null ? (
        <span className="text-slate-400">{NOT_AVAILABLE}</span>
      ) : (
        <span className="font-medium text-slate-900">{formatMoney(item.available_micros / 1_000_000, item.currency ?? "BRL")}</span>
      )}
      <span className="block text-xs text-slate-400">verificado {formatRelative(item.captured_at)}</span>
    </>
  );
}

function LastSync({ item }: { item: HealthItem }) {
  if (!item.last_success_at) return <span className="text-slate-400">Nunca</span>;
  return (
    <>
      <span className="text-slate-900">{formatDateTime(item.last_success_at)}</span>
      <span className="block text-xs text-slate-400">{formatRelative(item.last_success_at)}</span>
    </>
  );
}

function Reasons({ item }: { item: HealthItem }) {
  if (!item.health.reasons.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
      {item.health.reasons.map((r) => <li key={r}>{r}</li>)}
    </ul>
  );
}

function AccountName({ item }: { item: HealthItem }) {
  return (
    <>
      <Link to={`/clientes/${item.client_id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{item.name}</Link>
      <span className="block text-xs text-slate-500">
        {formatAccountId(item.platform_id, item.external_id)}
        {item.is_test_account && " · conta de teste"}
      </span>
    </>
  );
}

export function AccountsHealthPage() {
  const { profile } = useAuth();
  const canManage = can(profile?.role, "clients.edit");
  const { data: rows = [], isLoading, error } = useAccountHealth();
  const refresh = useRefreshBalances();
  const [results, setResults] = useState<RefreshResult[] | null>(null);
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [status, setStatus] = useState<HealthStatus | null>(null);

  const items = useMemo(() => buildHealthItems(rows), [rows]);
  const visible = useMemo(() => filterHealthItems(items, { query, clientId, platform, status }), [items, query, clientId, platform, status]);
  const counts = useMemo(() => countByStatus(items), [items]);
  const clients = useMemo(() => [...new Map(items.map((i) => [i.client_id, i.client_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")), [items]);

  const verify = async () => {
    setResults(null);
    const ids = visible.map((i) => i.ad_account_id);
    const all: RefreshResult[] = [];
    try {
      for (let i = 0; i < ids.length; i += 50) all.push(...(await refresh.mutateAsync(ids.slice(i, i + 50))).results);
    } catch (err) {
      all.push(...ids.map((adAccountId) => ({ adAccountId, ok: false, error: errorMessage(err, "Falha ao verificar.") })));
    }
    setResults(all);
  };
  const failed = results?.filter((r) => !r.ok) ?? [];
  const nameOf = (id: string) => items.find((i) => i.ad_account_id === id)?.name ?? "Conta";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saúde das contas</h1>
          <p className="mt-1 text-sm text-slate-500">Status, saldo e sincronização de todas as contas de anúncio.</p>
        </div>
        {canManage && visible.length > 0 && (
          <Button variant="secondary" loading={refresh.isPending} onClick={verify}>
            {!refresh.isPending && <RefreshCw className="size-4" aria-hidden />} Verificar status e saldo
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
        {HEALTH_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(status === s ? null : s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset transition-colors",
              status === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {HEALTH_LABELS[s]} <span className="ml-1 font-semibold">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input aria-label="Buscar conta" placeholder="Buscar por conta, cliente ou ID" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select aria-label="Cliente" value={clientId ?? ""} onChange={(e) => setClientId(e.target.value || null)}>
          <option value="">Todos os clientes</option>
          {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
        <Select aria-label="Plataforma" value={platform ?? ""} onChange={(e) => setPlatform(e.target.value || null)}>
          <option value="">Todas as plataformas</option>
          {Object.entries(PLATFORM_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </Select>
      </div>

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {results && failed.length === 0 && <Alert tone="success">{describeVerify(results)}</Alert>}
      {failed.length > 0 && (
        <Alert tone="error">
          <ul className="space-y-0.5">
            {failed.map((f) => <li key={f.adAccountId}><strong>{nameOf(f.adAccountId)}:</strong> {f.error}</li>)}
          </ul>
        </Alert>
      )}

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-label="Carregando contas" />
      ) : items.length === 0 ? (
        <Alert tone="info">Nenhuma conta de anúncio vinculada ainda. Vincule contas na página de cada cliente.</Alert>
      ) : visible.length === 0 ? (
        <Alert tone="info">Nenhuma conta encontrada com esses filtros.</Alert>
      ) : (
        <>
          {/* Computador: tabela */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Saúde das contas de anúncio</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-3 font-medium">Plataforma</th>
                  <th scope="col" className="px-4 py-3 font-medium">Conta</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Saldo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Última sincronização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((item) => (
                  <tr key={item.ad_account_id} data-testid="health-row" className="align-top">
                    <td className="px-4 py-3 text-slate-700">{item.client_name}</td>
                    <td className="px-4 py-3 text-slate-700">{PLATFORM_LABELS[item.platform_id] ?? item.platform_id}</td>
                    <td className="px-4 py-3"><AccountName item={item} /></td>
                    <td className="px-4 py-3"><HealthBadge status={item.health.status} /><Reasons item={item} /></td>
                    <td className="px-4 py-3"><Balance item={item} /></td>
                    <td className="px-4 py-3"><LastSync item={item} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Celular: cartões */}
          <ul className="space-y-3 md:hidden">
            {visible.map((item) => (
              <li key={item.ad_account_id}>
                <Card className="space-y-2 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><AccountName item={item} /></div>
                    <HealthBadge status={item.health.status} />
                  </div>
                  <p className="text-xs text-slate-500">{item.client_name} · {PLATFORM_LABELS[item.platform_id] ?? item.platform_id}</p>
                  <Reasons item={item} />
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                    <div><p className="text-xs text-slate-500">Saldo</p><Balance item={item} /></div>
                    <div><p className="text-xs text-slate-500">Última sincronização</p><LastSync item={item} /></div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
