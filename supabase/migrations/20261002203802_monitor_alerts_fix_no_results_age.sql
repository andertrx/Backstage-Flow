-- Etapa 37.3 — correção: idade do anúncio pelo primeiro dia com gasto no histórico (não pela data em que o CRM o viu).
-- Anúncio sem resultados
create or replace function private.monitor_cand_no_results()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- 4. Anúncio sem resultados depois de gastar o dobro do custo por resultado da campanha no período anterior.
    insert into pg_temp._mon_cand
    with acc as (select * from pg_temp._mon_acc where reason is null),
    camp as (
      select x.campaign_id, a.id as acc_id, a.client_id, a.platform_id, a.currency, a.today, cp.name as camp_name,
             private.monitor_result_kind(cp.objective) as rkind,
             sum(x.spend_micros) as p_spend,
             private.monitor_results(private.monitor_result_kind(cp.objective), sum(x.leads), sum(x.messages), sum(x.conversions), sum(x.link_clicks)) as p_res
        from public.metrics_daily x join acc a on a.id = x.ad_account_id join public.campaigns cp on cp.id = x.campaign_id
       where x.level = 'campaign' and not x.superseded and x.date between a.today - 14 and a.today - 8
       group by x.campaign_id, a.id, a.client_id, a.platform_id, a.currency, a.today, cp.name, cp.objective
    ),
    ads as (
      select x.ad_id, (array_agg(x.ad_group_id))[1] as grp_id, c.*,
             sum(x.spend_micros) as c_spend,
             coalesce(private.monitor_results(c.rkind, sum(x.leads), sum(x.messages), sum(x.conversions), sum(x.link_clicks)), 0) as c_res
        from public.metrics_daily x join camp c on c.campaign_id = x.campaign_id
       where x.level = 'ad' and not x.superseded and x.date between c.today - 7 and c.today - 1 and x.ad_id is not null
       group by x.ad_id, c.campaign_id, c.acc_id, c.client_id, c.platform_id, c.currency, c.today, c.camp_name, c.rkind, c.p_spend, c.p_res
    )
    select 'sem_resultados:ad:' || ads.ad_id || ':results', 'sem_resultados', 'ad', 'results', 'atencao',
           ads.client_id, ads.platform_id, ads.acc_id, ads.campaign_id, ads.grp_id, ads.ad_id, ads.currency,
           0, round(ads.p_spend / 1000000.0 / ads.p_res, 4), null, ads.today - 7, ads.today - 1, ads.today - 14, ads.today - 8,
           null, null, null,
           'Anúncio investiu ' || private.format_money(ads.c_spend::bigint, ads.currency) || ' nos últimos 7 dias sem nenhum resultado. '
             || 'No período anterior, a campanha gastava ' || private.format_money((ads.p_spend / ads.p_res)::bigint, ads.currency)
             || ' por resultado.',
           '[]'::jsonb,
           jsonb_build_object('entity_name', ad.name, 'campaign_name', ads.camp_name, 'result_kind', ads.rkind,
                              'spend_micros', ads.c_spend, 'campaign_prev_results', ads.p_res)
      from ads
      join public.ads ad on ad.id = ads.ad_id
     where ads.rkind <> 'none' and ads.p_res >= 10 and ads.c_res = 0
       and ads.c_spend >= 2 * ads.p_spend / ads.p_res
       -- Anúncio veiculando há pelo menos 7 dias (primeiro dia com gasto no histórico).
       and (select min(g.date) from public.metrics_daily g
             where g.level = 'ad' and g.ad_id = ads.ad_id and not g.superseded and g.spend_micros > 0) <= ads.today - 7;

end;
$$;
revoke all on function private.monitor_cand_no_results() from public, anon, authenticated;
