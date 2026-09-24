import type { StructureLevel } from "@backstage/shared";
import type { MetricRow } from "@/features/campaigns/types.ts";

/** Uma linha de public.entity_rows (campanha, conjunto/grupo ou anúncio). */
export interface EntityRow extends MetricRow {
  id: string;
  level: StructureLevel;
  parent_id: string | null;
  campaign_id: string;
  client_id: string;
  ad_account_id: string;
  /** Campanha: objetivo · Conjunto/grupo: otimização · Anúncio: tipo do criativo. */
  detail: string | null;
  review_status: string | null;
  thumbnail_url: string | null;
}

/** Uma linha de public.entity_changes (histórico de alterações). */
export interface EntityChange {
  id: number;
  field: string;
  old_value: unknown;
  new_value: unknown;
  source: string;
  changed_at: string | null;
  detected_at: string;
}
