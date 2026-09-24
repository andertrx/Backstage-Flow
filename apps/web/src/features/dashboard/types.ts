import type { MetricTotals } from "@backstage/shared";

/** Uma linha de public.dashboard_summary (uma por moeda). */
export interface SummaryRow extends MetricTotals {
  currency: string;
  source_level: "account" | "campaign";
  link_clicks: number | null;
  accounts: number;
  campaigns: number;
  days_with_data: number;
  last_synced_at: string | null;
}

export interface FilterAccount {
  id: string;
  client_id: string;
  platform_id: string;
  external_id: string;
  name: string;
  currency: string | null;
}

export interface FilterCampaign {
  id: string;
  name: string;
  ad_account_id: string;
  platform_id: string;
  status: string;
}
