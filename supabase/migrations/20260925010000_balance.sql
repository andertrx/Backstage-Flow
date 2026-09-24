-- =============================================================================
-- ETAPA 7 — Verificação de saldo
--
-- Nenhuma tabela nova. Mudanças:
--   * account_snapshots ganha campos de saldo/cobrança (fotografia a cada
--     verificação — permanente, é o histórico do saldo).
--   * ad_accounts ganha o "limite de alerta" de saldo baixo de cada conta.
--   * public.account_balances() → última fotografia de cada conta + gasto
--     médio diário dos últimos 7 dias (para prever quanto o saldo dura).
--
-- Regra: valor disponível só existe quando a API informa o limite E o quanto
-- já foi usado. Caso contrário fica NULL ("Informação não disponível pela API.").
-- =============================================================================

alter table public.account_snapshots
  add column available_micros bigint check (available_micros is null or available_micros >= 0),
  add column available_basis text check (available_basis is null or available_basis in ('meta_spend_cap', 'google_account_budget')),
  add column funding_description text,
  add column budget_end_at timestamptz,
  add column issues text[] not null default '{}'
    check (issues <@ array['pagamento_pendente', 'cobranca_problema', 'conta_limitada', 'conta_desativada', 'sem_saldo', 'sem_forma_pagamento']::text[]);

comment on column public.account_snapshots.available_micros is 'Valor disponível = limite − valor já usado, ambos informados pela API. NULL = a API não informa.';
comment on column public.account_snapshots.available_basis is 'De onde veio o disponível: meta_spend_cap (limite de gastos da conta) ou google_account_budget (orçamento da conta).';
comment on column public.account_snapshots.funding_description is 'Meta: texto da forma de pagamento (funding_source_details.display_string), guardado exatamente como veio.';
comment on column public.account_snapshots.spend_cap_micros is 'Limite: Meta spend_cap (limite de gastos da conta); Google limite ajustado do orçamento da conta.';
comment on column public.account_snapshots.amount_spent_micros is 'Gasto contado contra o limite: Meta amount_spent; Google amount_served do orçamento da conta.';
comment on column public.account_snapshots.budget_micros is 'Google: limite aprovado do orçamento da conta (account_budget).';
comment on column public.account_snapshots.issues is 'Problemas informados pela plataforma (pagamento pendente, cobrança, conta limitada...).';

alter table public.ad_accounts
  add column low_balance_days integer not null default 3 check (low_balance_days between 1 and 60),
  add column low_balance_amount_micros bigint check (low_balance_amount_micros is null or low_balance_amount_micros >= 0);

comment on column public.ad_accounts.low_balance_days is 'Alerta de saldo baixo quando a previsão de duração for menor que este número de dias.';
comment on column public.ad_accounts.low_balance_amount_micros is 'Alerta de saldo baixo quando o disponível for menor ou igual a este valor (opcional).';

-- -----------------------------------------------------------------------------
-- Saldo das contas (com a permissão de quem pergunta: RLS vale)
-- -----------------------------------------------------------------------------
create function public.account_balances(
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
    -- Últimos 7 dias COMPLETOS no fuso da conta (hoje não conta: ainda está incompleto).
    select sum(m.spend_micros)::bigint as total, count(*)::integer as days
    from public.metrics_daily m
    where m.ad_account_id = a.id and m.level = 'account'
      and m.date between (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date - 7
                     and (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date - 1
  ) spend on true
  where a.unlinked_at is null
    and (p_client_ids is null or a.client_id = any (p_client_ids))
    and (p_platforms is null or a.platform_id = any (p_platforms))
    and (p_ad_account_ids is null or a.id = any (p_ad_account_ids))
  order by c.name, a.platform_id, a.name
$$;

comment on function public.account_balances(uuid[], text[], uuid[]) is
  'Saldo de cada conta: última fotografia + gasto dos últimos 7 dias completos. Roda com o RLS do usuário.';

revoke all on function public.account_balances(uuid[], text[], uuid[]) from public, anon;
grant execute on function public.account_balances(uuid[], text[], uuid[]) to authenticated, service_role;
