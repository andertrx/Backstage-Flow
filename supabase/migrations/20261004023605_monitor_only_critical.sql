-- Correção pedida pelo Ander (04/10): o monitoramento só gera alertas CRÍTICOS (e só de itens ativos, como já era).
-- Gravidade mínima configurável pelo administrador (padrão: crítico). Alertas abaixo do mínimo são encerrados
-- (histórico mantido) com o motivo "abaixo_do_minimo". Nada é apagado.

alter table public.monitor_settings
  add column min_severity text not null default 'critico' check (min_severity in ('critico', 'atencao', 'informativo'));
comment on column public.monitor_settings.min_severity is 'Gravidade mínima para gerar e manter alerta (padrão: só críticos).';

-- A gravidade alcança o mínimo configurado?
create or replace function private.monitor_severity_ok(p_severity text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.monitor_severity_rank(p_severity)
         >= private.monitor_severity_rank(coalesce((select s.min_severity from public.monitor_settings s where s.id = 1), 'critico'))
$$;
revoke all on function private.monitor_severity_ok(text) from public, anon, authenticated;

-- Gravação: só itens ativos E com a gravidade mínima.
create or replace function private.monitor_save_candidates(out o_created integer, out o_updated integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_open public.monitor_alerts;
  v_prev public.monitor_alerts;
  v_id bigint;
begin
  o_created := 0; o_updated := 0;
  for c in select * from pg_temp._mon_cand cd
            where private.monitor_entity_active(cd.level, cd.campaign_id, cd.ad_id) and private.monitor_severity_ok(cd.severity) loop
    select * into v_open from public.monitor_alerts a where a.dedupe_key = c.key and a.resolved_at is null for update;
    if found then
      update public.monitor_alerts set
        severity = c.severity, current_value = c.cur, previous_value = c.prev, variation_pct = c.pct,
        period_from = c.period_from, period_to = c.period_to, prev_from = c.prev_from, prev_to = c.prev_to,
        rule_id = c.rule_id, attention_pct = c.att, critical_pct = c.crit, explanation = c.explanation,
        context = c.context, details = c.details, currency = c.currency,
        detections = detections + 1, last_detected_at = now()
       where id = v_open.id;
      if v_open.severity <> c.severity then
        insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, note)
        values (v_open.id, case when c.severity = 'critico' then 'piorou' else 'melhorou' end, v_open.severity, c.severity, c.explanation);
      end if;
      o_updated := o_updated + 1;
    else
      v_prev := null;
      select * into v_prev from public.monitor_alerts a where a.dedupe_key = c.key order by a.id desc limit 1;
      if v_prev.id is not null and v_prev.resolution = 'manual' and v_prev.resolved_at > now() - interval '24 hours' then
        continue;
      end if;
      insert into public.monitor_alerts (dedupe_key, kind, level, metric, severity, client_id, platform_id, ad_account_id,
             campaign_id, ad_group_id, ad_id, currency, current_value, previous_value, variation_pct, period_from, period_to,
             prev_from, prev_to, rule_id, attention_pct, critical_pct, explanation, context, details, recurrence_of, recurrence_count)
      values (c.key, c.kind, c.level, c.metric, c.severity, c.client_id, c.platform_id, c.ad_account_id,
             c.campaign_id, c.ad_group_id, c.ad_id, c.currency, c.cur, c.prev, c.pct, c.period_from, c.period_to,
             c.prev_from, c.prev_to, c.rule_id, c.att, c.crit, c.explanation, c.context, c.details,
             v_prev.id, case when v_prev.id is not null then v_prev.recurrence_count + 1 else 0 end)
      returning id into v_id;
      insert into public.monitor_alert_events (alert_id, kind, to_value, note) values (v_id, 'criado', c.severity, c.explanation);
      o_created := o_created + 1;
    end if;
  end loop;
end;
$$;
revoke all on function private.monitor_save_candidates() from public, anon, authenticated;

-- Encerramento: item desativado ("inativo"), abaixo da gravidade mínima ("abaixo_do_minimo") ou voltou ao normal.
create or replace function private.monitor_normalize()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.monitor_alerts;
  v_n integer := 0;
  v_reason text;
begin
  for v_open in
    select a.* from public.monitor_alerts a
      join pg_temp._mon_acc acc on acc.id = a.ad_account_id and acc.reason is null
     where a.resolved_at is null
       and not exists (select 1 from pg_temp._mon_cand cd
                        where cd.key = a.dedupe_key and private.monitor_entity_active(cd.level, cd.campaign_id, cd.ad_id)
                          and private.monitor_severity_ok(cd.severity))
     for update of a
  loop
    v_reason := case
      when not private.monitor_entity_active(v_open.level, v_open.campaign_id, v_open.ad_id) then 'inativo'
      when exists (select 1 from pg_temp._mon_cand cd where cd.key = v_open.dedupe_key) then 'abaixo_do_minimo'
      else null end;
    update public.monitor_alerts set resolved_at = now(), resolution = 'automatica',
           status = case when status = 'ignorado' then 'ignorado' else 'resolvido' end,
           details = case when v_reason is not null then details || jsonb_build_object('closed_reason', v_reason) else details end
     where id = v_open.id;
    insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, note)
    values (v_open.id, 'normalizado', v_open.severity, coalesce(v_reason, 'normal'),
            case v_reason
              when 'inativo' then 'Encerrado: a campanha, o conjunto ou o anúncio não está mais ativo.'
              when 'abaixo_do_minimo' then 'Encerrado: deixou de ser crítico (o monitoramento só mantém alertas críticos).'
              else 'O indicador voltou para dentro do limite (ou deixou de ter volume suficiente para comparar).' end);
    v_n := v_n + 1;
  end loop;
  insert into public.monitor_account_state (ad_account_id, last_evaluated_at, last_data_at)
  select id, now(), data_at from pg_temp._mon_acc where reason is null
  on conflict (ad_account_id) do update set last_evaluated_at = excluded.last_evaluated_at, last_data_at = excluded.last_data_at;
  return v_n;
