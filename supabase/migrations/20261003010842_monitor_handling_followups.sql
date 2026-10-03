-- Etapa 37.4 — Central de alertas (parte 4): avaliação posterior das providências (3 e 7 dias depois).
-- Compara a métrica do alerta nos dias seguintes à providência com os 7 dias antes dela. Determinístico, sem IA.

-- Valor de uma métrica de campanha ou anúncio num período (null quando não há nenhum dia de dados).
create or replace function private.monitor_period_value(p_level text, p_campaign_id uuid, p_ad_id uuid, p_metric text, p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 0 then null else
    private.monitor_value(p_metric, private.monitor_result_kind((select c.objective from public.campaigns c where c.id = p_campaign_id)),
      sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
      sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint) end
    from public.metrics_daily m
   where not m.superseded and m.date between p_from and p_to
     and ((p_level = 'campaign' and m.level = 'campaign' and m.campaign_id = p_campaign_id)
          or (p_level = 'ad' and m.level = 'ad' and m.ad_id = p_ad_id))
$$;
revoke all on function private.monitor_period_value(text, uuid, uuid, text, date, date) from public, anon, authenticated;

create or replace function private.monitor_followups(p_today date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
  v_before numeric; v_after numeric; v_pct numeric;
  v_dir text; v_verdict text; v_note text; v_label text;
begin
  for r in
    select e.id as ev_id, a.id as alert_id, a.level, a.campaign_id, a.ad_id, a.metric, a.currency, a.rule_id, d.n,
           (e.created_at at time zone coalesce(acc.timezone, 'America/Sao_Paulo'))::date as action_day,
           coalesce(p_today, (now() at time zone coalesce(acc.timezone, 'America/Sao_Paulo'))::date) as today
      from public.monitor_alert_events e
      join public.monitor_alerts a on a.id = e.alert_id
      join public.ad_accounts acc on acc.id = a.ad_account_id
     cross join (values (3), (7)) as d(n)
     where e.kind = 'providencia' and e.created_at > now() - interval '60 days'
       and not exists (select 1 from public.monitor_alert_events x
                        where x.alert_id = a.id and x.kind = 'avaliacao'
                          and x.data ->> 'providencia_id' = e.id::text and (x.data ->> 'days')::int = d.n)
     order by e.id, d.n
  loop
    -- Só depois de passarem os N dias completos seguintes ao dia da providência.
    continue when r.today < r.action_day + r.n + 1;
    v_before := private.monitor_period_value(r.level, r.campaign_id, r.ad_id, r.metric, r.action_day - 7, r.action_day - 1);
    v_after := private.monitor_period_value(r.level, r.campaign_id, r.ad_id, r.metric, r.action_day + 1, r.action_day + r.n);
    v_label := lower(private.monitor_metric_label(r.metric));
    if r.metric = 'results' then
      -- Resultados: média por dia (os dois períodos têm tamanhos diferentes).
      v_before := round(v_before / 7, 2);
      v_after := round(v_after / r.n, 2);
      v_label := 'resultados por dia';
    end if;
    v_dir := coalesce((select mr.direction from public.monitor_rules mr where mr.id = r.rule_id),
                      case when r.metric in ('results', 'ctr', 'roas') then 'down' else 'up' end);
    if v_before is null or v_after is null or v_before = 0 then
      v_verdict := 'sem_dados';
      v_pct := null;
      v_note := 'Avaliação ' || r.n || ' dias após a providência: sem dados suficientes para comparar ' || v_label || '.';
    else
      v_pct := round((v_after - v_before) / abs(v_before) * 100, 1);
      v_verdict := case when abs(v_pct) < 5 then 'igual'
                        when (v_dir = 'up' and v_pct < 0) or (v_dir = 'down' and v_pct > 0) then 'melhorou'
                        else 'piorou' end;
      v_note := 'Avaliação ' || r.n || ' dias após a providência: ' || v_label || ' '
             || private.monitor_fmt(r.metric, v_after, r.currency) || ' (antes ' || private.monitor_fmt(r.metric, v_before, r.currency)
             || ', ' || case when v_pct > 0 then '+' else '' end || replace(v_pct::text, '.', ',') || '%) — '
             || case v_verdict when 'melhorou' then 'melhorou' when 'piorou' then 'piorou' else 'sem mudança relevante' end || '.';
    end if;
    insert into public.monitor_alert_events (alert_id, kind, to_value, note, data)
    values (r.alert_id, 'avaliacao', v_verdict, v_note,
            jsonb_build_object('providencia_id', r.ev_id, 'days', r.n, 'before', v_before, 'after', v_after, 'pct', v_pct,
                               'from', r.action_day + 1, 'to', r.action_day + r.n));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function private.monitor_followups(date) from public, anon, authenticated;
