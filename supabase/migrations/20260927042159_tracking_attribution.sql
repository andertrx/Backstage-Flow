-- =============================================================================
-- Etapa 34.4 — Tracking: atribuição por campanha e qualidade do tracking
--
-- Só ACRESCENTA funções de leitura (nenhuma tabela nova). Rodam com a permissão
-- de quem pergunta (RLS): cada pessoa só vê os clientes liberados para ela.
-- Remoção: supabase/rollback/remover_tracking.sql
--
--   tracking_attribution(de, até, modelo)
--     Leads e compras do período (por cliente), cada um creditado a UMA origem:
--       modelo 'first' = primeiro contato; 'last' = último contato.
--     A origem é ligada à campanha do CRM:
--       1) pelo ID da campanha que veio no link (bf_c / {{campaign.id}}) → "id";
--       2) senão, pelo nome em utm_campaign, só se houver UMA campanha com esse
--          nome no mesmo cliente e plataforma → "nome".
--     Ao lado: investimento e o que a própria plataforma contou (leads,
--     conversões, valor) na mesma campanha e período. Moedas nunca somadas.
--     Campanhas com investimento e nenhuma conversão no site também aparecem.
--
--   tracking_quality(de, até)
--     Contagens por site para a tela explicar a qualidade do tracking
--     (anúncios sem ID da campanha, leads sem origem, compras sem nº de pedido…).
--
-- Datas das métricas: o período (de/até) é convertido para dias no fuso do
-- cliente (clients.timezone), igual ao que o CRM mostra no resto das telas.
-- =============================================================================

