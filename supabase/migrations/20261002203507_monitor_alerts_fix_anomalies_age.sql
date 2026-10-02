-- Etapa 37.3 — correção: idade pela data de início da plataforma e pelo primeiro dia com gasto (não pela data em que o CRM viu).
-- Etapa 37.3 — candidatos por anomalia e anúncio sem resultados.
-- Anomalias
create or replace function private.monitor_cand_anomalies()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- 3. Anomalias (campanha): ontem fora do padrão dos 28 dias anteriores (média e desvio). Só com 29 dias de histórico.
    insert into pg_temp._mon_cand
    with acc as (select * from pg_temp._mon_acc where reason is null and history_from <= today - 29),
    camps as (
      select distinct x.campaign_id, a.id as acc_id, a.client_id, a.platform_id, a.currency, a.today
        from public.metrics_daily x join acc a on a.id = x.ad_account_id
       where x.level = 'campaign' and not x.superseded and x.date = a.today - 1 and x.campaign_id is not null
    ),
    days as (
      select c.*, g.d::date as day, cp.name as camp_name, private.monitor_result_kind(cp.objective) as rkind, cp.start_date,
             coalesce(sum(x.spend_micros), 0)::bigint as sp,
             private.monitor_results(private.monitor_result_kind(cp.objective), coalesce(sum(x.leads), 0), coalesce(sum(x.messages), 0),
                                     coalesce(sum(x.conversions), 0), coalesce(sum(x.link_clicks), 0)) as res
        from camps c
        join public.campaigns cp on cp.id = c.campaign_id
        cross join generate_series(c.today - 29, c.today - 1, interval '1 day') g(d)
        left join public.metrics_daily x on x.level = 'campaign' and not x.superseded and x.campaign_id = c.campaign_id and x.date = g.d::date
       group by c.campaign_id, c.acc_id, c.client_id, c.platform_id, c.currency, c.today, g.d, cp.name, cp.objective, cp.start_date
    ),
    st as (
      select d.campaign_id, d.acc_id, d.client_id, d.platform_id, d.currency, d.today, d.camp_name, d.rkind,
             max(d.res) filter (where d.day = d.today - 1) as y_res,
             max(d.sp) filter (where d.day = d.today - 1) as y_sp,
             avg(d.res) filter (where d.day < d.today - 1) as m_res,
             stddev_samp(d.res) filter (where d.day < d.today - 1) as sd_res,
             count(*) filter (where d.day < d.today - 1 and d.sp > 0) as n_active,
             max(case when d.day = d.today - 1 and d.res > 0 then d.sp / 1000000.0 / d.res end) as y_cpr,
             avg(d.sp / 1000000.0 / d.res) filter (where d.day < d.today - 1 and d.res > 0) as m_cpr,
             stddev_samp(d.sp / 1000000.0 / d.res) filter (where d.day < d.today - 1 and d.res > 0) as sd_cpr,
             count(*) filter (where d.day < d.today - 1 and d.res > 0) as n_cpr
        from days d
       where d.rkind <> 'none' and (d.start_date is null or d.start_date <= d.today - 29)
       group by 1, 2, 3, 4, 5, 6, 7, 8
    ),
    an as (
      select st.*, 'results' as metric, st.y_res as y, st.m_res as mean, st.sd_res as sd, (st.m_res - st.y_res) / st.sd_res as z
        from st where st.n_active >= 14 and st.m_res >= 3 and st.sd_res > 0 and st.y_res is not null
      union all
      select st.*, 'cost_per_result', st.y_cpr, st.m_cpr, st.sd_cpr, (st.y_cpr - st.m_cpr) / st.sd_cpr
        from st where st.n_cpr >= 14 and st.y_res >= 3 and st.sd_cpr > 0 and st.y_cpr is not null
    )
    select 'anomalia:campaign:' || an.campaign_id || ':' || an.metric, 'anomalia', 'campaign', an.metric, 'atencao',
           an.client_id, an.platform_id, an.acc_id, an.campaign_id, null, null, an.currency,
           an.y, round(an.mean, 4), case when an.mean <> 0 then round((an.y - an.mean) / abs(an.mean) * 100, 6) end,
           an.today - 1, an.today - 1, an.today - 29, an.today - 2, null, null, null,
           'Fora do padrão: em ' || to_char(an.today - 1, 'DD/MM') || ' ' || lower(private.monitor_metric_label(an.metric)) || ' = '
             || private.monitor_fmt(an.metric, an.y, an.currency) || ', contra média de ' || private.monitor_fmt(an.metric, an.mean, an.currency)
             || ' nos 28 dias anteriores (' || replace(to_char(an.z, 'FM990.0'), '.', ',') || ' desvios-padrão '
             || case when an.metric = 'results' then 'abaixo' else 'acima' end || ').',
           '[]'::jsonb,
           jsonb_build_object('entity_name', an.camp_name, 'campaign_name', an.camp_name, 'result_kind', an.rkind,
                              'mean', round(an.mean, 4), 'stddev', round(an.sd, 4), 'z', round(an.z, 2), 'baseline_days', 28)
      from an
     where an.z >= 3;

end;
$$;
revoke all on function private.monitor_cand_anomalies() from public, anon, authenticated;
