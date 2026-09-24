-- =============================================================================
-- ETAPA 11 — Gráficos (série no tempo do Dashboard)
--
-- public.dashboard_timeseries(): totais por dia, semana (segunda a domingo) ou
-- mês, com os MESMOS filtros e a MESMA regra do resumo (dashboard_summary):
--   * sem filtro de campanha/status → nível conta; com filtro → nível campanha;
--   * uma linha por período × moeda (e por plataforma, se pedido);
--   * NULL continua NULL ("não disponível").
-- Alcance: pessoas únicas NÃO podem ser somadas entre dias nem entre contas.
-- Por isso o alcance só vem quando o agrupamento é diário E o período tem um
-- único item (uma conta ou uma campanha). Nos demais casos: NULL.
-- Roda com a permissão de quem pergunta (RLS). Nenhuma tabela nova.
-- =============================================================================

create function public.dashboard_timeseries(
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
declare
  by_campaign boolean := p_campaign_ids is not null or p_campaign_statuses is not null;
begin
  if p_granularity not in ('day', 'week', 'month') then raise exception 'Agrupamento inválido (use day, week ou month)'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 3700 then raise exception 'Período longo demais (máx. ~10 anos)'; end if;
  if p_granularity = 'day' and p_to - p_from > 400 then raise exception 'Para mais de 400 dias, agrupe por semana ou mês'; end if;

  return query
  select (case p_granularity when 'day' then m.date when 'week' then date_trunc('week', m.date)::date else date_trunc('month', m.date)::date end),
         (case when p_by_platform then m.platform_id end),
         m.currency,
         sum(m.spend_micros)::bigint, sum(m.impressions)::bigint,
         (case when p_granularity = 'day'
                    and count(distinct (case when by_campaign then m.campaign_id else m.ad_account_id end)) = 1
               then sum(m.reach) end)::bigint,
         sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
         sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
         count(distinct m.date)::integer
  from public.metrics_daily m
  left join public.campaigns c on by_campaign and c.id = m.campaign_id
  where m.level = (case when by_campaign then 'campaign' else 'account' end)::public.entity_level
    and m.date between p_from and p_to
    and (p_client_ids is null or m.client_id = any (p_client_ids))
    and (p_platforms is null or m.platform_id = any (p_platforms))
    and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
    and (p_campaign_ids is null or m.campaign_id = any (p_campaign_ids))
    and (p_campaign_statuses is null or c.status = any (p_campaign_statuses))
  group by 1, 2, 3
  order by 1, 2, 3;
end;
$$;

comment on function public.dashboard_timeseries(date, date, text, uuid[], text[], uuid[], uuid[], public.entity_status[], boolean) is
  'Série no tempo do Dashboard (dia/semana/mês), mesmos filtros do resumo, por moeda e opcionalmente por plataforma. Roda com o RLS do usuário.';

revoke all on function public.dashboard_timeseries(date, date, text, uuid[], text[], uuid[], uuid[], public.entity_status[], boolean) from public, anon;
grant execute on function public.dashboard_timeseries(date, date, text, uuid[], text[], uuid[], uuid[], public.entity_status[], boolean) to authenticated, service_role;
