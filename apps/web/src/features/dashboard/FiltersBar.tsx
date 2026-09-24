import { formatAccountId } from "@backstage/shared";
import { X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Field, Input, Select } from "@/components/ui/field.tsx";
import type { Client } from "@/features/clients/types.ts";
import { formatDate } from "@/lib/format.ts";
import { useFilterAccounts, useFilterCampaigns } from "./api.ts";
import {
  CAMPAIGN_STATUS_OPTIONS,
  type DashboardFilters,
  hasActiveFilters,
  PERIOD_OPTIONS,
  PLATFORM_OPTIONS,
  type PeriodChoice,
  type ResolvedPeriod,
} from "./filters.ts";

interface FiltersBarProps {
  filters: DashboardFilters;
  period: ResolvedPeriod;
  clients: Client[];
  onChange: (patch: Partial<DashboardFilters>) => void;
  onClear: () => void;
}

const range = (r: { from: string; to: string }) => (r.from === r.to ? formatDate(r.from) : `${formatDate(r.from)} a ${formatDate(r.to)}`);

export function FiltersBar({ filters, period, clients, onChange, onClear }: FiltersBarProps) {
  const { data: accounts = [] } = useFilterAccounts();
  const { data: campaigns = [], isFetching: loadingCampaigns } = useFilterCampaigns(filters.clientId, filters.accountId, filters.platform);

  const visibleAccounts = useMemo(
    () => accounts.filter((a) => (!filters.clientId || a.client_id === filters.clientId) && (!filters.platform || a.platform_id === filters.platform)),
    [accounts, filters.clientId, filters.platform],
  );
  const campaignsReady = Boolean(filters.clientId || filters.accountId);

  return (
    <Card className="space-y-4 p-4" role="search" aria-label="Filtros do dashboard">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Período">
          {(id) => (
            <Select
              id={id}
              value={filters.period}
              onChange={(e) => {
                const value = e.target.value as PeriodChoice;
                onChange(value === "custom" ? { period: value, from: period.current.from, to: period.current.to } : { period: value });
              }}
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Cliente">
          {(id) => (
            <Select id={id} value={filters.clientId ?? ""} onChange={(e) => onChange({ clientId: e.target.value || null })}>
              <option value="">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Plataforma">
          {(id) => (
            <Select id={id} value={filters.platform ?? ""} onChange={(e) => onChange({ platform: e.target.value || null, accountId: null })}>
              <option value="">Todas as plataformas</option>
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Conta">
          {(id) => (
            <Select id={id} value={filters.accountId ?? ""} onChange={(e) => onChange({ accountId: e.target.value || null })}>
              <option value="">{visibleAccounts.length ? "Todas as contas" : "Nenhuma conta vinculada"}</option>
              {visibleAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({formatAccountId(a.platform_id, a.external_id)})</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Campanha">
          {(id) => (
            <Select
              id={id}
              value={filters.campaignId ?? ""}
              disabled={!campaignsReady}
              onChange={(e) => onChange({ campaignId: e.target.value || null })}
            >
              <option value="">
                {!campaignsReady ? "Escolha um cliente ou conta" : loadingCampaigns ? "Carregando..." : campaigns.length ? "Todas as campanhas" : "Nenhuma campanha"}
              </option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status da campanha">
          {(id) => (
            <Select id={id} value={filters.status ?? ""} onChange={(e) => onChange({ status: e.target.value || null })}>
              <option value="">Todos os status</option>
              {CAMPAIGN_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {filters.period === "custom" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
          <Field label="De">
            {(id) => (
              <Input id={id} type="date" value={filters.from ?? ""} max={filters.to ?? undefined}
                onChange={(e) => e.target.value && onChange({ from: e.target.value })} />
            )}
          </Field>
          <Field label="Até">
            {(id) => (
              <Input id={id} type="date" value={filters.to ?? ""} min={filters.from ?? undefined}
                onChange={(e) => e.target.value && onChange({ to: e.target.value })} />
            )}
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p data-testid="period-text">
          <strong className="font-medium text-slate-700">{range(period.current)}</strong> · comparado com {range(period.previous)}
        </p>
        {hasActiveFilters(filters) && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onClear}>
            <X className="size-3.5" aria-hidden /> Limpar filtros
          </Button>
        )}
      </div>
    </Card>
  );
}
