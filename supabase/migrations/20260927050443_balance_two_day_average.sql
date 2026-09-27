-- =============================================================================
-- Previsão de duração do saldo: média de gasto dos 2 DIAS ANTERIORES
--
-- Antes: média dos últimos 7 dias completos.
-- Agora (pedido do usuário): média de ontem e anteontem, no fuso da conta.
-- Hoje continua não contando (o dia ainda está incompleto).
-- Se só um dos dois dias tiver dados, a média é desse dia; sem nenhum, não há previsão.
--
-- Os nomes das colunas (spend_last_7_days_micros / spend_days) ficam iguais para
-- não quebrar quem já usa a função (Saúde das contas e Alertas); agora elas
-- trazem o gasto e a quantidade de dias com dados nesses 2 dias.
-- Alertas de "saldo baixo" e a tela de Saúde passam a usar a mesma regra.
-- =============================================================================
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
         s.captured_at, s.available_micros, s.available_basis, s.amount_spent_micros, s.balance_micros, s.spend_cap_micros,
         s.budget_micros, s.budget_end_at, s.funding_description, coalesce(s.issues, '{}'),
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
  'Saldo de cada conta: última fotografia + gasto dos 2 dias anteriores (ontem e anteontem), usado na previsão de duração. Roda com o RLS do usuário.';
