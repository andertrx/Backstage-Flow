/** Uma linha de public.account_balances (dinheiro em micros; null = não informado pela API). */
export interface AccountBalance {
  ad_account_id: string;
  client_id: string;
  client_name: string;
  platform_id: string;
  external_id: string;
  name: string;
  currency: string | null;
  status: string;
  is_prepay: boolean | null;
  low_balance_days: number;
  low_balance_amount_micros: number | null;
  captured_at: string | null;
  available_micros: number | null;
  available_basis: "meta_spend_cap" | "google_account_budget" | null;
  amount_spent_micros: number | null;
  amount_due_micros: number | null;
  spend_cap_micros: number | null;
  budget_micros: number | null;
  budget_end_at: string | null;
  funding_description: string | null;
  issues: string[];
  spend_last_7_days_micros: number | null;
  spend_days: number;
}
