-- Etapa 43.1 (06/11/2026) — verificação de alertas mais leve.
-- Medido: a verificação leva ~120 ms sozinha, mas a média real era de 0,7 a 1,6 s (picos de 37 s) porque rodava
-- a cada 15 minutos E ao fim de cada sincronização, junto com milhares de gravações. Agora:
--  (1) quando quem pede é o sistema (agendador ou sincronização, sem pessoa logada), não repete a verificação
--      em menos de 4 minutos (os alertas ficam, no máximo, 4 minutos atrasados; o agendador roda a cada 15);
--      quando é uma pessoa clicando em "verificar agora", roda sempre;
--  (2) a regra "campanha sem entrega" lê o histórico de métricas uma vez só (mesmo resultado, conferido: 0 diferenças).
-- Ponto de volta: supabase/rollback/voltar_alertas_leves_2026_11_06.sql (a versão anterior fica em
-- private.alert_candidates_antes_2026_10_30).

create function private.alert_candidates_base()
 returns table(alert_key text, type text, severity text, client_id uuid, platform_id text, ad_account_id uuid, campaign_id uuid, description text, recommended_action text, details jsonb)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with h as (
    select x.*,
           a.timezone,
           (now() at time zone coalesce(a.timezone, 'America/Sao_Paulo'))::date as today,
           case when x.spend_days > 0 and x.spend_last_7_days_micros is not null
                then x.spend_last_7_days_micros::numeric / x.spend_days end as avg_daily
    from public.account_health() x
    join public.ad_accounts a on a.id = x.ad_account_id
  ),
  b as (
    select h.*,
           case when h.available_micros is not null and h.avg_daily > 0 then h.available_micros / h.avg_daily end as forecast_days,
           h.issues || case h.status::text
             when 'pagamento_pendente' then array['pagamento_pendente']
             when 'restrita' then array['conta_limitada']
             when 'desativada' then array['conta_desativada']
             else array[]::text[] end as all_issues
    from h
  ),
  billing as (
    select 'sem_saldo:' || b.ad_account_id, 'sem_saldo', 'critica', b.client_id, b.platform_id, b.ad_account_id, null::uuid,
           'Conta sem saldo: o limite de gastos foi atingido e os anúncios param de rodar.',
           'Adicionar saldo ou aumentar o limite de gastos da conta na plataforma.',
           jsonb_build_object('available_micros', b.available_micros, 'currency', b.currency)
    from b where b.available_micros = 0
    union all
    select 'saldo_baixo:' || b.ad_account_id, 'saldo_baixo', 'alta', b.client_id, b.platform_id, b.ad_account_id, null,
           'Saldo baixo: ' || private.format_money(b.available_micros, b.currency) || ' disponíveis'
             || case when b.forecast_days is not null
                     then ', cerca de ' || greatest(floor(b.forecast_days), 0)::int || ' dia(s) no ritmo atual de gasto.'
                     else '.' end,
           'Adicionar saldo ou aumentar o limite de gastos antes que acabe.',
           jsonb_build_object('available_micros', b.available_micros, 'currency', b.currency,
                              'forecast_days', round(b.forecast_days, 1), 'low_balance_days', b.low_balance_days)
    from b
    where b.available_micros > 0
      and ((b.forecast_days is not null and b.forecast_days < b.low_balance_days)
           or (b.low_balance_amount_micros is not null and b.available_micros <= b.low_balance_amount_micros))
    union all
    select i.code || ':' || b.ad_account_id,
           case i.code when 'conta_limitada' then 'conta_restrita' else i.code end,
           case i.code when 'sem_forma_pagamento' then 'alta' else 'critica' end,
           b.client_id, b.platform_id, b.ad_account_id, null,
           case i.code
             when 'pagamento_pendente' then 'Problema de pagamento: a plataforma informa pagamento pendente.'
             when 'cobranca_problema' then 'Problema na cobrança informado pela plataforma.'
             when 'conta_limitada' then 'Conta restrita ou limitada pela plataforma.' || coalesce(' Motivo informado: ' || left(b.status_reason, 200), '')
             when 'conta_desativada' then 'Conta desativada pela plataforma.' || coalesce(' Motivo informado: ' || left(b.status_reason, 200), '')
             when 'sem_forma_pagamento' then 'Conta sem forma de pagamento ativa.'
           end,
           case i.code
             when 'pagamento_pendente' then 'Regularizar o pagamento nas configurações de cobrança da plataforma.'
             when 'cobranca_problema' then 'Conferir a forma de pagamento nas configurações de cobrança da plataforma.'
             when 'conta_limitada' then 'Ver o motivo da restrição na própria plataforma e seguir as orientações dela.'
             when 'conta_desativada' then 'Ver o motivo da desativação na própria plataforma e seguir as orientações dela.'
             when 'sem_forma_pagamento' then 'Cadastrar uma forma de pagamento ativa na plataforma.'
           end,
           jsonb_build_object('raw_status', b.raw_status)
    from b
    cross join lateral (select distinct unnest(b.all_issues) as code) i
    where i.code in ('pagamento_pendente', 'cobranca_problema', 'conta_limitada', 'conta_desativada', 'sem_forma_pagamento')
  ),
  sync as (
    select 'erro_api:' || b.ad_account_id, 'erro_api', 'critica', b.client_id, b.platform_id, b.ad_account_id, null::uuid,
           case
             when b.connection_status = 'revogada' then 'A conexão com a plataforma foi desconectada.'
             when b.connection_status = 'erro' then 'Erro na conexão com a plataforma: ' || coalesce(left(b.connection_error, 300), 'sem detalhes.')
             else 'A última sincronização falhou: ' || coalesce(left(b.last_error_message, 300), 'sem detalhes.')
           end,
           case when b.connection_status in ('revogada', 'erro') then 'Reconectar a conta em Configurações → Integrações.'
                else 'Conferir a conexão em Configurações → Integrações e sincronizar de novo.' end,
           jsonb_build_object('sync_status', b.sync_status, 'connection_status', b.connection_status)
    from b
    where coalesce(b.connection_status, '') in ('revogada', 'erro') or coalesce(b.sync_status, '') = 'erro'
    union all
    select 'sincronizacao_atrasada:' || b.ad_account_id, 'sincronizacao_atrasada', 'alta', b.client_id, b.platform_id, b.ad_account_id, null,
           'Sincronização atrasada: a última atualização com sucesso foi há '
             || floor(extract(epoch from now() - b.last_success_at) / 3600)::int || ' horas.',
           'Conferir a conexão em Configurações → Integrações.',
           jsonb_build_object('last_success_at', b.last_success_at)
    from b
    where b.last_success_at < now() - interval '48 hours'
      and not (coalesce(b.connection_status, '') in ('revogada', 'erro') or coalesce(b.sync_status, '') = 'erro')
  ),
  dias_conta as (
    -- contas que têm métrica de campanha em cada dia (lê o histórico uma vez só)
    select m.ad_account_id, m.date
    from public.metrics_daily m
    where m.level = 'campaign' and m.date between current_date - 6 and current_date + 1
    group by m.ad_account_id, m.date
  ),
  dias_campanha as (
    -- campanhas que tiveram impressão em cada dia
    select m.campaign_id, m.date
    from public.metrics_daily m
    where m.level = 'campaign' and m.impressions > 0 and m.date between current_date - 6 and current_date + 1
    group by m.campaign_id, m.date
  ),
  delivery as (
    select 'campanha_sem_entrega:' || c.id, 'campanha_sem_entrega', 'media', c.client_id, c.platform_id, c.ad_account_id, c.id,
           'Campanha ativa sem impressões em ' || to_char(b.today - 2, 'DD/MM') || ' e ' || to_char(b.today - 1, 'DD/MM') || '.',
           null::text,
           jsonb_build_object('campaign_name', c.name, 'days', jsonb_build_array(b.today - 2, b.today - 1))
    from public.campaigns c
    join b on b.ad_account_id = c.ad_account_id
    where c.status = 'ativa'
      and c.first_seen_at < now() - interval '2 days'
      and coalesce(b.available_micros, 1) > 0
      and b.status::text not in ('pagamento_pendente', 'restrita', 'desativada', 'encerrada')
      and exists (select 1 from dias_conta d where d.ad_account_id = c.ad_account_id and d.date = b.today - 1)
      and exists (select 1 from dias_conta d where d.ad_account_id = c.ad_account_id and d.date = b.today - 2)
      and not exists (select 1 from dias_campanha d where d.campaign_id = c.id and d.date between b.today - 2 and b.today - 1)
  )
  select r.alert_key, r.type, r.severity, r.client_id, r.platform_id,
         r.ad_account_id, r.campaign_id, r.description, r.recommended_action, r.details
  from (
    select * from billing union all select * from sync union all select * from delivery
  ) as r(alert_key, type, severity, client_id, platform_id, ad_account_id, campaign_id, description, recommended_action, details)
