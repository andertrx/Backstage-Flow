-- =============================================================================
-- Etapa 30 — Performance
--
-- 1) Índice "resumo" do nível conta: guarda, em ordem de data, só as colunas que
--    o Dashboard, o Histórico e a Visão executiva somam. Consultas de meses ou
--    de 1 ano leem esse índice pequeno (index-only scan) em vez das linhas
--    completas da tabela. NÃO é tabela nova e não guarda dado novo: é um índice,
--    mantido pelo próprio banco. Pode ser removido a qualquer momento.
--
-- 2) dashboard_summary e dashboard_timeseries: o nível (conta ou campanha) era
--    escolhido por fórmula dentro da consulta, e o banco não conseguia usar o
--    índice. Agora são dois caminhos explícitos, com o MESMO resultado.
-- =============================================================================

drop index if exists public.metrics_daily_account_totals_idx;
create index metrics_daily_account_totals_idx on public.metrics_daily (date, client_id)
  include (platform_id, ad_account_id, currency, superseded, spend_micros, impressions, reach, clicks, link_clicks,
           leads, messages, conversions, conversion_value_micros, synced_at)
  where level = 'account';

comment on index public.metrics_daily_account_totals_idx is
  'Etapa 30: somas do nível conta sem ler a tabela inteira (Dashboard, Histórico, Visão executiva).';

