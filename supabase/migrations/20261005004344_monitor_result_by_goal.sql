-- Correção 05/10/2026: o "resultado" passa a seguir a meta de otimização do conjunto (igual ao Gerenciador do Meta),
-- e não só o objetivo da campanha. Ex.: campanha de Engajamento com conjunto otimizado para Conversas = conversas iniciadas.

-- Objetivo "efetivo" de um conjunto: traduz a meta de otimização para o código que monitor_result_kind entende.
create or replace function private.monitor_goal_objective(p_objective text, p_goal text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(coalesce(p_goal, '')) = 'CONVERSATIONS' then 'MESSAGES'
    when upper(coalesce(p_goal, '')) = 'LINK_CLICKS' then 'LINK_CLICKS'
    -- Metas cujo resultado não guardamos (visita ao perfil, ThruPlay, alcance, página de destino...): sem resultado ("—").
    when upper(coalesce(p_goal, '')) in ('PROFILE_VISIT', 'VISIT_INSTAGRAM_PROFILE', 'THRUPLAY', 'VIDEO_VIEWS', 'REACH', 'IMPRESSIONS',
                                         'AD_RECALL_LIFT', 'POST_ENGAGEMENT', 'PROFILE_AND_PAGE_ENGAGEMENT', 'PAGE_LIKES',
                                         'LANDING_PAGE_VIEWS', 'EVENT_RESPONSES') then 'REACH'
    when upper(coalesce(p_goal, '')) in ('QUALITY_LEAD', 'LEAD_GENERATION') then 'OUTCOME_LEADS'
    when upper(coalesce(p_goal, '')) in ('OFFSITE_CONVERSIONS', 'ONSITE_CONVERSIONS', 'VALUE', 'APP_INSTALLS') then
      case when upper(coalesce(p_objective, '')) in ('OUTCOME_LEADS', 'LEAD_GENERATION') then 'OUTCOME_LEADS' else 'OUTCOME_SALES' end
    -- Sem meta (Google) ou meta automática: vale o objetivo da campanha.
    else p_objective
  end
$$;

-- Objetivo efetivo de um conjunto (p_ad_group) ou de uma campanha inteira (p_ad_group nulo).
-- Campanha: se todos os conjuntos (os ativos, quando houver) levam ao mesmo resultado, vale ele; se misturam, '' (= soma, como no dashboard).
create or replace function private.monitor_result_objective(p_campaign uuid, p_ad_group uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_ad_group is not null then
      coalesce((select private.monitor_goal_objective(c.objective, g.optimization_goal)
                  from public.ad_groups g join public.campaigns c on c.id = g.campaign_id where g.id = p_ad_group),
               (select c.objective from public.campaigns c where c.id = p_campaign))
    else coalesce(
      (select case when count(distinct private.monitor_result_kind(x.eo)) = 1 then min(x.eo) else '' end
         from (select private.monitor_goal_objective(c.objective, g.optimization_goal) as eo,
                      g.status = 'ativa' as active,
                      bool_or(g.status = 'ativa') over () as any_active
                 from public.ad_groups g join public.campaigns c on c.id = g.campaign_id
                where g.campaign_id = p_campaign) x
        where x.active or not x.any_active
       having count(*) > 0),
      (select c.objective from public.campaigns c where c.id = p_campaign))
  end
$$;

create or replace function private.monitor_result_kind_for(p_campaign uuid, p_ad_group uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select private.monitor_result_kind(private.monitor_result_objective(p_campaign, p_ad_group)) $$;

revoke all on function private.monitor_goal_objective(text, text) from public, anon, authenticated;
revoke all on function private.monitor_result_objective(uuid, uuid) from public, anon, authenticated;
revoke all on function private.monitor_result_kind_for(uuid, uuid) from public, anon, authenticated;

-- Troca o cálculo do tipo de resultado nas funções do motor e da tela (o restante do corpo continua igual).
do $mig$
declare
  v_def text;
  v_new text;
  r record;
begin
  for r in
    select * from (values
      ('monitor_cand_limits', 'private.monitor_result_kind(cp.objective) as rkind',
                              'private.monitor_result_kind_for(cp.id, case when t.lvl = ''ad'' then t.grp_id end) as rkind'),
      ('monitor_cand_anomalies', 'private.monitor_result_kind(cp.objective)', 'private.monitor_result_kind_for(cp.id, null)'),
      ('monitor_cand_no_results', 'private.monitor_result_kind(cp.objective)', 'private.monitor_result_kind_for(cp.id, null)'),
      ('monitor_period_value', 'private.monitor_result_kind((select c.objective from public.campaigns c where c.id = p_campaign_id))',
                               'private.monitor_result_kind_for(p_campaign_id, case when p_level = ''ad'' then (select d.ad_group_id from public.ads d where d.id = p_ad_id) end)')
    ) as t(fn, old_text, new_text)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = r.fn;
    if v_def is null or position(r.old_text in v_def) = 0 then
      raise exception 'Trecho não encontrado em private.%', r.fn;
    end if;
    v_new := replace(v_def, r.old_text, r.new_text);
    execute v_new;
  end loop;

  -- Sem resultados (anúncio): o anúncio usa o tipo do próprio conjunto e só é comparado com a campanha quando os dois medem a mesma coisa.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'monitor_cand_no_results';
  if position('coalesce(private.monitor_results(c.rkind, sum(x.leads)' in v_def) = 0
     or position('where ads.rkind <> ''none'' and ads.p_res >= 10' in v_def) = 0 then
    raise exception 'Trecho não encontrado em private.monitor_cand_no_results (2)';
  end if;
  v_def := replace(v_def, 'coalesce(private.monitor_results(c.rkind, sum(x.leads)',
                          'private.monitor_result_kind_for(c.campaign_id, (array_agg(x.ad_group_id))[1]) as akind,
             coalesce(private.monitor_results(private.monitor_result_kind_for(c.campaign_id, (array_agg(x.ad_group_id))[1]), sum(x.leads)');
  v_def := replace(v_def, 'where ads.rkind <> ''none'' and ads.p_res >= 10',
                          'where ads.rkind <> ''none'' and ads.akind = ads.rkind and ads.p_res >= 10');
  execute v_def;

  -- Tela (monitor_compare): a coluna "objective" passa a ser o objetivo efetivo (decide o resultado mostrado).
  -- O filtro de objetivo continua usando o objetivo da campanha.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'monitor_compare_impl' and p.pronargs = 11;
  if position('a.camp_id, cp.name, cp.objective, a.grp_id, ag.name,' in v_def) = 0 then
    raise exception 'Trecho não encontrado em private.monitor_compare_impl';
  end if;
  v_def := replace(v_def, 'a.camp_id, cp.name, cp.objective, a.grp_id, ag.name,',
    'a.camp_id, cp.name,
         case when p_level = ''account'' then cp.objective
              else private.monitor_result_objective(a.camp_id, case when p_level in (''ad_group'', ''ad'', ''creative'') then a.grp_id end) end,
         a.grp_id, ag.name,');
  execute v_def;
end;
$mig$;