$function$;

revoke all on function private.alert_candidates_base() from public, anon, authenticated;

create or replace function private.alert_candidates()
returns table (
  alert_key text, type text, severity text, client_id uuid, platform_id text, ad_account_id uuid, campaign_id uuid,
  description text, recommended_action text, details jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
    from private.alert_candidates_base() c
   where private.client_is_active(c.client_id)
$$;

create or replace function private.refresh_alerts_impl()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_created  integer;
  v_updated  integer;
  v_resolved integer;
  v_last     timestamptz;
begin
  if (select auth.uid()) is not null
     and coalesce((select private.current_user_role())::text, '') not in ('admin', 'gestor', 'operador') then
    raise exception 'Sem permissão para verificar alertas' using errcode = '42501';
  end if;

  -- Sistema (sem pessoa logada): não repete a verificação em menos de 4 minutos.
  if (select auth.uid()) is null then
    select s.value::timestamptz into v_last from private.app_settings s where s.key = 'alerts_refreshed_at';
    if v_last is not null and v_last > now() - interval '4 minutes' then
      return jsonb_build_object('skipped', true, 'checked_at', v_last);
    end if;
  end if;

  with n as materialized (
    select * from private.alert_candidates()
  ),
  upd as (
    update public.alerts a
       set last_seen_at = now(), description = n.description, severity = n.severity,
           recommended_action = n.recommended_action, details = n.details
      from n
     where a.alert_key = n.alert_key and a.status <> 'resolvido'
    returning 1
  ),
  ins as (
    insert into public.alerts (alert_key, type, severity, client_id, platform_id, ad_account_id, campaign_id,
                               description, recommended_action, details)
    select n.alert_key, n.type, n.severity, n.client_id, n.platform_id, n.ad_account_id, n.campaign_id,
           n.description, n.recommended_action, n.details
      from n
     where not exists (select 1 from public.alerts a where a.alert_key = n.alert_key and a.status <> 'resolvido')
    returning 1
  ),
  res as (
    update public.alerts a
       set status = 'resolvido', resolved_at = now(), resolution = 'automatica'
     where a.status <> 'resolvido'
       and not exists (select 1 from n where n.alert_key = a.alert_key)
    returning 1
  )
  select (select count(*) from ins), (select count(*) from upd), (select count(*) from res)
    into v_created, v_updated, v_resolved;

  insert into private.app_settings (key, value) values ('alerts_refreshed_at', now()::text)
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'resolved', v_resolved, 'checked_at', now());
end;
$function$;
