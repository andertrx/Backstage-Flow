-- Correção (28/09/2026), parte 3: a regra do Meta vale na leitura de TODA
-- fotografia do Meta (as antigas de cartão tinham ficado sem origem nenhuma).
-- As fotografias novas já passam pelo gatilho; o resultado é o mesmo.
-- O histórico guardado não é alterado.
create or replace function public.account_balances(
  p_client_ids uuid[] default null,
  p_platforms text[] default null,
  p_ad_account_ids uuid[] default null
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
  is_prepay boolean,
  low_balance_days integer,
  low_balance_amount_micros bigint,
  captured_at timestamptz,
  available_micros bigint,
  available_basis text,
  amount_spent_micros bigint,
  amount_due_micros bigint,
  spend_cap_micros bigint,
  budget_micros bigint,
  budget_end_at timestamptz,
  funding_description text,
  issues text[],
  spend_last_7_days_micros bigint,
  spend_days integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.client_id, c.name, a.platform_id, a.external_id, a.name, coalesce(s.currency, a.currency), a.status, a.is_prepay,
         a.low_balance_days, a.low_balance_amount_micros,
         s.captured_at,
         case when s.platform_id = 'meta' then private.meta_available_micros(s.payload, s.funding_description, s.currency)
              else s.available_micros end,
         case when s.platform_id = 'meta' then private.meta_available_basis(s.payload, s.funding_description, s.currency)
              else s.available_basis end,
         s.amount_spent_micros, s.balance_micros, s.spend_cap_micros,
         s.budget_micros, s.budget_end_at, s.funding_description,
         case when s.platform_id = 'meta'
              then array_remove(coalesce(s.issues, '{}'), 'sem_saldo')
                   || case when private.meta_available_micros(s.payload, s.funding_description, s.currency) = 0 then array['sem_saldo'] else '{}'::text[] end
              else coalesce(s.issues, '{}') end,
         spend.total, coalesce(spend.days, 0)
  from public.ad_accounts a
  join public.clients c on c.id = a.client_id
  left join lateral (
    select * from public.account_snapshots x
    where x.ad_account_id = a.id
    order by x.captured_at desc
    limit 1
  ) s on true
  left join lateral (
    -- Os 2 dias anteriores (ontem e anteontem) no fuso da conta. Hoje não conta: ainda está incompleto.
    select sum(m.spend_micros)::bigint as total, count(*)::integer as days
    from public.metrics_daily m
    where m.ad_account_id = a.id and m.level = 'account'
      and m.date between (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date - 2
                     and (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date - 1
  ) spend on true
  where a.unlinked_at is null
    and (p_client_ids is null or a.client_id = any (p_client_ids))
    and (p_platforms is null or a.platform_id = any (p_platforms))
    and (p_ad_account_ids is null or a.id = any (p_ad_account_ids))
  order by c.name, a.platform_id, a.name
$$;

comment on function public.account_balances(uuid[], text[], uuid[]) is
  'Saldo de cada conta: última fotografia + gasto dos 2 dias anteriores. Disponível = dinheiro real (saldo pré-pago do Meta ou orçamento do Google), nunca o limite de gastos. Roda com o RLS do usuário.';