create or replace function public.dashboard_summary(
  p_from date,
  p_to date,
  p_client_ids uuid[] default null,
  p_platforms text[] default null,
  p_ad_account_ids uuid[] default null,
  p_campaign_ids uuid[] default null,
  p_campaign_statuses public.entity_status[] default null
)
returns table (
  currency text,
  source_level public.entity_level,
  spend_micros bigint,
  impressions bigint,
  clicks bigint,
  link_clicks bigint,
  leads numeric,
  messages numeric,
  conversions numeric,
  conversion_value_micros bigint,
  accounts integer,
  campaigns integer,
  days_with_data integer,
  last_synced_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 3700 then raise exception 'Período longo demais (máx. ~10 anos)'; end if;

  if p_campaign_ids is null and p_campaign_statuses is null then
    -- Sem filtro de campanha: nível conta (usa o índice resumo).
    return query
    select m.currency, 'account'::public.entity_level,
           sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
           sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
           count(distinct m.ad_account_id)::integer,
           0,
           count(distinct m.date)::integer,
           max(m.synced_at)
    from public.metrics_daily m
    where m.level = 'account'
      and m.date between p_from and p_to
      and (p_client_ids is null or m.client_id = any (p_client_ids))
      and (p_platforms is null or m.platform_id = any (p_platforms))
      and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
    group by m.currency
    order by sum(m.spend_micros) desc, m.currency;
  else
    -- Com filtro de campanha ou status: soma das campanhas filtradas.
    return query
    select m.currency, 'campaign'::public.entity_level,
           sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
           sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
           count(distinct m.ad_account_id)::integer,
           count(distinct m.campaign_id)::integer,
           count(distinct m.date)::integer,
           max(m.synced_at)
    from public.metrics_daily m
    left join public.campaigns c on c.id = m.campaign_id
    where m.level = 'campaign'
      and m.date between p_from and p_to
      and (p_client_ids is null or m.client_id = any (p_client_ids))
      and (p_platforms is null or m.platform_id = any (p_platforms))
      and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
      and (p_campaign_ids is null or m.campaign_id = any (p_campaign_ids))
      and (p_campaign_statuses is null or c.status = any (p_campaign_statuses))
    group by m.currency
    order by sum(m.spend_micros) desc, m.currency;
  end if;
end;
$$;

create or replace function public.dashboard_timeseries(
  p_from date,
  p_to date,
  p_granularity text default 'day',
  p_client_ids uuid[] default null,
  p_platforms text[] default null,
  p_ad_account_ids uuid[] default null,
  p_campaign_ids uuid[] default null,
  p_campaign_statuses public.entity_status[] default null,
  p_by_platform boolean default false
)
returns table (
  bucket date,
  platform_id text,
  currency text,
  spend_micros bigint,
  impressions bigint,
  reach bigint,
  clicks bigint,
  link_clicks bigint,
  leads numeric,
  messages numeric,
  conversions numeric,
  conversion_value_micros bigint,
  days_with_data integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_granularity not in ('day', 'week', 'month') then raise exception 'Agrupamento inválido (use day, week ou month)'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 3700 then raise exception 'Período longo demais (máx. ~10 anos)'; end if;
  if p_granularity = 'day' and p_to - p_from > 400 then raise exception 'Para mais de 400 dias, agrupe por semana ou mês'; end if;

  if p_campaign_ids is null and p_campaign_statuses is null then
    -- Sem filtro de campanha: nível conta (usa o índice resumo).
    return query
    select (case p_granularity when 'day' then m.date when 'week' then date_trunc('week', m.date)::date else date_trunc('month', m.date)::date end),
           (case when p_by_platform then m.platform_id end),
           m.currency,
           sum(m.spend_micros)::bigint, sum(m.impressions)::bigint,
           -- Alcance só existe por dia e de UMA conta (pessoas únicas não se somam).
           (case when p_granularity = 'day' and count(distinct m.ad_account_id) = 1 then sum(m.reach) end)::bigint,
           sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
           sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
           count(distinct m.date)::integer
    from public.metrics_daily m
    where m.level = 'account'
      and m.date between p_from and p_to
      and (p_client_ids is null or m.client_id = any (p_client_ids))
      and (p_platforms is null or m.platform_id = any (p_platforms))
      and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
    group by 1, 2, 3
    order by 1, 2, 3;
  else
    -- Com filtro de campanha ou status: soma das campanhas filtradas.
    return query
    select (case p_granularity when 'day' then m.date when 'week' then date_trunc('week', m.date)::date else date_trunc('month', m.date)::date end),
           (case when p_by_platform then m.platform_id end),
           m.currency,
           sum(m.spend_micros)::bigint, sum(m.impressions)::bigint,
           (case when p_granularity = 'day' and count(distinct m.campaign_id) = 1 then sum(m.reach) end)::bigint,
           sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
           sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
           count(distinct m.date)::integer
    from public.metrics_daily m
    left join public.campaigns c on c.id = m.campaign_id
    where m.level = 'campaign'
      and m.date between p_from and p_to
      and (p_client_ids is null or m.client_id = any (p_client_ids))
      and (p_platforms is null or m.platform_id = any (p_platforms))
      and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
      and (p_campaign_ids is null or m.campaign_id = any (p_campaign_ids))
      and (p_campaign_statuses is null or c.status = any (p_campaign_statuses))
    group by 1, 2, 3
    order by 1, 2, 3;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Índice "resumo" do nível campanha (tabela de Campanhas, filtros por campanha).
-- -----------------------------------------------------------------------------
create index metrics_daily_campaign_totals_idx on public.metrics_daily (date, client_id)
  include (campaign_id, platform_id, ad_account_id, currency, superseded, spend_micros, impressions, reach, clicks, link_clicks,
           leads, messages, conversions, conversion_value_micros, synced_at)
  where level = 'campaign';

comment on index public.metrics_daily_campaign_totals_idx is
  'Etapa 30: somas do nível campanha sem ler a tabela inteira (tabela de Campanhas e filtros por campanha).';

-- -----------------------------------------------------------------------------
-- 4) Plano sob medida para cada período pedido.
--    Depois de 5 chamadas o banco passava a usar um plano "genérico", que não
--    sabe quais meses (partições) consultar e lia todos: uma mesma tela levava
--    0,04 s numa vez e 9 s na outra. Com force_custom_plan o tempo fica estável.
--    Atenção: um "create or replace" futuro destas funções precisa repetir este
--    ajuste (set plan_cache_mode = force_custom_plan).
-- -----------------------------------------------------------------------------
alter function public.dashboard_summary(date, date, uuid[], text[], uuid[], uuid[], public.entity_status[]) set plan_cache_mode = force_custom_plan;
alter function public.dashboard_timeseries(date, date, text, uuid[], text[], uuid[], uuid[], public.entity_status[], boolean) set plan_cache_mode = force_custom_plan;
alter function public.campaign_table(date, date, uuid[], text[], uuid[], public.entity_status[], text, text, boolean, integer, integer) set plan_cache_mode = force_custom_plan;
alter function public.entity_rows(public.entity_level, date, date, uuid, uuid[], public.entity_status[], text, text, boolean, integer, integer) set plan_cache_mode = force_custom_plan;
alter function public.executive_breakdown(date, date, uuid[], text[]) set plan_cache_mode = force_custom_plan;
alter function public.metrics_summary(date, date, uuid[], text[], uuid[]) set plan_cache_mode = force_custom_plan;
alter function public.metrics_timeseries(date, date, text, uuid[], text[], uuid[]) set plan_cache_mode = force_custom_plan;

-- -----------------------------------------------------------------------------
-- 5) Contagem de campanhas/conjuntos/anúncios por status (telas Meta Ads e
--    Google Ads) sem ler as tabelas inteiras (a de anúncios tem ~23 MB).
-- -----------------------------------------------------------------------------
create index ads_account_status_idx on public.ads (ad_account_id, status) include (client_id, campaign_id);
create index ad_groups_account_status_idx on public.ad_groups (ad_account_id, status) include (client_id, campaign_id);
comment on index public.ads_account_status_idx is 'Etapa 30: contagem de anúncios por status (telas Meta Ads / Google Ads) sem ler a tabela inteira.';
comment on index public.ad_groups_account_status_idx is 'Etapa 30: contagem de conjuntos/grupos por status sem ler a tabela inteira.';
