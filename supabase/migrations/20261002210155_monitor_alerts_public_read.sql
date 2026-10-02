-- Etapa 37.3 — funções da tela (2/2): situação do motor e lista de alertas.

-- Situação do motor (configuração, última avaliação, alertas abertos visíveis).
create or replace function private.monitor_status_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.monitor_settings;
  r public.monitor_runs;
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  select * into s from public.monitor_settings where id = 1;
  select * into r from public.monitor_runs order by started_at desc limit 1;
  return jsonb_build_object(
    'enabled', s.enabled, 'eval_interval_minutes', s.eval_interval_minutes, 'stale_hours', s.stale_hours,
    'last_run', case when r.id is null then null else jsonb_build_object(
      'started_at', r.started_at, 'finished_at', r.finished_at, 'trigger', r.trigger, 'evaluated', r.accounts_evaluated,
      'skipped', r.accounts_skipped, 'created', r.alerts_created, 'updated', r.alerts_updated, 'resolved', r.alerts_resolved,
      'error', r.error) end,
    'last_evaluated_at', (select max(started_at) from public.monitor_runs where accounts_evaluated > 0),
    'next_run_at', case when s.enabled then coalesce(r.started_at, now()) + make_interval(mins => s.eval_interval_minutes) end,
    'open', (select jsonb_build_object(
               'critico', count(*) filter (where a.severity = 'critico'),
               'atencao', count(*) filter (where a.severity = 'atencao'),
               'informativo', count(*) filter (where a.severity = 'informativo'))
               from public.monitor_alerts a
              where a.resolved_at is null and a.status <> 'ignorado' and private.can_view_client(a.client_id)));
end;
$$;
revoke all on function private.monitor_status_impl() from public, anon;
grant execute on function private.monitor_status_impl() to authenticated;
create or replace function public.monitor_status() returns jsonb language sql stable set search_path = ''
as $$ select private.monitor_status_impl() $$;
revoke all on function public.monitor_status() from public, anon;
grant execute on function public.monitor_status() to authenticated;

-- Lista de alertas com os nomes (só clientes visíveis).
create or replace function private.monitor_alerts_list_impl(p_open boolean, p_limit integer)
returns table (
  id bigint, kind text, level text, metric text, severity text, status text,
  client_id uuid, client_name text, platform_id text, ad_account_id uuid, account_name text,
  campaign_id uuid, campaign_name text, ad_id uuid, ad_name text, thumbnail_url text, currency text,
  current_value numeric, previous_value numeric, variation_pct numeric,
  period_from date, period_to date, prev_from date, prev_to date, attention_pct numeric, critical_pct numeric,
  explanation text, context jsonb, details jsonb, detections integer, first_detected_at timestamptz, last_detected_at timestamptz,
  recurrence_of bigint, recurrence_count integer, resolved_at timestamptz, resolution text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Quantidade inválida (1 a 1000).' using errcode = '22023';
  end if;
  return query
    select a.id, a.kind, a.level, a.metric, a.severity, a.status, a.client_id, cl.name, a.platform_id, a.ad_account_id, acc.name,
           a.campaign_id, cp.name, a.ad_id, ad.name, ad.thumbnail_url, a.currency, a.current_value, a.previous_value, a.variation_pct,
           a.period_from, a.period_to, a.prev_from, a.prev_to, a.attention_pct, a.critical_pct,
           a.explanation, a.context, a.details, a.detections, a.first_detected_at, a.last_detected_at,
           a.recurrence_of, a.recurrence_count, a.resolved_at, a.resolution
      from public.monitor_alerts a
      join public.clients cl on cl.id = a.client_id
      join public.ad_accounts acc on acc.id = a.ad_account_id
      left join public.campaigns cp on cp.id = a.campaign_id
      left join public.ads ad on ad.id = a.ad_id
     where private.can_view_client(a.client_id)
       and (not coalesce(p_open, true) or a.resolved_at is null)
     order by (a.resolved_at is null) desc, array_position(array['critico', 'atencao', 'informativo'], a.severity), a.last_detected_at desc
     limit p_limit;
end;
$$;
revoke all on function private.monitor_alerts_list_impl(boolean, integer) from public, anon;
grant execute on function private.monitor_alerts_list_impl(boolean, integer) to authenticated;
create or replace function public.monitor_alerts_list(p_open boolean default true, p_limit integer default 300)
returns table (
  id bigint, kind text, level text, metric text, severity text, status text,
  client_id uuid, client_name text, platform_id text, ad_account_id uuid, account_name text,
  campaign_id uuid, campaign_name text, ad_id uuid, ad_name text, thumbnail_url text, currency text,
  current_value numeric, previous_value numeric, variation_pct numeric,
  period_from date, period_to date, prev_from date, prev_to date, attention_pct numeric, critical_pct numeric,
  explanation text, context jsonb, details jsonb, detections integer, first_detected_at timestamptz, last_detected_at timestamptz,
  recurrence_of bigint, recurrence_count integer, resolved_at timestamptz, resolution text
)
language sql stable set search_path = ''
as $$ select * from private.monitor_alerts_list_impl(p_open, p_limit) $$;
revoke all on function public.monitor_alerts_list(boolean, integer) from public, anon;
grant execute on function public.monitor_alerts_list(boolean, integer) to authenticated;
