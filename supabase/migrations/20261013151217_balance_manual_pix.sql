-- =============================================================================
-- Correção 13/10/2026 — saldo PIX informado no CRM (só para contas marcadas).
--
-- Caso real: "CA - Estilo de Ser Kids" tem cartão cadastrado, mas as campanhas
-- rodam com saldo carregado por PIX. O Meta informa só o cartão
-- (funding_source_details tipo 1, "Mastercard *2039", is_prepay_account=false)
-- e NÃO informa o saldo PIX pela API. Por isso o CRM mostrava R$ 0,00 "Pago no cartão".
--
-- Escolha do Ander (opção a): para essa conta, ele informa no CRM as recargas
-- (ou o saldo atual) e o sistema desconta o gasto que o Meta informa depois disso.
--   disponível = saldo de partida + recargas depois dele − gasto da conta depois dele
-- Partida = o último "saldo atual" informado; sem ele, a primeira recarga (partida 0).
-- O gasto vem de metrics_daily (nível conta, atualizado a cada sincronização);
-- no dia do registro, desconta só o que foi gasto DEPOIS dele (guardamos quanto
-- já tinha sido gasto no dia na hora do registro).
--
-- Só vale para contas com ad_accounts.manual_prepaid = true (ligada só nessa conta).
-- As demais seguem a regra de 28/09. Nada é apagado: registro errado é cancelado.
-- =============================================================================

alter table public.ad_accounts add column manual_prepaid boolean not null default false;
comment on column public.ad_accounts.manual_prepaid is
  'Saldo pré-pago informado no CRM (recargas PIX que a API não informa). Ligado só em contas específicas.';

create table public.account_manual_balance_entries (
  id bigint generated always as identity primary key,
  ad_account_id uuid not null references public.ad_accounts(id),
  client_id uuid not null references public.clients(id),
  kind text not null check (kind in ('recarga', 'saldo')),
  amount_micros bigint not null check (amount_micros >= 0 and amount_micros <= 100000000000000),
  currency text,
  entered_at timestamptz not null default now(),
  -- Dia (no fuso da conta) do registro e quanto já tinha sido gasto nesse dia até o registro.
  account_day date not null,
  day_spend_before_micros bigint not null default 0,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (void_reason is null or char_length(void_reason) <= 200),
  check (kind = 'saldo' or amount_micros > 0)
);
comment on table public.account_manual_balance_entries is
  'Recargas PIX e saldos informados no CRM para contas cujo saldo a API não informa. Permanente: registro errado é cancelado, nunca apagado.';
create index account_manual_balance_entries_account_idx
  on public.account_manual_balance_entries (ad_account_id, entered_at desc);

alter table public.account_manual_balance_entries enable row level security;
revoke all on public.account_manual_balance_entries from anon, authenticated;
grant select on public.account_manual_balance_entries to authenticated;
create policy "Equipe vê os saldos informados dos clientes liberados" on public.account_manual_balance_entries
  for select to authenticated
  using (client_id in (select private.visible_client_ids()) and (select private.current_user_role()) <> 'cliente');

-- -----------------------------------------------------------------------------
-- Cálculo do disponível (null = nada informado ainda).
-- -----------------------------------------------------------------------------
create function private.manual_prepaid_state(p_account uuid)
returns table(available_micros bigint, base_micros bigint, topups_micros bigint, spent_micros bigint, anchor_at timestamptz, anchor_kind text)
language sql stable security definer set search_path = '' as $$
  with e as (
    select * from public.account_manual_balance_entries x
    where x.ad_account_id = p_account and x.voided_at is null
  ),
  anchor as (
    select * from (
      (select e.*, 1 as pri from e where e.kind = 'saldo' order by e.entered_at desc, e.id desc limit 1)
      union all
      (select e.*, 2 from e where e.kind = 'recarga' order by e.entered_at, e.id limit 1)
    ) z order by z.pri limit 1
  ),
  calc as (
    select an.entered_at, an.kind,
           case when an.kind = 'saldo' then an.amount_micros else 0 end as base,
           coalesce((select sum(r.amount_micros) from e r
                     where r.kind = 'recarga' and (r.entered_at, r.id) >= (an.entered_at, an.id)), 0)::bigint as topups,
           greatest(coalesce((select sum(m.spend_micros) from public.metrics_daily m
                              where m.ad_account_id = p_account and m.level = 'account' and m.date >= an.account_day), 0)
                    - an.day_spend_before_micros, 0)::bigint as spent
    from anchor an
  )
  select greatest(c.base + c.topups - c.spent, 0), c.base, c.topups, c.spent, c.entered_at, c.kind from calc c
