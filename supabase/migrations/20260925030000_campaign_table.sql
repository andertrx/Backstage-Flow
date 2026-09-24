-- =============================================================================
-- ETAPA 9 — Tabela de campanhas
--
-- public.campaign_table(): uma linha por campanha com os números do período,
-- já calculados, ordenada e paginada NO BANCO (rápido com milhares de linhas).
--
--   * Números vêm de metrics_daily no nível "campanha", somados no período.
--   * Alcance só quando a plataforma informou o alcance DAQUELE período exato
--     (period_reach) — alcance diário não pode ser somado. Frequência idem.
--   * Sem linhas no período → has_data = false e números NULL (não viram zero).
--   * Taxas (CTR, CPC, CPM, CPL, CPA, ROAS) = NULL quando o divisor é zero ou
--     não informado. Mesma regra de packages/shared (formulas.ts / kpis.ts).
--   * Cada linha tem a moeda da sua conta (nunca soma BRL com USD).
--
-- Roda com a permissão de quem pergunta (RLS). Nenhuma tabela nova.
-- =============================================================================

create function public.campaign_table(
  p_from date,
  p_to date,
  p_client_ids uuid[] default null,
  p_platforms text[] default null,
  p_ad_account_ids uuid[] default null,
  p_statuses public.entity_status[] default null,
  p_search text default null,
  p_sort text default 'spend',
  p_desc boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  campaign_id uuid,
  name text,
  external_id text,
  client_id uuid,
  client_name text,
  platform_id text,
  ad_account_id uuid,
  account_name text,
  currency text,
  objective text,
  status public.entity_status,
  raw_status text,
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
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > 3700 then raise exception 'Período longo demais (máx. ~10 anos)'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then raise exception 'Tamanho de página inválido (1 a 200)'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'Página inválida'; end if;
  if p_sort not in ('name', 'client', 'platform', 'objective', 'status', 'budget', 'spend', 'impressions', 'reach', 'frequency',
                    'clicks', 'ctr', 'cpc', 'cpm', 'leads', 'messages', 'conversions', 'cpl', 'cpa', 'roas') then
    raise exception 'Coluna de ordenação inválida';
  end if;
  if q is not null then
    if char_length(q) > 100 then raise exception 'Busca longa demais'; end if;
    -- % e _ digitados são tratados como texto, não como curinga.
    pattern := '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with totals as (
    select m.campaign_id as cid,
           sum(m.spend_micros)::bigint as spend, sum(m.impressions)::bigint as impr, sum(m.clicks)::bigint as clk,
           sum(m.leads) as leads, sum(m.messages) as msgs, sum(m.conversions) as conv,
           sum(m.conversion_value_micros)::bigint as conv_value
    from public.metrics_daily m
    where m.level = 'campaign' and m.campaign_id is not null and m.date between p_from and p_to
      and (p_client_ids is null or m.client_id = any (p_client_ids))
      and (p_platforms is null or m.platform_id = any (p_platforms))
      and (p_ad_account_ids is null or m.ad_account_id = any (p_ad_account_ids))
    group by m.campaign_id
  ),
  base as (
    select c.id, c.name, c.external_id, c.client_id, cl.name as client_name, c.platform_id, c.ad_account_id,
           a.name as account_name, a.currency, c.objective, c.status, c.raw_status, c.budget_micros, c.budget_period,
           t.cid is not null as has_data, t.spend, t.impr, r.reach, t.clk, t.leads, t.msgs, t.conv, t.conv_value
    from public.campaigns c
    join public.clients cl on cl.id = c.client_id
    join public.ad_accounts a on a.id = c.ad_account_id
    left join totals t on t.cid = c.id
    left join public.period_reach r
      on r.ad_account_id = c.ad_account_id and r.level = 'campaign' and r.entity_external_id = c.external_id
     and r.period_start = p_from and r.period_end = p_to
    where (p_client_ids is null or c.client_id = any (p_client_ids))
      and (p_platforms is null or c.platform_id = any (p_platforms))
      and (p_ad_account_ids is null or c.ad_account_id = any (p_ad_account_ids))
      and (p_statuses is null or c.status = any (p_statuses))
      and (pattern is null or lower(c.name) like pattern or lower(cl.name) like pattern or c.external_id = q)
  ),
  calc as (
    select b.*,
           case when b.reach > 0 then round(b.impr::numeric / b.reach, 4) end as freq,
           case when b.impr > 0 then round(b.clk::numeric * 100 / b.impr, 4) end as ctr,
           case when b.clk > 0 then round(b.spend::numeric / b.clk, 2) end as cpc,
           case when b.impr > 0 then round(b.spend::numeric * 1000 / b.impr, 2) end as cpm,
           case when b.leads > 0 then round(b.spend::numeric / b.leads, 2) end as cpl,
           case when b.conv > 0 then round(b.spend::numeric / b.conv, 2) end as cpa,
           case when b.spend > 0 and b.conv_value > 0 then round(b.conv_value::numeric / b.spend, 4) end as roas
    from base b
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
           case p_sort
             when 'name' then lower(k.name) when 'client' then lower(k.client_name) when 'platform' then k.platform_id
             when 'objective' then lower(k.objective) when 'status' then k.status::text
           end as sort_txt
    from calc k
  )
  select k.id, k.name, k.external_id, k.client_id, k.client_name, k.platform_id, k.ad_account_id, k.account_name, k.currency,
         k.objective, k.status, k.raw_status, k.budget_micros, k.budget_period, k.has_data,
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

comment on function public.campaign_table(date, date, uuid[], text[], uuid[], public.entity_status[], text, text, boolean, integer, integer) is
  'Tabela de campanhas do período: números somados, taxas calculadas, ordenação e paginação no banco. Roda com o RLS do usuário.';

revoke all on function public.campaign_table(date, date, uuid[], text[], uuid[], public.entity_status[], text, text, boolean, integer, integer) from public, anon;
grant execute on function public.campaign_table(date, date, uuid[], text[], uuid[], public.entity_status[], text, text, boolean, integer, integer) to authenticated, service_role;
