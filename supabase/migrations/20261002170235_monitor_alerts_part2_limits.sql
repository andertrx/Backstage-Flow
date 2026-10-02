-- Etapa 37.3 — candidatos por limite (lê pg_temp._mon_acc e grava em pg_temp._mon_cand).
-- Variações acima dos limites
create or replace function private.monitor_cand_limits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- 2. Variações acima dos limites (campanha e anúncio): últimos 7 dias completos × 7 anteriores.
    insert into pg_temp._mon_cand
    with acc as (select * from pg_temp._mon_acc where reason is null),
    t as (
      select x.level::text as lvl, a.id as acc_id, a.client_id, a.platform_id, coalesce(a.currency, min(x.currency)) as currency, a.today,
             case when x.level = 'campaign' then x.campaign_id else x.ad_id end as eid,
             (array_agg(x.campaign_id))[1] as camp_id, (array_agg(x.ad_group_id))[1] as grp_id,
             sum(x.spend_micros) filter (where x.date >= a.today - 7)::bigint as c_spend,
             sum(x.impressions) filter (where x.date >= a.today - 7)::bigint as c_impr,
             sum(x.clicks) filter (where x.date >= a.today - 7)::bigint as c_clk,
             sum(x.link_clicks) filter (where x.date >= a.today - 7)::bigint as c_link,
             sum(x.leads) filter (where x.date >= a.today - 7) as c_leads,
             sum(x.messages) filter (where x.date >= a.today - 7) as c_msgs,
             sum(x.conversions) filter (where x.date >= a.today - 7) as c_conv,
             sum(x.conversion_value_micros) filter (where x.date >= a.today - 7)::bigint as c_value,
             count(distinct x.date) filter (where x.date >= a.today - 7)::int as c_days,
             sum(x.spend_micros) filter (where x.date < a.today - 7)::bigint as p_spend,
             sum(x.impressions) filter (where x.date < a.today - 7)::bigint as p_impr,
             sum(x.clicks) filter (where x.date < a.today - 7)::bigint as p_clk,
             sum(x.link_clicks) filter (where x.date < a.today - 7)::bigint as p_link,
             sum(x.leads) filter (where x.date < a.today - 7) as p_leads,
             sum(x.messages) filter (where x.date < a.today - 7) as p_msgs,
             sum(x.conversions) filter (where x.date < a.today - 7) as p_conv,
             sum(x.conversion_value_micros) filter (where x.date < a.today - 7)::bigint as p_value,
             count(distinct x.date) filter (where x.date < a.today - 7)::int as p_days
        from public.metrics_daily x
        join acc a on a.id = x.ad_account_id
       where x.level in ('campaign', 'ad') and not x.superseded and x.date between a.today - 14 and a.today - 1
       group by 1, 2, 3, 4, a.currency, a.today, 7
    ),
    -- Sem nenhum dia de dados no período (dentro do histórico coberto) = não veiculou: zero.
    z as (
      select t.*, cp.objective, cp.first_seen_at as camp_seen, cp.name as camp_name, ad.name as ad_name,
             private.monitor_result_kind(cp.objective) as rkind,
             case when t.c_days = 0 then 0 else t.c_spend end as cs, case when t.c_days = 0 then 0 else t.c_impr end as ci,
             case when t.c_days = 0 then 0 else t.c_clk end as cc, case when t.c_days = 0 then 0 else t.c_link end as cl,
             case when t.c_days = 0 then 0 else t.c_leads end as cle, case when t.c_days = 0 then 0 else t.c_msgs end as cm,
             case when t.c_days = 0 then 0 else t.c_conv end as cco
        from t
        join public.campaigns cp on cp.id = t.camp_id
        left join public.ads ad on ad.id = t.eid and t.lvl = 'ad'
       where t.eid is not null and t.p_days >= 3 and cp.first_seen_at <= t.today - 14
    ),
    e as (
      select z.*, m.metric, r.id as rule_id, r.direction, r.attention_pct, r.critical_pct, r.active, r.scope as rule_scope,
             coalesce(r.min_volume, private.monitor_default_min_volume(m.metric)) as min_vol,
             private.monitor_value(m.metric, z.rkind, z.cs, z.ci, z.cc, z.cl, z.cle, z.cm, z.cco, z.c_value) as cur_v,
             private.monitor_value(m.metric, z.rkind, z.p_spend, z.p_impr, z.p_clk, z.p_link, z.p_leads, z.p_msgs, z.p_conv, z.p_value) as prev_v,
             private.monitor_volume_base(m.metric, z.rkind, z.ci, z.cc, z.cl, z.cle, z.cm, z.cco) as base_cur,
             private.monitor_volume_base(m.metric, z.rkind, z.p_impr, z.p_clk, z.p_link, z.p_leads, z.p_msgs, z.p_conv) as base_prev
        from z
        cross join unnest(array['cost_per_result', 'results', 'cpc', 'cpm', 'ctr', 'roas']) as m(metric)
        join lateral private.monitor_rule_for(m.metric, z.client_id, z.acc_id, z.camp_id, case when z.lvl = 'ad' then z.eid end) r on true
    ),
    k as (
      select e.*, cl.severity, cl.variation_pct
        from e
        cross join lateral private.monitor_classify(
          e.cur_v, e.prev_v, e.direction, e.attention_pct, e.critical_pct,
          e.base_prev >= e.min_vol and (e.metric in ('results', 'cost_per_result') or e.base_cur >= e.min_vol)) cl
       where e.active and cl.severity is not null
    )
    select 'limite:' || k.lvl || ':' || k.eid || ':' || k.metric, 'limite', k.lvl, k.metric, k.severity,
           k.client_id, k.platform_id, k.acc_id, k.camp_id, k.grp_id, case when k.lvl = 'ad' then k.eid end, k.currency,
           k.cur_v, k.prev_v, k.variation_pct, k.today - 7, k.today - 1, k.today - 14, k.today - 8,
           k.rule_id, k.attention_pct, k.critical_pct,
           private.monitor_metric_label(k.metric) || ' ' || case when k.variation_pct > 0 then 'subiu' else 'caiu' end || ' '
             || replace(to_char(abs(k.variation_pct), 'FM999999990.0'), '.', ',') || '% (de '
             || private.monitor_fmt(k.metric, k.prev_v, k.currency) || ' para ' || private.monitor_fmt(k.metric, k.cur_v, k.currency)
             || ') nos últimos 7 dias em relação aos 7 dias anteriores. Limite '
             || case k.severity when 'critico' then 'crítico: ' || replace(rtrim(to_char(k.critical_pct, 'FM9990.##'), '.'), '.', ',')
                                 else 'de atenção: ' || replace(rtrim(to_char(k.attention_pct, 'FM9990.##'), '.'), '.', ',') end || '%.',
           coalesce((select jsonb_agg(jsonb_build_object('field', ec.field, 'level', ec.entity_level, 'old', ec.old_value, 'new', ec.new_value,
                                                         'at', coalesce(ec.changed_at, ec.detected_at)) order by ec.detected_at)
                       from public.entity_changes ec
                      where ec.detected_at >= (k.today - 14)::timestamptz and ec.field in ('status', 'budget_micros')
                        and ((ec.entity_level = 'campaign' and ec.entity_id = k.camp_id)
                             or (k.lvl = 'ad' and ec.entity_level = 'ad' and ec.entity_id = k.eid))), '[]'),
           jsonb_build_object('entity_name', case when k.lvl = 'ad' then k.ad_name else k.camp_name end, 'campaign_name', k.camp_name,
                              'result_kind', k.rkind, 'cur_days', k.c_days, 'prev_days', k.p_days, 'rule_scope', k.rule_scope,
                              'volume_cur', k.base_cur, 'volume_prev', k.base_prev, 'min_volume', k.min_vol)
      from k;

end;
$$;
revoke all on function private.monitor_cand_limits() from public, anon, authenticated;
