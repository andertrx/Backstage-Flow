-- Etapa 37.3 — motor (1/4): prepara as contas da avaliação e o motivo de cada conta pulada.
create or replace function private.monitor_prepare_accounts(p_trigger text, p_today date, p_stale_hours integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suffix text := (extract(epoch from clock_timestamp()) * 1000000)::bigint::text;
begin
  -- Segunda avaliação na mesma transação (ex.: testes): as tabelas de trabalho da anterior
  -- são só renomeadas e somem sozinhas no fim da transação (on commit drop).
  if to_regclass('pg_temp._mon_acc') is not null then
    execute format('alter table pg_temp._mon_acc rename to %I', '_mon_acc_' || v_suffix);
  end if;
  if to_regclass('pg_temp._mon_cand') is not null then
    execute format('alter table pg_temp._mon_cand rename to %I', '_mon_cand_' || v_suffix);
  end if;
  create temp table _mon_acc (
    id uuid, client_id uuid, platform_id text, currency text, today date,
    history_from date, data_at timestamptz, reason text
  ) on commit drop;
  create temp table _mon_cand (
    key text, kind text, level text, metric text, severity text,
    client_id uuid, platform_id text, ad_account_id uuid, campaign_id uuid, ad_group_id uuid, ad_id uuid, currency text,
    cur numeric, prev numeric, pct numeric, period_from date, period_to date, prev_from date, prev_to date,
    rule_id uuid, att numeric, crit numeric, explanation text, context jsonb, details jsonb
  ) on commit drop;

  insert into pg_temp._mon_acc
  select acc.id, acc.client_id, acc.platform_id, acc.currency, d.today, ss.history_from, d.data_at,
         case
           when ss.last_success_at is null then 'nunca_sincronizada'
           when ss.status = 'erro' then 'erro_sincronizacao'
           when ss.last_success_at < now() - make_interval(hours => p_stale_hours) then 'coleta_atrasada'
           when ss.history_from is null or ss.history_from > d.today - 14 or ss.history_to < d.today - 1 then 'historico_incompleto'
           when d.data_at is null then 'sem_dados'
           when p_trigger = 'agendada' and mst.last_data_at is not null and d.data_at <= mst.last_data_at then 'sem_dados_novos'
         end
    from public.ad_accounts acc
    left join public.sync_state ss on ss.ad_account_id = acc.id
    left join public.monitor_account_state mst on mst.ad_account_id = acc.id
    cross join lateral (
      select coalesce(p_today, (now() at time zone coalesce(acc.timezone, 'America/Sao_Paulo'))::date) as today
    ) t
    cross join lateral (
      select t.today,
             (select max(m.synced_at) from public.metrics_daily m
               where m.ad_account_id = acc.id and m.level = 'campaign' and m.date between t.today - 15 and t.today) as data_at
    ) d
   where acc.unlinked_at is null and not coalesce(acc.is_test_account, false) and not acc.is_demo;
end;
$$;
revoke all on function private.monitor_prepare_accounts(text, date, integer) from public, anon, authenticated;
