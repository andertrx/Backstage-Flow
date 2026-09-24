import type { AccountStatus, PlatformAccount } from "../types.ts";

/**
 * CustomerStatus da Google Ads API → status normalizado do sistema.
 * ENABLED, CANCELED, SUSPENDED e CLOSED são os valores documentados;
 * UNKNOWN/UNSPECIFIED e qualquer outro viram "desconhecida".
 */
const CUSTOMER_STATUS: Record<string, AccountStatus> = {
  ENABLED: "ativa",
  SUSPENDED: "restrita",
  CANCELED: "encerrada",
  CLOSED: "encerrada",
};

export function mapCustomerStatus(status: unknown): AccountStatus {
  return typeof status === "string" && CUSTOMER_STATUS[status] ? CUSTOMER_STATUS[status] : "desconhecida";
}

/** "1234567890" → "123-456-7890" (formato exibido pelo Google Ads). */
export function formatCustomerId(id: string): string {
  const d = id.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : id;
}

/** Campos comuns a `customer` e `customer_client` (a API responde em camelCase). */
export interface RawCustomer {
  id?: string;
  descriptiveName?: string;
  currencyCode?: string;
  timeZone?: string;
  status?: string;
  manager?: boolean;
  testAccount?: boolean;
}

export function mapCustomer(raw: RawCustomer, manager?: { id: string; name: string | null } | null): PlatformAccount {
  const id = String(raw.id ?? "");
  return {
    externalId: id,
    name: raw.descriptiveName?.trim() || `Conta ${formatCustomerId(id)}`,
    currency: raw.currencyCode?.toUpperCase() ?? null,
    timezone: raw.timeZone ?? null,
    status: mapCustomerStatus(raw.status),
    rawStatus: raw.status ? `customer.status=${raw.status}` : null,
    statusReason: null,
    businessId: manager?.id ?? null,
    businessName: manager?.name ?? null,
    isPrepay: null, // a API não informa se a conta é pré-paga
    managerId: manager?.id ?? null,
    isTestAccount: typeof raw.testAccount === "boolean" ? raw.testAccount : null,
  };
}
