import type { EntityStatus } from "@backstage/shared";

/** Uma linha de public.campaign_table (dinheiro em micros; null = sem dados / não informado). */
export interface CampaignRow {
  campaign_id: string;
  name: string;
  external_id: string;
  client_id: string;
  client_name: string;
  platform_id: string;
  ad_account_id: string;
  account_name: string;
  currency: string | null;
  objective: string | null;
  status: EntityStatus;
  raw_status: string | null;
  budget_micros: number | null;
  budget_period: "diario" | "vitalicio" | null;
  has_data: boolean;
  spend_micros: number | null;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc_micros: number | null;
  cpm_micros: number | null;
  leads: number | null;
  messages: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  cpl_micros: number | null;
  cpa_micros: number | null;
  roas: number | null;
  total_count: number;
}
