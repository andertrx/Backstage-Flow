import type { HealthInput } from "@backstage/shared";

/** Uma linha de public.account_health (dinheiro em micros; null = não informado). */
export interface AccountHealthRow extends HealthInput {
  ad_account_id: string;
  client_id: string;
  client_name: string;
  platform_id: string;
  external_id: string;
  name: string;
  currency: string | null;
  raw_status: string | null;
  is_test_account: boolean | null;
  details_updated_at: string | null;
  last_attempt_at: string | null;
}