end;
$$;
revoke all on function private.monitor_normalize() from public, anon, authenticated;

-- Encerra agora os alertas abertos abaixo do mínimo (hoje: os de atenção e informativos).
with closing as (
  update public.monitor_alerts a set resolved_at = now(), resolution = 'automatica',
         status = case when a.status = 'ignorado' then 'ignorado' else 'resolvido' end,
         details = a.details || jsonb_build_object('closed_reason', 'abaixo_do_minimo')
   where a.resolved_at is null and not private.monitor_severity_ok(a.severity)
  returning a.id, a.severity
)
insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, note)
select id, 'normalizado', severity, 'abaixo_do_minimo',
       'Encerrado: o monitoramento passou a gerar só alertas críticos (04/10/2026). O histórico fica guardado.'
  from closing;

-- Situação: informa a gravidade mínima.
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
    'min_severity', s.min_severity,
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

-- Administrador muda a gravidade mínima (vale a partir da próxima avaliação).
create or replace function private.monitor_min_severity_save_impl(p_min_severity text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.monitor_can('admin') then
    raise exception 'Só o administrador muda quais alertas são gerados' using errcode = '42501';
  end if;
  if p_min_severity is null or p_min_severity not in ('critico', 'atencao', 'informativo') then
    raise exception 'Gravidade inválida.' using errcode = '22023';
  end if;
  update public.monitor_settings set min_severity = p_min_severity, updated_at = now(), updated_by = (select auth.uid()) where id = 1;
end;
$$;
revoke all on function private.monitor_min_severity_save_impl(text) from public, anon;
grant execute on function private.monitor_min_severity_save_impl(text) to authenticated;
create or replace function public.monitor_min_severity_save(p_min_severity text) returns void
language sql set search_path = '' as $$ select private.monitor_min_severity_save_impl(p_min_severity) $$;
revoke all on function public.monitor_min_severity_save(text) from public, anon;
grant execute on function public.monitor_min_severity_save(text) to authenticated;
