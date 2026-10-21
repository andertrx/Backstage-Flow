-- =============================================================================
-- Inteligência de Resultados — nova apresentação por perfil (pedido do Ander, 21/10/2026).
-- A função de resultados passa a trazer, para cada campanha/conjunto/criativo, os Leads e
-- as Mensagens que o Meta/Google informa no mesmo período (ao lado dos perfis da planilha).
-- Ponto de volta: supabase/rollback/voltar_ri_apresentacao_2026_10_21.sql. Nenhuma tabela nova.
-- =============================================================================
create or replace function private.ri_results_impl(
  p_client_id uuid, p_from date, p_to date, p_level text, p_campaign_id uuid, p_ad_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_client_id is null or not private.ri_can_view(p_client_id) then
    raise exception 'Sem permissão para ver os resultados deste cliente.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Período inválido (máximo de 400 dias).' using errcode = '22023';
  end if;
  if p_level is null or p_level not in ('campaign', 'ad_group', 'ad') then
    raise exception 'Nível inválido.' using errcode = '22023';
  end if;

  with
  allr as (select * from private.ri_rows(p_client_id)),
  pr as (select * from allr where contact_date between p_from and p_to),
  -- recorte do ranking (abrir campanha → conjuntos → anúncios)
  scope as (
    select * from pr
    where (p_campaign_id is null or campaign_id = p_campaign_id)
      and (p_ad_group_id is null or ad_group_id = p_ad_group_id)
  ),
  lvl as (
    select s.*, case p_level when 'campaign' then s.campaign_id when 'ad_group' then s.ad_group_id else s.ad_id end ent
    from scope s
  ),
  counts as (
    select ent,
           count(distinct contact) contacts,
           count(distinct contact) filter (where profile = 'lojista') lojista,
           count(distinct contact) filter (where profile = 'sacoleiro') sacoleiro,
           count(distinct contact) filter (where profile = 'consumidor_final') consumidor_final,
           count(distinct contact) filter (where profile = 'nao_identificado') nao_identificado,
           count(*) filter (where match_method = 'nome') by_name
    from lvl where ent is not null group by ent
  ),
  spend as (
    select case p_level when 'campaign' then m.campaign_id when 'ad_group' then m.ad_group_id else m.ad_id end ent,
           m.currency, sum(m.spend_micros) spend_micros
    from public.metrics_daily m
    where m.client_id = p_client_id and m.date between p_from and p_to and not m.superseded
      and m.level = p_level::public.entity_level
      and case p_level when 'campaign' then m.campaign_id when 'ad_group' then m.ad_group_id else m.ad_id end in (select ent from counts)
    group by 1, 2
  ),
  -- Leads e mensagens que o Meta/Google informa para o item no mesmo período (null = sem dado da plataforma).
  meta as (
    select case p_level when 'campaign' then m.campaign_id when 'ad_group' then m.ad_group_id else m.ad_id end ent,
           sum(m.leads) leads, sum(m.messages) messages
    from public.metrics_daily m
    where m.client_id = p_client_id and m.date between p_from and p_to and not m.superseded
      and m.level = p_level::public.entity_level
      and case p_level when 'campaign' then m.campaign_id when 'ad_group' then m.ad_group_id else m.ad_id end in (select ent from counts)
    group by 1
  ),
  items as (
    select jsonb_build_object(
             'id', k.ent,
             'name', coalesce(a.name, g.name, c.name),
             'status', coalesce(a.status, g.status, c.status),
             'platform_id', coalesce(a.platform_id, g.platform_id, c.platform_id),
             'campaign_id', coalesce(a.campaign_id, g.campaign_id, c.id),
             'campaign_name', cc.name,
             'ad_group_id', coalesce(a.ad_group_id, g.id),
             'ad_group_name', gg.name,
             'thumbnail_url', a.thumbnail_url,
             'contacts', k.contacts, 'lojista', k.lojista, 'sacoleiro', k.sacoleiro,
             'consumidor_final', k.consumidor_final, 'nao_identificado', k.nao_identificado,
             'by_name', k.by_name,
             'leads', (select mt.leads from meta mt where mt.ent = k.ent),
             'messages', (select mt.messages from meta mt where mt.ent = k.ent),
             'spend', coalesce((select jsonb_agg(jsonb_build_object('currency', sp.currency, 'spend_micros', sp.spend_micros) order by sp.currency)
                                from spend sp where sp.ent = k.ent), '[]'::jsonb)
           ) item, k.contacts
    from counts k
    left join public.campaigns c on p_level = 'campaign' and c.id = k.ent
    left join public.ad_groups g on p_level = 'ad_group' and g.id = k.ent
    left join public.ads a on p_level = 'ad' and a.id = k.ent
    left join public.campaigns cc on cc.id = coalesce(a.campaign_id, g.campaign_id, c.id)
    left join public.ad_groups gg on gg.id = coalesce(a.ad_group_id, g.id)
  )
  select jsonb_build_object(
    'read_at', (select max(read_at) from public.ri_snapshots where client_id = p_client_id),
    'sources', (select count(*) from public.ri_snapshots where client_id = p_client_id),
    'totals', (
      select jsonb_build_object(
        'rows', count(*),
        'contacts', count(distinct contact),
        'lojista', count(distinct contact) filter (where profile = 'lojista'),
        'sacoleiro', count(distinct contact) filter (where profile = 'sacoleiro'),
        'consumidor_final', count(distinct contact) filter (where profile = 'consumidor_final'),
        'nao_identificado', count(distinct contact) filter (where profile = 'nao_identificado'),
        'with_origin', count(distinct contact) filter (where match_level is not null),
        'origin_ad', count(*) filter (where match_level = 'anuncio'),
        'origin_ad_group', count(*) filter (where match_level = 'conjunto'),
        'origin_campaign', count(*) filter (where match_level = 'campanha'),
        'origin_by_name', count(*) filter (where match_method = 'nome'),
        'no_origin', count(*) filter (where match_issue = 'sem_origem'),
        'not_found', count(*) filter (where match_issue = 'nao_encontrada'),
        'ambiguous', count(*) filter (where match_issue = 'nome_ambiguo'))
      from pr),
    'outside', (select jsonb_build_object('no_date', count(*) filter (where contact_date is null),
                                          'all_rows', count(*)) from allr),
    'level', p_level,
    'scope_contacts', (select count(distinct contact) from scope),
    -- contatos do recorte que não têm nenhum item identificado neste nível
    'scope_without_level', (select count(distinct contact) from scope) - (select count(distinct contact) from lvl where ent is not null),
    'items', coalesce((select jsonb_agg(item order by contacts desc) from items), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