create function public.tracking_attribution(p_from timestamptz, p_to timestamptz, p_model text default 'last')
returns table (
  client_id uuid,
  channel text,
  campaign_id uuid,
  campaign_label text,
  match text,
  leads bigint,
  purchases bigint,
  confirmed bigint,
  revenue jsonb,
  spend_currency text,
  spend_micros bigint,
  platform_leads numeric,
  platform_conversions numeric,
  platform_value_micros bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Período inválido'; end if;
  if p_to - p_from > interval '400 days' then raise exception 'Período longo demais (máx. 400 dias)'; end if;
  if p_model not in ('first', 'last') then raise exception 'Modelo de atribuição inválido'; end if;

  return query
  with conv as (
    select l.container_id, l.client_id, case when p_model = 'first' then l.first_touch_id else l.last_touch_id end as tid,
           true as is_lead, null::text as cur, 0::bigint as val
      from public.tracking_leads l
     where l.first_converted_at >= p_from and l.first_converted_at < p_to
    union all
    select pu.container_id, pu.client_id, case when p_model = 'first' then pu.first_touch_id else pu.last_touch_id end,
           false, pu.currency, pu.value_micros
      from public.tracking_purchases pu
     where pu.occurred_at >= p_from and pu.occurred_at < p_to
  ),
  tagged as (
    select c.*, t.channel as ch, t.evidence, t.ad_campaign_id, t.utm_campaign,
           case t.channel when 'meta' then 'meta' when 'google' then 'google' end as plat
      from conv c
      left join public.tracking_touchpoints t on t.id = c.tid
  ),
  matched as (
    select g.*, coalesce(bi.id, bn.id) as cid, case when bi.id is not null then 'id' when bn.id is not null then 'nome' end as how,
           coalesce(bi.id::text, bn.id::text, 'id:' || g.ad_campaign_id, 'utm:' || lower(g.utm_campaign), '') as gkey
      from tagged g
      left join lateral (
        select c.id from public.campaigns c
         where g.plat is not null and g.ad_campaign_id is not null
           and c.client_id = g.client_id and c.platform_id = g.plat and c.external_id = g.ad_campaign_id
         order by c.last_seen_at desc nulls last limit 1
      ) bi on true
      left join lateral (
        select (array_agg(c.id))[1] as id from public.campaigns c
         where bi.id is null and g.plat is not null and g.utm_campaign is not null
           and c.client_id = g.client_id and c.platform_id = g.plat and lower(c.name) = lower(g.utm_campaign)
        having count(distinct c.external_id) = 1
      ) bn on true
  ),
  rev as (
    select m.client_id, m.ch, m.gkey, jsonb_object_agg(m.cur, m.total) as revenue
      from (select client_id, ch, gkey, cur, sum(val)::bigint as total from matched where not is_lead group by 1, 2, 3, 4) m
     group by 1, 2, 3
  ),
  agg as (
    select m.client_id, m.ch, m.gkey, max(m.cid::text)::uuid as cid, max(m.how) as how,
           max(coalesce(m.utm_campaign, case when m.ad_campaign_id is not null then 'ID ' || m.ad_campaign_id end)) as label,
           count(*) filter (where m.is_lead) as leads, count(*) filter (where not m.is_lead) as purchases,
           count(*) filter (where m.evidence = 'confirmada') as confirmed
      from matched m
     group by m.client_id, m.ch, m.gkey
  ),
  tracked_clients as (select distinct k.client_id from public.tracking_containers k),
  spend as (
    select md.campaign_id as cid, md.client_id, min(md.currency) as currency, sum(md.spend_micros)::bigint as spend,
           sum(md.leads) as p_leads, sum(md.conversions) as p_conv, sum(md.conversion_value_micros)::bigint as p_value
      from public.metrics_daily md
      join public.clients cl on cl.id = md.client_id
     where md.level = 'campaign' and md.campaign_id is not null
       and md.client_id in (select tc.client_id from tracked_clients tc)
       and md.date between (p_from - interval '1 day')::date and (p_to + interval '1 day')::date
       and md.date between (p_from at time zone cl.timezone)::date and ((p_to - interval '1 microsecond') at time zone cl.timezone)::date
     group by md.campaign_id, md.client_id
  )
  select coalesce(a.client_id, s.client_id),
         coalesce(a.ch, cp.platform_id),
         coalesce(a.cid, s.cid),
         coalesce(cp.name, a.label),
         case when a.cid is null and s.cid is not null then 'sem_conversao' else a.how end,
         coalesce(a.leads, 0), coalesce(a.purchases, 0), coalesce(a.confirmed, 0),
         coalesce(r.revenue, '{}'::jsonb),
         s.currency, s.spend, s.p_leads, s.p_conv, s.p_value
    from agg a
    full join spend s on s.cid = a.cid
    left join rev r on r.client_id = a.client_id and r.ch is not distinct from a.ch and r.gkey = a.gkey
    left join public.campaigns cp on cp.id = coalesce(a.cid, s.cid)
   where a.client_id is not null or coalesce(s.spend, 0) > 0
   order by coalesce(a.leads, 0) + coalesce(a.purchases, 0) desc, s.spend desc nulls last;
end;
$$;
revoke all on function public.tracking_attribution(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.tracking_attribution(timestamptz, timestamptz, text) to authenticated, service_role;

create function public.tracking_quality(p_from timestamptz, p_to timestamptz)
returns table (
  container_id uuid,
  sessions bigint,
  sessions_unknown bigint,
  paid_sessions bigint,
  paid_without_campaign_id bigint,
  leads bigint,
  leads_without_origin bigint,
  leads_with_contact bigint,
  purchases bigint,
  purchases_without_order bigint,
  purchases_without_lead bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.id,
         s.total, s.unknown, s.paid, s.paid_no_id,
         l.total, l.no_origin, l.contact,
         p.total, p.no_order, p.no_lead
    from public.tracking_containers k
    cross join lateral (
      select count(*) as total,
             count(*) filter (where t.id is null or t.evidence = 'desconhecida') as unknown,
             count(*) filter (where t.paid) as paid,
             count(*) filter (where t.paid and t.channel in ('meta', 'google') and t.ad_campaign_id is null) as paid_no_id
        from public.tracking_sessions ss
        left join public.tracking_touchpoints t on t.id = ss.touchpoint_id
       where ss.container_id = k.id and ss.started_at >= p_from and ss.started_at < p_to
    ) s
    cross join lateral (
      select count(*) as total,
             count(*) filter (where t.id is null or t.evidence = 'desconhecida') as no_origin,
             count(*) filter (where ll.em_hash is not null or ll.ph_hash is not null) as contact
        from public.tracking_leads ll
        left join public.tracking_touchpoints t on t.id = ll.first_touch_id
       where ll.container_id = k.id and ll.first_converted_at >= p_from and ll.first_converted_at < p_to
    ) l
    cross join lateral (
      select count(*) as total,
             count(*) filter (where pu.transaction_id is null) as no_order,
             count(*) filter (where pu.lead_id is null) as no_lead
        from public.tracking_purchases pu
       where pu.container_id = k.id and pu.occurred_at >= p_from and pu.occurred_at < p_to
    ) p
   where p_to > p_from and p_to - p_from <= interval '400 days'
$$;
revoke all on function public.tracking_quality(timestamptz, timestamptz) from public, anon;
grant execute on function public.tracking_quality(timestamptz, timestamptz) to authenticated, service_role;
