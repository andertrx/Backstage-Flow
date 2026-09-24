-- =============================================================================
-- ETAPA 10 — Conjuntos/grupos e anúncios
--
-- public.entity_rows(): números do período para campanhas, conjuntos/grupos
-- ou anúncios — a mesma regra de public.campaign_table, para qualquer nível:
--   * p_level = 'campaign' | 'ad_group' | 'ad'
--   * p_parent_id → filhos de um item (conjuntos de uma campanha, anúncios de um conjunto)
--   * p_ids       → itens específicos (resumo da página de detalhe)
--   Um dos dois é obrigatório (nunca lista "todos os anúncios" de uma vez).
-- Alcance só do período exato (period_reach). Sem dados → NULL, não zero.
-- Roda com a permissão de quem pergunta (RLS). Nenhuma tabela nova.
--
-- Índices novos em metrics_daily para buscar por conjunto e por anúncio.
-- =============================================================================

create index if not exists metrics_daily_ad_group_date_idx on public.metrics_daily (ad_group_id, date) where ad_group_id is not null;
create index if not exists metrics_daily_ad_date_idx on public.metrics_daily (ad_id, date) where ad_id is not null;

create function public.entity_rows(
  p_level public.entity_level,
  p_from date,
  p_to date,
  p_parent_id uuid default null,
  p_ids uuid[] default null,
  p_statuses public.entity_status[] default null,
  p_search text default null,
  p_sort text default 'spend',
  p_desc boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  level public.entity_level,
  name text,
  external_id text,
  parent_id uuid,
  campaign_id uuid,
  client_id uuid,
  platform_id text,
  ad_account_id uuid,
  currency text,
  status public.entity_status,
  raw_status text,
  detail text,
  review_status text,
  thumbnail_url text,
  budget_micros bigint,
  budget_period text,
  has_data boolean,
  spend_micros bigint,
  impressions bigint,
  reach bigint,
  frequency numeric,
  clicks bigint,
  ctr numeric,
  cpc_micros numeric,
  cpm_micros numeric,
  leads numeric,
  messages numeric,
  conversions numeric,
  conversion_value_micros bigint,
  cpl_micros numeric,
  cpa_micros numeric,
  roas numeric,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  q text := nullif(btrim(coalesce(p_search, '')), '');
  pattern text;
begin
  if p_level not in ('campaign', 'ad_group', 'ad') then raise exception 'Nível inválido'; end if;
  if p_parent_id is null and p_ids is null then raise exception 'Informe o item pai ou os itens'; end if;
  if p_level = 'campaign' and p_parent_id is not null then raise exception 'Campanha não tem item pai nesta consulta'; end if;
  if p_ids is not null and cardinality(p_ids) > 200 then raise exception 'Itens demais (máx. 200)'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 3700 then raise exception 'Período longo demais (máx. ~10 anos)'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then raise exception 'Tamanho de página inválido (1 a 200)'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'Página inválida'; end if;
  if p_sort not in ('name', 'status', 'budget', 'spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm',
                    'leads', 'messages', 'conversions', 'cpl', 'cpa', 'roas') then
    raise exception 'Coluna de ordenação inválida';
  end if;
  if q is not null then
    if char_length(q) > 100 then raise exception 'Busca longa demais'; end if;
    pattern := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with ents as (
    select c.id, c.name, c.external_id, null::uuid as parent_id, c.id as campaign_id, c.client_id, c.platform_id, c.ad_account_id,
           c.status, c.raw_status, c.objective as detail, null::text as review_status, null::text as thumbnail_url,
           c.budget_micros, c.budget_period
    from public.campaigns c
    where p_level = 'campaign' and c.id = any (p_ids)
    union all
    select g.id, g.name, g.external_id, g.campaign_id, g.campaign_id, g.client_id, g.platform_id, g.ad_account_id,
           g.status, g.raw_status, g.optimization_goal, null, null, g.budget_micros, g.budget_period
    from public.ad_groups g
    where p_level = 'ad_group' and (p_parent_id is null or g.campaign_id = p_parent_id) and (p_ids is null or g.id = any (p_ids))
    union all
    select a.id, a.name, a.external_id, a.ad_group_id, a.campaign_id, a.client_id, a.platform_id, a.ad_account_id,
           a.status, a.raw_status, a.creative_type, a.review_status, a.thumbnail_url, null, null
    from public.ads a
    where p_level = 'ad' and (p_parent_id is null or a.ad_group_id = p_parent_id) and (p_ids is null or a.id = any (p_ids))
  ),
  filtered as (
    select e.* from ents e
    where (p_statuses is null or e.status = any (p_statuses))
      and (pattern is null or lower(e.name) like pattern or e.external_id = q)
  ),
  totals as (
    select (case p_level when 'campaign' then m.campaign_id when 'ad_group' then m.ad_group_id else m.ad_id end) as eid,
           sum(m.spend_micros)::bigint as spend, sum(m.impressions)::bigint as impr, sum(m.clicks)::bigint as clk,
           sum(m.leads) as leads, sum(m.messages) as msgs, sum(m.conversions) as conv,
           sum(m.conversion_value_micros)::bigint as conv_value
    from public.metrics_daily m
    where m.level = p_level and m.date between p_from and p_to
      and m.ad_account_id in (select f.ad_account_id from filtered f)
      and (case p_level when 'campaign' then m.campaign_id when 'ad_group' then m.ad_group_id else m.ad_id end) in (select f.id from filtered f)
    group by 1
  ),
  calc as (
    select f.*, acc.currency, t.eid is not null as has_data, t.spend, t.impr, r.reach, t.clk, t.leads, t.msgs, t.conv, t.conv_value,
           case when r.reach > 0 then round(t.impr::numeric / r.reach, 4) end as freq,
           case when t.impr > 0 then round(t.clk::numeric * 100 / t.impr, 4) end as ctr,
           case when t.clk > 0 then round(t.spend::numeric / t.clk, 2) end as cpc,
           case when t.impr > 0 then round(t.spend::numeric * 1000 / t.impr, 2) end as cpm,
           case when t.leads > 0 then round(t.spend::numeric / t.leads, 2) end as cpl,
           case when t.conv > 0 then round(t.spend::numeric / t.conv, 2) end as cpa,
           case when t.spend > 0 and t.conv_value > 0 then round(t.conv_value::numeric / t.spend, 4) end as roas
    from filtered f
    join public.ad_accounts acc on acc.id = f.ad_account_id
    left join totals t on t.eid = f.id
    left join public.period_reach r
      on r.ad_account_id = f.ad_account_id and r.level = p_level and r.entity_external_id = f.external_id
     and r.period_start = p_from and r.period_end = p_to
  ),
  keyed as (
    select k.*,
           case p_sort
             when 'budget' then k.budget_micros::numeric when 'spend' then k.spend::numeric
             when 'impressions' then k.impr::numeric when 'reach' then k.reach::numeric when 'frequency' then k.freq
             when 'clicks' then k.clk::numeric when 'ctr' then k.ctr when 'cpc' then k.cpc when 'cpm' then k.cpm
             when 'leads' then k.leads when 'messages' then k.msgs when 'conversions' then k.conv
             when 'cpl' then k.cpl when 'cpa' then k.cpa when 'roas' then k.roas
           end as sort_num,
           case p_sort when 'name' then lower(k.name) when 'status' then k.status::text end as sort_txt
    from calc k
  )
  select k.id, p_level, k.name, k.external_id, k.parent_id, k.campaign_id, k.client_id, k.platform_id, k.ad_account_id, k.currency,
         k.status, k.raw_status, k.detail, k.review_status, k.thumbnail_url, k.budget_micros, k.budget_period, k.has_data,
         k.spend, k.impr, k.reach, k.freq, k.clk, k.ctr, k.cpc, k.cpm, k.leads, k.msgs, k.conv, k.conv_value,
         k.cpl, k.cpa, k.roas, count(*) over ()
  from keyed k
  order by
    case when p_desc then k.sort_num end desc nulls last,
    case when not p_desc then k.sort_num end asc nulls last,
    case when p_desc then k.sort_txt end desc nulls last,
    case when not p_desc then k.sort_txt end asc nulls last,
    lower(k.name), k.id
  limit p_limit offset p_offset;
end;
$$;

comment on function public.entity_rows(public.entity_level, date, date, uuid, uuid[], public.entity_status[], text, text, boolean, integer, integer) is
  'Números do período para campanhas, conjuntos/grupos ou anúncios (filhos de um item ou itens específicos). Roda com o RLS do usuário.';

revoke all on function public.entity_rows(public.entity_level, date, date, uuid, uuid[], public.entity_status[], text, text, boolean, integer, integer) from public, anon;
grant execute on function public.entity_rows(public.entity_level, date, date, uuid, uuid[], public.entity_status[], text, text, boolean, integer, integer) to authenticated, service_role;
