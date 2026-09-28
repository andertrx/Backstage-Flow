-- =============================================================================
-- Correção (28/09/2026): valor disponível = dinheiro real na conta de anúncios
--
-- Antes: Meta "disponível" = limite de gastos (spend_cap) − valor gasto. Isso é
-- um teto de gastos, não dinheiro: contas pagas no cartão mostravam o limite
-- como se fosse saldo, e as pré-pagas mostravam um valor diferente do Meta.
-- Agora:
--   * meta_prepaid_balance: saldo pré-pago (PIX/boleto), valor que o Meta informa
--     em funding_source_details ("Saldo disponível (R$1.345,32 BRL)").
--   * meta_card: pago no cartão. Não existe saldo em conta (available_micros
--     fica NULL; a tela mostra R$ 0,00). Não gera alerta de "sem saldo".
--   * meta_spend_cap: só nas fotografias antigas. Elas continuam guardadas
--     (histórico não é apagado), mas account_balances() deixa de usá-las como
--     disponível.
-- =============================================================================
alter table public.account_snapshots drop constraint account_snapshots_available_basis_check;
alter table public.account_snapshots add constraint account_snapshots_available_basis_check
  check (available_basis is null or available_basis in ('meta_spend_cap', 'google_account_budget', 'meta_prepaid_balance', 'meta_card'));

comment on column public.account_snapshots.available_micros is
  'Dinheiro disponível na conta, só quando a plataforma informa: Meta = saldo pré-pago (PIX/boleto) informado pelo Meta; Google = orçamento − veiculado. Nunca é o limite de gastos nem o limite do cartão. NULL = não existe ou não foi informado.';
comment on column public.account_snapshots.available_basis is
  'Origem do disponível: meta_prepaid_balance (saldo pré-pago do Meta), meta_card (pago no cartão: sem saldo em conta), google_account_budget (orçamento da conta). meta_spend_cap = regra antiga (limite − gasto), só em fotografias anteriores a 28/09/2026.';

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
         -- A regra antiga (limite − gasto) nunca vira "disponível", nem em fotografia antiga.
         case when s.available_basis = 'meta_spend_cap' then null else s.available_micros end,
         case when s.available_basis = 'meta_spend_cap' then null else s.available_basis end,
         s.amount_spent_micros, s.balance_micros, s.spend_cap_micros,
         s.budget_micros, s.budget_end_at, s.funding_description,
         case when s.available_basis = 'meta_spend_cap' then array_remove(coalesce(s.issues, '{}'), 'sem_saldo') else coalesce(s.issues, '{}') end,
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
  'Saldo de cada conta: última fotografia + gasto dos 2 dias anteriores. Disponível = dinheiro real (saldo pré-pago ou orçamento), nunca o limite de gastos. Roda com o RLS do usuário.';
