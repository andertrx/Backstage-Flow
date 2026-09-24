import type { AccountStatus, PlatformAccount, PlatformAsset } from "../types.ts";

/**
 * account_status da Marketing API → status normalizado do sistema.
 * Códigos confirmados na documentação: 1, 2, 3, 7, 8, 9.
 * 100/101/201/202 aparecem em versões da referência; se vier qualquer outro
 * código, o status fica "desconhecida" e o código original é guardado.
 */
const ACCOUNT_STATUS: Record<number, AccountStatus> = {
  1: "ativa", // ACTIVE
  2: "desativada", // DISABLED
  3: "pagamento_pendente", // UNSETTLED
  7: "restrita", // PENDING_RISK_REVIEW (em análise de risco)
  8: "pagamento_pendente", // PENDING_SETTLEMENT
  9: "atencao", // IN_GRACE_PERIOD
  100: "atencao", // PENDING_CLOSURE
  101: "encerrada", // CLOSED
  201: "ativa", // ANY_ACTIVE
  202: "encerrada", // ANY_CLOSED
};

export function mapAccountStatus(code: unknown): AccountStatus {
  const n = typeof code === "string" ? Number(code) : code;
  return typeof n === "number" && ACCOUNT_STATUS[n] ? ACCOUNT_STATUS[n] : "desconhecida";
}

/** "act_123" → "123". O banco guarda só os números. */
export function stripActPrefix(id: string): string {
  return id.startsWith("act_") ? id.slice(4) : id;
}

export interface RawAdAccount {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
  disable_reason?: number;
  is_prepay_account?: boolean;
  business?: { id: string; name?: string };
}

export function mapAccount(raw: RawAdAccount): PlatformAccount {
  const disable = raw.disable_reason && raw.disable_reason !== 0 ? `disable_reason=${raw.disable_reason}` : null;
  return {
    externalId: raw.account_id ?? stripActPrefix(raw.id),
    name: raw.name?.trim() || `Conta ${raw.account_id ?? stripActPrefix(raw.id)}`,
    currency: raw.currency?.toUpperCase() ?? null,
    timezone: raw.timezone_name ?? null,
    status: mapAccountStatus(raw.account_status),
    rawStatus: raw.account_status === undefined ? null : `account_status=${raw.account_status}`,
    statusReason: disable,
    businessId: raw.business?.id ?? null,
    businessName: raw.business?.name ?? null,
    isPrepay: typeof raw.is_prepay_account === "boolean" ? raw.is_prepay_account : null,
  };
}

export interface RawPage {
  id: string;
  name?: string;
  instagram_business_account?: { id: string; username?: string };
}

/** Páginas + perfis do Instagram ligados a elas (sem repetir perfis). */
export function mapPages(pages: RawPage[]): PlatformAsset[] {
  const assets: PlatformAsset[] = [];
  const seenIg = new Set<string>();
  for (const page of pages) {
    assets.push({ type: "page", externalId: page.id, name: page.name ?? null, parentExternalId: null });
    const ig = page.instagram_business_account;
    if (ig && !seenIg.has(ig.id)) {
      seenIg.add(ig.id);
      assets.push({ type: "instagram", externalId: ig.id, name: ig.username ? `@${ig.username}` : null, parentExternalId: page.id });
    }
  }
  return assets;
}
