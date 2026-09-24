import type { AdAccountStatus, ConnectionStatus } from "@backstage/shared";

export interface PlatformConnection {
  id: string;
  platform_id: string;
  label: string;
  status: ConnectionStatus;
  external_user_id: string | null;
  external_user_name: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface AdAccountAsset {
  asset_type: "page" | "instagram";
  external_id: string;
  name: string | null;
}

export interface AdAccount {
  id: string;
  platform_id: string;
  external_id: string;
  client_id: string;
  connection_id: string | null;
  name: string;
  currency: string | null;
  timezone: string | null;
  status: AdAccountStatus;
  raw_status: string | null;
  status_reason: string | null;
  business_name: string | null;
  is_prepay: boolean | null;
  manager_customer_id: string | null;
  is_test_account: boolean | null;
  linked_at: string;
  details_updated_at: string | null;
  assets: AdAccountAsset[];
}

/** Conta listada direto da plataforma, antes de ser vinculada. */
export interface AvailableAccount {
  externalId: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  status: AdAccountStatus;
  businessName: string | null;
  /** Google Ads: MCC que dá acesso à conta. */
  managerId: string | null;
  isTestAccount: boolean | null;
  linkedClientId: string | null;
}
