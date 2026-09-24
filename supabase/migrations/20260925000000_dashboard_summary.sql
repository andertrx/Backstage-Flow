-- =============================================================================
-- ETAPA 6 — Resumo do Dashboard principal
--
-- public.dashboard_summary() soma os números de um período, com os filtros
-- globais do painel: cliente, plataforma, conta, campanha e status da campanha.
--
--   * Sem filtro de campanha/status → soma as linhas de nível "conta"
--     (o total oficial da conta, inclui tudo).
--   * Com filtro de campanha/status → soma as linhas de nível "campanha"
--     das campanhas escolhidas.
--   Nunca mistura os dois níveis (seria contar a mesma coisa duas vezes).
--
-- Uma linha por MOEDA (nunca soma BRL com USD). NULL continua NULL
-- ("Informação não disponível pela API."). Roda com a permissão de quem
-- pergunta: o RLS vale, o gestor só recebe números dos clientes liberados.
-- Nenhuma tabela nova.
-- =============================================================================

create function public.dashboard_summary(
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
declare
  by_campaign boolean := p_campaign_ids is not null or p_campaign_statuses is not null;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 3700 then raise exception 'Período longo demais (máx. ~10 anos)'; end if;

  return query
  select m.currency,
         (case when by_campaign then 'campaign' else 'account' end)::public.entity_level,
         sum(m.spend_micros)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint, sum(m.link_clicks)::bigint,
         sum(m.leads), sum(m.messages), sum(m.conversions), sum(m.conversion_value_micros)::bigint,
         count(distinct m.ad_account_id)::integer,
         count(distinct m.campaign_id)::integer,
         count(distinct m.date)::integer,
         max(m.synced_at)
  from public.metrics_daily m
  left join public.campaigns c on by_campaign and c.id = m.campaign_id
  where m.level = (case when by_campaign then 'campaign' else 'account' end)::public.entity_level
    and m.date between p_from and p_to
    and (p_client_ids is null or m.client_id = any (p_client_ids))
    and (p_platforms is null or m.platform_id = any (p_platforms))
    and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
    and (p_campaign_ids is null or m.campaign_id = any (p_campaign_ids))
    and (p_campaign_statuses is null or c.status = any (p_campaign_statuses))
  group by m.currency
  order by sum(m.spend_micros) desc, m.currency;
end;
$$;

comment on function public.dashboard_summary(date, date, uuid[], text[], uuid[], uuid[], public.entity_status[]) is
  'Totais do Dashboard principal por moeda, com filtros globais. Com filtro de campanha/status usa o nível campanha; sem, o nível conta.';

revoke all on function public.dashboard_summary(date, date, uuid[], text[], uuid[], uuid[], public.entity_status[]) from public, anon;
grant execute on function public.dashboard_summary(date, date, uuid[], text[], uuid[], uuid[], public.entity_status[]) to authenticated, service_role;
