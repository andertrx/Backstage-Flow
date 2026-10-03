-- Etapa 37.3 — correção pedida pelo Ander: só campanhas, conjuntos e anúncios ATIVOS geram alerta.
-- Os desativados são descartados; o alerta aberto de um item desativado é encerrado (histórico mantido),
-- com o motivo "inativo". Status conforme a última sincronização da plataforma.

-- Ativo = campanha ativa; no anúncio, também o anúncio e o conjunto dele ativos.
create or replace function private.monitor_entity_active(p_level text, p_campaign_id uuid, p_ad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.status = 'ativa' from public.campaigns c where c.id = p_campaign_id), false)
     and (p_level = 'campaign'
          or coalesce((select a.status = 'ativa'
                              and coalesce((select g.status = 'ativa' from public.ad_groups g where g.id = a.ad_group_id), true)
                         from public.ads a where a.id = p_ad_id), false))
$$;
revoke all on function private.monitor_entity_active(text, uuid, uuid) from public, anon, authenticated;

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
  -- Só campanhas, conjuntos e anúncios ativos (os desativados são descartados).
  for c in select * from pg_temp._mon_cand cd where private.monitor_entity_active(cd.level, cd.campaign_id, cd.ad_id) loop
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

create or replace function private.monitor_normalize()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.monitor_alerts;
  v_n integer := 0;
  v_inactive boolean;
begin
  for v_open in
    select a.* from public.monitor_alerts a
      join pg_temp._mon_acc acc on acc.id = a.ad_account_id and acc.reason is null
     where a.resolved_at is null
       and not exists (select 1 from pg_temp._mon_cand cd
                        where cd.key = a.dedupe_key and private.monitor_entity_active(cd.level, cd.campaign_id, cd.ad_id))
     for update of a
  loop
    v_inactive := not private.monitor_entity_active(v_open.level, v_open.campaign_id, v_open.ad_id);
    update public.monitor_alerts set resolved_at = now(), resolution = 'automatica',
           status = case when status = 'ignorado' then 'ignorado' else 'resolvido' end,
           details = case when v_inactive then details || jsonb_build_object('closed_reason', 'inativo') else details end
     where id = v_open.id;
    insert into public.monitor_alert_events (alert_id, kind, from_value, to_value, note)
    values (v_open.id, 'normalizado', v_open.severity, case when v_inactive then 'inativo' else 'normal' end,
            case when v_inactive then 'Encerrado: a campanha, o conjunto ou o anúncio não está mais ativo.'
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