$$;
revoke all on function private.manual_prepaid_state(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leitura do saldo: contas marcadas usam o saldo informado no CRM.
-- -----------------------------------------------------------------------------
create or replace function public.account_balances(p_client_ids uuid[] default null::uuid[], p_platforms text[] default null::text[], p_ad_account_ids uuid[] default null::uuid[])
 returns table(ad_account_id uuid, client_id uuid, client_name text, platform_id text, external_id text, name text, currency text, status ad_account_status, is_prepay boolean, low_balance_days integer, low_balance_amount_micros bigint, captured_at timestamp with time zone, available_micros bigint, available_basis text, amount_spent_micros bigint, amount_due_micros bigint, spend_cap_micros bigint, budget_micros bigint, budget_end_at timestamp with time zone, funding_description text, issues text[], spend_last_7_days_micros bigint, spend_days integer)
 language sql
 stable
 set search_path to ''
as $function$
  select a.id, a.client_id, c.name, a.platform_id, a.external_id, a.name, coalesce(s.currency, a.currency), a.status, a.is_prepay,
         a.low_balance_days, a.low_balance_amount_micros,
         s.captured_at,
         v.available,
         v.basis,
         s.amount_spent_micros, s.balance_micros, s.spend_cap_micros,
         s.budget_micros, s.budget_end_at, s.funding_description,
         case when s.platform_id = 'meta' or a.manual_prepaid
              then array_remove(coalesce(s.issues, '{}'), 'sem_saldo')
                   || case when v.available = 0 then array['sem_saldo'] else '{}'::text[] end
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
    -- Saldo informado no CRM (só contas marcadas); null enquanto nada foi informado.
    select m.available_micros from private.manual_prepaid_state(a.id) m where a.manual_prepaid
  ) manual on true
  cross join lateral (
    select case when a.manual_prepaid then manual.available_micros
                when s.platform_id = 'meta' then private.meta_available_micros(s.payload, s.funding_description, s.currency)
                else s.available_micros end as available,
           case when a.manual_prepaid then 'manual_prepaid'
                when s.platform_id = 'meta' then private.meta_available_basis(s.payload, s.funding_description, s.currency)
                else s.available_basis end as basis
  ) v
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
$function$;

-- -----------------------------------------------------------------------------
-- Funções da tela.
-- -----------------------------------------------------------------------------

-- Situação + registros (inclui cancelados) de uma conta marcada.
create function private.manual_balance_status_impl(p_ad_account_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_acc public.ad_accounts;
  v_state record;
begin
  select * into v_acc from public.ad_accounts where id = p_ad_account_id;
  if v_acc.id is null or private.current_user_role() = 'cliente' or not private.can_view_client(v_acc.client_id) then
    raise exception 'Conta não encontrada.' using errcode = '42501';
  end if;
  select * into v_state from private.manual_prepaid_state(p_ad_account_id);
  return jsonb_build_object(
    'enabled', v_acc.manual_prepaid,
    'currency', v_acc.currency,
    'available_micros', v_state.available_micros,
    'base_micros', v_state.base_micros,
    'topups_micros', v_state.topups_micros,
    'spent_micros', v_state.spent_micros,
    'anchor_at', v_state.anchor_at,
    'anchor_kind', v_state.anchor_kind,
    'can_edit', private.can_edit_client(v_acc.client_id),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'kind', e.kind, 'amount_micros', e.amount_micros, 'entered_at', e.entered_at,
               'note', e.note, 'created_by_name', p.full_name,
               'voided_at', e.voided_at, 'void_reason', e.void_reason) order by e.entered_at desc, e.id desc)
      from (select * from public.account_manual_balance_entries x where x.ad_account_id = p_ad_account_id
            order by x.entered_at desc, x.id desc limit 50) e
      left join public.profiles p on p.id = e.created_by
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function private.manual_balance_status_impl(uuid) from public, anon;
grant execute on function private.manual_balance_status_impl(uuid) to authenticated;
create function public.manual_balance_status(p_ad_account_id uuid)
returns jsonb language sql stable set search_path = '' as $$ select private.manual_balance_status_impl(p_ad_account_id) $$;
revoke all on function public.manual_balance_status(uuid) from public, anon;
grant execute on function public.manual_balance_status(uuid) to authenticated;

