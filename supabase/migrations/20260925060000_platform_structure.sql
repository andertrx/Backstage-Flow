-- =============================================================================
-- ETAPA 13 — Visão Meta Ads (e, na Etapa 14, Google Ads)
--
-- Nenhuma tabela nova. Uma consulta:
--   * public.platform_structure() → quantas campanhas, conjuntos/grupos e
--     anúncios existem em cada status, numa plataforma, com os filtros de
--     cliente, conta e campanha. Só conta contas VINCULADAS.
--
-- Roda COM A PERMISSÃO DE QUEM PERGUNTA (security invoker): o RLS decide
-- quais clientes entram na contagem.
-- =============================================================================

create function public.platform_structure(
  p_platform text,
  p_client_ids uuid[] default null,
  p_ad_account_ids uuid[] default null,
  p_campaign_ids uuid[] default null
)
returns table (level public.entity_level, status public.entity_status, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with accs as (
    select a.id
    from public.ad_accounts a
    where a.platform_id = p_platform
      and a.unlinked_at is null
      and (p_client_ids is null or a.client_id = any (p_client_ids))
      and (p_ad_account_ids is null or a.id = any (p_ad_account_ids))
  )
  select 'campaign'::public.entity_level, c.status, count(*)
  from public.campaigns c
  where c.ad_account_id in (select id from accs)
    and (p_campaign_ids is null or c.id = any (p_campaign_ids))
  group by c.status
  union all
  select 'ad_group'::public.entity_level, g.status, count(*)
  from public.ad_groups g
  where g.ad_account_id in (select id from accs)
    and (p_campaign_ids is null or g.campaign_id = any (p_campaign_ids))
  group by g.status
  union all
  select 'ad'::public.entity_level, d.status, count(*)
  from public.ads d
  where d.ad_account_id in (select id from accs)
    and (p_campaign_ids is null or d.campaign_id = any (p_campaign_ids))
  group by d.status
  order by 1, 2;
$$;

comment on function public.platform_structure(text, uuid[], uuid[], uuid[]) is
  'Quantidade de campanhas, conjuntos/grupos e anúncios por status numa plataforma (contas vinculadas). Roda com o RLS do usuário.';

revoke all on function public.platform_structure(text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.platform_structure(text, uuid[], uuid[], uuid[]) to authenticated, service_role;
