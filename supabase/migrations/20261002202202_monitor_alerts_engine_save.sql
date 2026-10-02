-- Etapa 37.3 — motor (2/4): grava os candidatos (atualiza o aberto ou cria, ligando à reincidência).
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
  for c in select * from pg_temp._mon_cand loop
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
      -- Resolvido à mão há menos de 24 h: respeita a decisão (não reabre na hora).
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