-- Registrar recarga PIX ou saldo atual.
create function private.manual_balance_add_impl(p_ad_account_id uuid, p_kind text, p_amount_micros bigint, p_note text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_acc public.ad_accounts;
  v_day date;
  v_before bigint;
  v_id bigint;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_acc from public.ad_accounts where id = p_ad_account_id;
  if v_acc.id is null or not private.can_edit_client(v_acc.client_id) then
    raise exception 'Sem permissão para informar saldo desta conta.' using errcode = '42501';
  end if;
  if not v_acc.manual_prepaid then
    raise exception 'Esta conta não usa saldo informado no CRM.' using errcode = '22023';
  end if;
  if p_kind not in ('recarga', 'saldo') then
    raise exception 'Tipo inválido.' using errcode = '22023';
  end if;
  if p_amount_micros is null or p_amount_micros < 0 or (p_kind = 'recarga' and p_amount_micros = 0)
     or p_amount_micros > 100000000000000 then
    raise exception 'Valor inválido.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Observação muito longa (máximo 200 caracteres).' using errcode = '22023';
  end if;
  v_day := (now() at time zone coalesce(v_acc.timezone, 'America/Sao_Paulo'))::date;
  select coalesce(sum(m.spend_micros), 0) into v_before
    from public.metrics_daily m
   where m.ad_account_id = v_acc.id and m.level = 'account' and m.date = v_day;
  insert into public.account_manual_balance_entries
    (ad_account_id, client_id, kind, amount_micros, currency, account_day, day_spend_before_micros, note)
  values (v_acc.id, v_acc.client_id, p_kind, p_amount_micros, v_acc.currency, v_day, v_before, v_note)
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'balance.manual.' || p_kind, 'ad_account', v_acc.id::text,
          jsonb_build_object('registro', v_id, 'valor_micros', p_amount_micros, 'moeda', v_acc.currency));
  return v_id;
end;
$$;
revoke all on function private.manual_balance_add_impl(uuid, text, bigint, text) from public, anon;
grant execute on function private.manual_balance_add_impl(uuid, text, bigint, text) to authenticated;
create function public.manual_balance_add(p_ad_account_id uuid, p_kind text, p_amount_micros bigint, p_note text default null)
returns bigint language sql set search_path = '' as $$ select private.manual_balance_add_impl(p_ad_account_id, p_kind, p_amount_micros, p_note) $$;
revoke all on function public.manual_balance_add(uuid, text, bigint, text) from public, anon;
grant execute on function public.manual_balance_add(uuid, text, bigint, text) to authenticated;

-- Cancelar um registro errado (fica no histórico como cancelado).
create function private.manual_balance_void_impl(p_entry_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_e public.account_manual_balance_entries;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_e from public.account_manual_balance_entries where id = p_entry_id;
  if v_e.id is null or not private.can_edit_client(v_e.client_id) then
    raise exception 'Registro não encontrado.' using errcode = '42501';
  end if;
  if v_e.voided_at is not null then
    raise exception 'Este registro já foi cancelado.' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'Motivo muito longo (máximo 200 caracteres).' using errcode = '22023';
  end if;
  update public.account_manual_balance_entries
     set voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where id = p_entry_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'balance.manual.cancel', 'ad_account', v_e.ad_account_id::text,
          jsonb_build_object('registro', v_e.id, 'tipo', v_e.kind, 'valor_micros', v_e.amount_micros, 'motivo', v_reason));
end;
$$;
revoke all on function private.manual_balance_void_impl(bigint, text) from public, anon;
grant execute on function private.manual_balance_void_impl(bigint, text) to authenticated;
create function public.manual_balance_void(p_entry_id bigint, p_reason text default null)
returns void language sql set search_path = '' as $$ select private.manual_balance_void_impl(p_entry_id, p_reason) $$;
revoke all on function public.manual_balance_void(bigint, text) from public, anon;
grant execute on function public.manual_balance_void(bigint, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Liga só na conta pedida pelo Ander (pelo ID do Meta, não pelo ID interno).
-- -----------------------------------------------------------------------------
update public.ad_accounts set manual_prepaid = true
 where platform_id = 'meta' and external_id = '920458724035388';
insert into public.audit_logs (actor_id, action, target_type, target_id, details)
select null, 'balance.manual.enable', 'ad_account', a.id::text,
       jsonb_build_object('conta', a.name, 'motivo', 'Saldo PIX não informado pela API do Meta (pedido do Ander, 13/10/2026).')
  from public.ad_accounts a where a.platform_id = 'meta' and a.external_id = '920458724035388';
