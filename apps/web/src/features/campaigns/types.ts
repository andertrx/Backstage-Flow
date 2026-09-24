import type { EntityStatus } from "@backstage/shared";

/** Campos comuns a campanhas, conjuntos/grupos e anúncios (dinheiro em micros; null = sem dados / não informado). */
export interface MetricRow {
  name: string;
  external_id: string;
  platform_id: string;
  currency: string | null;
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

/** Uma linha de public.campaign_table. */
export interface CampaignRow extends MetricRow {
  campaign_id: string;
  client_id: string;
  client_name: string;
  ad_account_id: string;
  account_name: string;
  objective: string | null;
}
