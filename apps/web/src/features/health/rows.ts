import { accountHealth, formatAccountId, type Health, HEALTH_STATUSES, type HealthStatus } from "@backstage/shared";
import { searchable } from "@/lib/text.ts";
import type { AccountHealthRow } from "./types.ts";

export interface HealthItem extends AccountHealthRow {
  health: Health;
}

export interface HealthFilters {
  query: string;
  clientId: string | null;
  platform: string | null;
  status: HealthStatus | null;
}

/** Calcula a saúde e ordena: piores primeiro, depois por cliente e nome. */
export function buildHealthItems(rows: AccountHealthRow[], now = new Date()): HealthItem[] {
  const rank = (s: HealthStatus) => HEALTH_STATUSES.indexOf(s);
  return rows
    .map((row) => ({ ...row, health: accountHealth(row, now) }))
    .sort((a, b) =>
      rank(a.health.status) - rank(b.health.status) ||
      a.client_name.localeCompare(b.client_name, "pt-BR") ||
      a.name.localeCompare(b.name, "pt-BR")
    );
}

export function filterHealthItems(items: HealthItem[], f: HealthFilters): HealthItem[] {
  const q = searchable(f.query);
  return items.filter((i) =>
    (!f.clientId || i.client_id === f.clientId) &&
    (!f.platform || i.platform_id === f.platform) &&
    (!f.status || i.health.status === f.status) &&
    (!q || [i.name, i.client_name, i.external_id, formatAccountId(i.platform_id, i.external_id)].some((v) => searchable(v).includes(q)))
  );
}

/** Quantas contas em cada status (para os atalhos do topo). */
export function countByStatus(items: HealthItem[]): Record<HealthStatus, number> {
  const counts = Object.fromEntries(HEALTH_STATUSES.map((s) => [s, 0])) as Record<HealthStatus, number>;
  for (const i of items) counts[i.health.status]++;
  return counts;
}
