-- Etapa 37.6 — Visão geral e integração: resumo dos alertas (por cliente e plataforma) e histórico (criados, resolvidos, avaliações).
-- Só leitura. Respeita os clientes liberados para quem pede. "Ignorado" não conta como aberto.

create or replace function private.monitor_summary_impl(p_client uuid, p_platform text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  if p_platform is not null and p_platform not in ('meta', 'google') then
    raise exception 'Plataforma inválida.' using errcode = '22023';
  end if;
  return (
    with a as (
      select a.* from public.monitor_alerts a
       where a.resolved_at is null and private.can_view_client(a.client_id)
         and (p_client is null or a.client_id = p_client) and (p_platform is null or a.platform_id = p_platform)
    ), o as (select * from a where a.status <> 'ignorado')
    select jsonb_build_object(
      'open', jsonb_build_object('critico', (select count(*) from o where severity = 'critico'),
                                 'atencao', (select count(*) from o where severity = 'atencao'),
                                 'informativo', (select count(*) from o where severity = 'informativo')),
      'ignored', (select count(*) from a where a.status = 'ignorado'),
      'new', (select count(*) from o where o.status = 'novo'),
      'unassigned', (select count(*) from o where o.assigned_to is null),
      'mine', (select count(*) from o where o.assigned_to = v_me),
      'by_client', coalesce((select jsonb_agg(x.j order by x.c desc, x.t desc, x.n) from (
          select jsonb_build_object('client_id', o.client_id, 'client_name', cl.name,
                                    'critico', count(*) filter (where o.severity = 'critico'),
                                    'atencao', count(*) filter (where o.severity = 'atencao'),
                                    'informativo', count(*) filter (where o.severity = 'informativo'),
                                    'unassigned', count(*) filter (where o.assigned_to is null)) j,
                 count(*) filter (where o.severity = 'critico') c, count(*) t, cl.name n
            from o join public.clients cl on cl.id = o.client_id
           group by o.client_id, cl.name order by 2 desc, 3 desc, cl.name limit 50) x), '[]'),
      'top', coalesce((select jsonb_agg(x.j order by x.r, x.l desc) from (
          select jsonb_build_object('id', o.id, 'severity', o.severity, 'status', o.status, 'metric', o.metric, 'kind', o.kind,
                                    'variation_pct', o.variation_pct, 'client_name', cl.name, 'platform_id', o.platform_id,
                                    'entity_name', coalesce(ad.name, cp.name, acc.name), 'level', o.level,
                                    'last_detected_at', o.last_detected_at, 'assignee_name', pa.full_name) j,
                 array_position(array['critico', 'atencao', 'informativo'], o.severity) r, o.last_detected_at l
            from o join public.clients cl on cl.id = o.client_id
            join public.ad_accounts acc on acc.id = o.ad_account_id
            left join public.campaigns cp on cp.id = o.campaign_id
            left join public.ads ad on ad.id = o.ad_id
            left join public.profiles pa on pa.id = o.assigned_to
           order by 2, 3 desc limit 5) x), '[]'),
      'last_run_at', (select max(r.finished_at) from public.monitor_runs r where r.error is null)
    )
  );
end;
$$;

-- Histórico: o que aconteceu nos últimos N dias (fuso de São Paulo).
create or replace function private.monitor_history_impl(p_days integer, p_client uuid, p_platform text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to date := (now() at time zone 'America/Sao_Paulo')::date;
  v_from date;
  v_start timestamptz;
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 7 and 180 then
    raise exception 'Período inválido (7 a 180 dias).' using errcode = '22023';
  end if;
  if p_platform is not null and p_platform not in ('meta', 'google') then
    raise exception 'Plataforma inválida.' using errcode = '22023';
  end if;
  v_from := v_to - (p_days - 1);
  v_start := v_from::timestamp at time zone 'America/Sao_Paulo';
  return (
    with a as (
      select a.* from public.monitor_alerts a
       where private.can_view_client(a.client_id)
         and (p_client is null or a.client_id = p_client) and (p_platform is null or a.platform_id = p_platform)
         and (a.first_detected_at >= v_start or a.resolved_at >= v_start)
    ), c as (select * from a where a.first_detected_at >= v_start),
    r as (select * from a where a.resolved_at >= v_start),
    f as (
      select e.to_value from public.monitor_alert_events e join a on a.id = e.alert_id
       where e.kind = 'avaliacao' and e.created_at >= v_start
    )
    select jsonb_build_object(
      'from', v_from, 'to', v_to,
      'days', (select jsonb_agg(jsonb_build_object('day', d::date,
                 'created', (select count(*) from c where (c.first_detected_at at time zone 'America/Sao_Paulo')::date = d::date),
                 'resolved', (select count(*) from r where (r.resolved_at at time zone 'America/Sao_Paulo')::date = d::date)) order by d)
               from generate_series(v_from, v_to, interval '1 day') d),
      'created', (select count(*) from c),
      'created_by_severity', jsonb_build_object('critico', (select count(*) from c where severity = 'critico'),
                                                'atencao', (select count(*) from c where severity = 'atencao'),
                                                'informativo', (select count(*) from c where severity = 'informativo')),
      'still_open', (select count(*) from c where c.resolved_at is null),
      'recurrences', (select count(*) from c where c.recurrence_of is not null),
      'resolved', (select count(*) from r),
      'resolved_manual', (select count(*) from r where r.resolution = 'manual'),
      'resolved_auto', (select count(*) from r where r.resolution = 'automatica' and coalesce(r.details ->> 'closed_reason', '') <> 'inativo'),
      'resolved_inactive', (select count(*) from r where r.details ->> 'closed_reason' = 'inativo'),
      'median_hours', (select round((percentile_cont(0.5) within group (order by extract(epoch from r.resolved_at - r.first_detected_at) / 3600))::numeric, 1) from r),
      'followups', jsonb_build_object('melhorou', (select count(*) from f where to_value = 'melhorou'),
                                      'piorou', (select count(*) from f where to_value = 'piorou'),
                                      'igual', (select count(*) from f where to_value = 'igual'),
                                      'sem_dados', (select count(*) from f where to_value = 'sem_dados')),
      'by_metric', coalesce((select jsonb_agg(jsonb_build_object('metric', x.metric, 'created', x.n) order by x.n desc, x.metric)
                             from (select c.metric, count(*) n from c group by c.metric) x), '[]')
    )
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['monitor_summary_impl(uuid, text)', 'monitor_history_impl(integer, uuid, text)'] loop
    execute format('revoke all on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

create or replace function public.monitor_summary(p_client uuid default null, p_platform text default null) returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_summary_impl(p_client, p_platform) $$;
create or replace function public.monitor_history(p_days integer default 30, p_client uuid default null, p_platform text default null) returns jsonb
language sql stable set search_path = '' as $$ select private.monitor_history_impl(p_days, p_client, p_platform) $$;

do $$
declare f text;
begin
  foreach f in array array['monitor_summary(uuid, text)', 'monitor_history(integer, uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
