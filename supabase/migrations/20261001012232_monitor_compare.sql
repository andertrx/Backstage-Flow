-- Etapa 37.2 — Monitoramento: comparação de períodos e série diária.
-- Só lê public.metrics_daily (o histórico diário permanente). Nenhuma tabela nova.
-- Regras: só clientes visíveis; linhas "superseded" não somam; moeda de cada conta
-- vem junto (quem soma é a tela, sempre dentro da mesma moeda); cobertura do
-- histórico (sync_state.history_from/to) diz se os dois períodos estão completos.

create or replace function private.monitor_compare_impl(
  p_level text, p_from date, p_to date, p_prev_from date, p_prev_to date,
  p_client_id uuid, p_platform text, p_account_id uuid, p_campaign_id uuid, p_limit integer
)
returns table (
  entity_key text, level text, entity_id uuid, name text, status text,
  client_id uuid, client_name text, platform_id text, ad_account_id uuid, account_name text, currency text, timezone text,
  campaign_id uuid, campaign_name text, objective text, ad_group_id uuid, ad_group_name text,
  thumbnail_url text, creative_type text, creative_external_id text, preview_link text, ads_count integer, first_seen_at timestamptz,
  cur_spend_micros bigint, cur_impressions bigint, cur_clicks bigint, cur_link_clicks bigint,
  cur_leads numeric, cur_messages numeric, cur_conversions numeric, cur_conversion_value_micros bigint, cur_days integer,
  prev_spend_micros bigint, prev_impressions bigint, prev_clicks bigint, prev_link_clicks bigint,
  prev_leads numeric, prev_messages numeric, prev_conversions numeric, prev_conversion_value_micros bigint, prev_days integer,
  coverage text, sync_status text, last_success_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_level public.entity_level;
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  if p_level is null or p_level not in ('account', 'campaign', 'ad_group', 'ad', 'creative') then
    raise exception 'Nível inválido.' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_prev_from is null or p_prev_to is null or p_to < p_from or p_prev_to < p_prev_from then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if p_to - p_from > 400 or p_prev_to - p_prev_from > 400 then
    raise exception 'Período longo demais (máximo de 400 dias).' using errcode = '22023';
  end if;
  if p_prev_to >= p_from and p_prev_from <= p_to then
    raise exception 'Os dois períodos não podem se sobrepor.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Quantidade inválida (1 a 1000).' using errcode = '22023';
  end if;
  v_level := case p_level when 'creative' then 'ad' else p_level end::public.entity_level;

  return query
  with vis as (select private.visible_client_ids() as id),
  m as (
    select x.*,
           case p_level
             when 'account' then x.ad_account_id::text
             when 'campaign' then x.campaign_id::text
             when 'ad_group' then x.ad_group_id::text
             when 'ad' then x.ad_id::text
             else x.ad_account_id::text || ':' || coalesce(d.creative_external_id, 'ad-' || x.ad_id::text)
           end as k,
           (x.date between p_from and p_to) as is_cur
      from public.metrics_daily x
      left join public.ads d on p_level = 'creative' and d.id = x.ad_id
     where x.level = v_level
       and not x.superseded
       and (x.date between p_from and p_to or x.date between p_prev_from and p_prev_to)
       and x.client_id in (select id from vis)
       and (p_client_id is null or x.client_id = p_client_id)
       and (p_platform is null or x.platform_id = p_platform)
       and (p_account_id is null or x.ad_account_id = p_account_id)
       and (p_campaign_id is null or x.campaign_id = p_campaign_id)
  ),
  agg as (
    select m.k,
           min(m.ad_account_id::text)::uuid as acc_id,
           (array_agg(m.campaign_id) filter (where m.campaign_id is not null))[1] as camp_id,
           (array_agg(m.ad_group_id) filter (where m.ad_group_id is not null))[1] as grp_id,
           (array_agg(m.ad_id order by m.date desc) filter (where m.ad_id is not null))[1] as last_ad_id,
           count(distinct m.ad_id)::int as n_ads,
           min(m.currency) as cur_currency,
           sum(m.spend_micros) filter (where m.is_cur)::bigint as c_spend,
           sum(m.impressions) filter (where m.is_cur)::bigint as c_impr,
           sum(m.clicks) filter (where m.is_cur)::bigint as c_clk,
           sum(m.link_clicks) filter (where m.is_cur)::bigint as c_link,
           sum(m.leads) filter (where m.is_cur) as c_leads,
           sum(m.messages) filter (where m.is_cur) as c_msgs,
           sum(m.conversions) filter (where m.is_cur) as c_conv,
           sum(m.conversion_value_micros) filter (where m.is_cur)::bigint as c_value,
           count(distinct m.date) filter (where m.is_cur)::int as c_days,
           sum(m.spend_micros) filter (where not m.is_cur)::bigint as p_spend,
           sum(m.impressions) filter (where not m.is_cur)::bigint as p_impr,
           sum(m.clicks) filter (where not m.is_cur)::bigint as p_clk,
           sum(m.link_clicks) filter (where not m.is_cur)::bigint as p_link,
           sum(m.leads) filter (where not m.is_cur) as p_leads,
           sum(m.messages) filter (where not m.is_cur) as p_msgs,
           sum(m.conversions) filter (where not m.is_cur) as p_conv,
           sum(m.conversion_value_micros) filter (where not m.is_cur)::bigint as p_value,
           count(distinct m.date) filter (where not m.is_cur)::int as p_days
      from m
     where m.k is not null
     group by m.k
  )
  select a.k,
         p_level,
         case p_level when 'account' then a.acc_id when 'campaign' then a.camp_id when 'ad_group' then a.grp_id
                      when 'ad' then a.last_ad_id else null end,
         case p_level
           when 'account' then acc.name
           when 'campaign' then cp.name
           when 'ad_group' then ag.name
           else ad.name
         end,
         case p_level
           when 'account' then acc.status::text
           when 'campaign' then cp.status::text
           when 'ad_group' then ag.status::text
           else ad.status::text
         end,
         acc.client_id, cl.name, acc.platform_id, a.acc_id, acc.name, coalesce(acc.currency, a.cur_currency), acc.timezone,
         a.camp_id, cp.name, cp.objective, a.grp_id, ag.name,
         ad.thumbnail_url, ad.creative_type, ad.creative_external_id, ad.preview_link,
         case when p_level = 'creative' then a.n_ads else null end,
         case p_level when 'account' then null when 'campaign' then cp.first_seen_at when 'ad_group' then ag.first_seen_at else ad.first_seen_at end,
         a.c_spend, a.c_impr, a.c_clk, a.c_link, a.c_leads, a.c_msgs, a.c_conv, a.c_value, coalesce(a.c_days, 0),
         a.p_spend, a.p_impr, a.p_clk, a.p_link, a.p_leads, a.p_msgs, a.p_conv, a.p_value, coalesce(a.p_days, 0),
         case
           when ss.history_from is null or ss.history_to is null then 'sem_historico'
           when ss.history_from <= p_prev_from and ss.history_to >= p_to then 'completa'
           else 'parcial'
         end,
         ss.status, ss.last_success_at
    from agg a
    join public.ad_accounts acc on acc.id = a.acc_id
    join public.clients cl on cl.id = acc.client_id
    left join public.campaigns cp on cp.id = a.camp_id
    left join public.ad_groups ag on ag.id = a.grp_id
    left join public.ads ad on ad.id = a.last_ad_id and p_level in ('ad', 'creative')
    left join public.sync_state ss on ss.ad_account_id = a.acc_id
   order by coalesce(a.c_spend, 0) + coalesce(a.p_spend, 0) desc, a.k
   limit p_limit;
end;
$$;
revoke all on function private.monitor_compare_impl(text, date, date, date, date, uuid, text, uuid, uuid, integer) from public, anon;
grant execute on function private.monitor_compare_impl(text, date, date, date, date, uuid, text, uuid, uuid, integer) to authenticated;

create or replace function public.monitor_compare(
  p_level text, p_from date, p_to date, p_prev_from date, p_prev_to date,
  p_client_id uuid default null, p_platform text default null, p_account_id uuid default null,
  p_campaign_id uuid default null, p_limit integer default 500
)
returns table (
  entity_key text, level text, entity_id uuid, name text, status text,
  client_id uuid, client_name text, platform_id text, ad_account_id uuid, account_name text, currency text, timezone text,
  campaign_id uuid, campaign_name text, objective text, ad_group_id uuid, ad_group_name text,
  thumbnail_url text, creative_type text, creative_external_id text, preview_link text, ads_count integer, first_seen_at timestamptz,
  cur_spend_micros bigint, cur_impressions bigint, cur_clicks bigint, cur_link_clicks bigint,
  cur_leads numeric, cur_messages numeric, cur_conversions numeric, cur_conversion_value_micros bigint, cur_days integer,
  prev_spend_micros bigint, prev_impressions bigint, prev_clicks bigint, prev_link_clicks bigint,
  prev_leads numeric, prev_messages numeric, prev_conversions numeric, prev_conversion_value_micros bigint, prev_days integer,
  coverage text, sync_status text, last_success_at timestamptz
)
language sql
stable
set search_path = ''
as $$ select * from private.monitor_compare_impl(p_level, p_from, p_to, p_prev_from, p_prev_to, p_client_id, p_platform, p_account_id, p_campaign_id, p_limit) $$;
revoke all on function public.monitor_compare(text, date, date, date, date, uuid, text, uuid, uuid, integer) from public, anon;
grant execute on function public.monitor_compare(text, date, date, date, date, uuid, text, uuid, uuid, integer) to authenticated;

-- Série diária de uma entidade (conta, campanha, conjunto, anúncio ou criativo).
-- p_key = o entity_key devolvido por monitor_compare. Dias sem linha = sem entrega
-- (a tela só trata como zero dentro do período coberto pelo histórico).
create or replace function private.monitor_daily_impl(p_level text, p_key text, p_from date, p_to date)
returns table (
  date date, spend_micros bigint, impressions bigint, clicks bigint, link_clicks bigint,
  leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_acc uuid;
  v_creative text;
  v_client uuid;
begin
  if not private.monitor_can('view') then
    raise exception 'Sem permissão para ver o monitoramento' using errcode = '42501';
  end if;
  if p_level is null or p_level not in ('account', 'campaign', 'ad_group', 'ad', 'creative') or coalesce(p_key, '') = '' then
    raise exception 'Nível inválido.' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Período inválido (máximo de 400 dias).' using errcode = '22023';
  end if;

  begin
    if p_level = 'creative' then
      v_acc := split_part(p_key, ':', 1)::uuid;
      v_creative := nullif(substr(p_key, length(split_part(p_key, ':', 1)) + 2), '');
    else
      v_id := p_key::uuid;
    end if;
  exception when invalid_text_representation then
    raise exception 'Item não encontrado' using errcode = '22023';
  end;

  v_client := case p_level
    when 'account' then (select a.client_id from public.ad_accounts a where a.id = v_id)
    when 'campaign' then (select c.client_id from public.campaigns c where c.id = v_id)
    when 'ad_group' then (select g.client_id from public.ad_groups g where g.id = v_id)
    when 'ad' then (select d.client_id from public.ads d where d.id = v_id)
    else (select a.client_id from public.ad_accounts a where a.id = v_acc)
  end;
  if v_client is null or not private.can_view_client(v_client) or v_creative is null and p_level = 'creative' then
    raise exception 'Item não encontrado' using errcode = '22023';
  end if;

  return query
    select x.date, sum(x.spend_micros)::bigint, sum(x.impressions)::bigint, sum(x.clicks)::bigint, sum(x.link_clicks)::bigint,
           sum(x.leads), sum(x.messages), sum(x.conversions), sum(x.conversion_value_micros)::bigint
      from public.metrics_daily x
     where not x.superseded
       and x.date between p_from and p_to
       and case p_level
             when 'account' then x.level = 'account' and x.ad_account_id = v_id
             when 'campaign' then x.level = 'campaign' and x.campaign_id = v_id
             when 'ad_group' then x.level = 'ad_group' and x.ad_group_id = v_id
             when 'ad' then x.level = 'ad' and x.ad_id = v_id
             else x.level = 'ad' and x.ad_account_id = v_acc
                  and x.ad_id in (select d.id from public.ads d where d.ad_account_id = v_acc
                                    and (d.creative_external_id = v_creative or 'ad-' || d.id::text = v_creative))
           end
     group by x.date
     order by x.date;
end;
$$;
revoke all on function private.monitor_daily_impl(text, text, date, date) from public, anon;
grant execute on function private.monitor_daily_impl(text, text, date, date) to authenticated;

create or replace function public.monitor_daily(p_level text, p_key text, p_from date, p_to date)
returns table (
  date date, spend_micros bigint, impressions bigint, clicks bigint, link_clicks bigint,
  leads numeric, messages numeric, conversions numeric, conversion_value_micros bigint
)
language sql
stable
set search_path = ''
as $$ select * from private.monitor_daily_impl(p_level, p_key, p_from, p_to) $$;
revoke all on function public.monitor_daily(text, text, date, date) from public, anon;
grant execute on function public.monitor_daily(text, text, date, date) to authenticated;
