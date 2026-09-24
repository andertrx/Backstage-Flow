-- =============================================================================
-- ETAPA 8 — Saúde das contas
--
-- public.account_health() junta, para cada conta vinculada:
--   * o saldo (reaproveita public.account_balances: última fotografia + gasto 7 dias)
--   * o estado da sincronização (sync_state)
--   * o estado da conexão com a plataforma (platform_connections — só admin e
--     gestor enxergam; para os demais papéis vem vazio, pelo RLS)
-- A classificação final (Ativa, Atenção, Restrita...) é feita no código
-- compartilhado (packages/shared), para ser igual no site e nos alertas.
--
-- Nenhuma tabela nova. Roda com a permissão de quem pergunta (RLS vale).
-- =============================================================================

create function public.account_health(
  p_client_ids uuid[] default null,
  p_platforms text[] default null
)
returns table (
  ad_account_id uuid,
  client_id uuid,
  client_name text,
  platform_id text,
  external_id text,
  name text,
  currency text,
  status public.ad_account_status,
  raw_status text,
  status_reason text,
  is_test_account boolean,
  details_updated_at timestamptz,
  low_balance_days integer,
  low_balance_amount_micros bigint,
  captured_at timestamptz,
  available_micros bigint,
  issues text[],
  spend_last_7_days_micros bigint,
  spend_days integer,
  sync_status text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error_message text,
  connection_id uuid,
  connection_status text,
  connection_error text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.ad_account_id, b.client_id, b.client_name, b.platform_id, b.external_id, b.name, b.currency, b.status,
         a.raw_status, a.status_reason, a.is_test_account, a.details_updated_at,
         b.low_balance_days, b.low_balance_amount_micros, b.captured_at, b.available_micros, b.issues,
         b.spend_last_7_days_micros, b.spend_days,
         s.status, s.last_attempt_at, s.last_success_at, s.last_error_message,
         a.connection_id, c.status, c.last_error
  from public.account_balances(p_client_ids, p_platforms, null) b
  join public.ad_accounts a on a.id = b.ad_account_id
  left join public.sync_state s on s.ad_account_id = a.id
  left join public.platform_connections c on c.id = a.connection_id
$$;

comment on function public.account_health(uuid[], text[]) is
  'Saúde das contas: status da plataforma, saldo, sincronização e conexão. Roda com o RLS do usuário.';

revoke all on function public.account_health(uuid[], text[]) from public, anon;
grant execute on function public.account_health(uuid[], text[]) to authenticated, service_role;
